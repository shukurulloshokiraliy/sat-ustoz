/**
 * Placement test engine. The test JSON (placement_test.json, or a teacher upload stored in settings)
 * is the single source of truth: items, timers, CEFR bands, estimate/projection formulas and advice.
 * Everything here is pure (no DB) so it is easy to test.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_TEST = JSON.parse(fs.readFileSync(path.join(__dirname, 'placement_test.json'), 'utf8'));

const round10 = (n) => Math.round(n / 10) * 10;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/** “Ignore capital letters, extra spaces, and curly vs straight apostrophes.” */
export const normalizeWritten = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!]+$/, '');

export function validateTest(t) {
  const errs = [];
  if (!t || typeof t !== 'object') return ['Not a JSON object'];
  if (!Array.isArray(t.sections) || !t.sections.length) errs.push('“sections” must be a non-empty list');
  if (!Array.isArray(t.items) || !t.items.length) errs.push('“items” must be a non-empty list');
  const secIds = new Set((t.sections || []).map((s) => s.id));
  const ids = new Set();
  (t.items || []).forEach((it, i) => {
    const at = `item ${i + 1}${it?.id ? ` (${it.id})` : ''}`;
    if (!it?.id) errs.push(`${at}: missing id`);
    else if (ids.has(it.id)) errs.push(`${at}: duplicate id`);
    ids.add(it?.id);
    if (!secIds.has(it?.section)) errs.push(`${at}: unknown section “${it?.section}”`);
    if (it?.format === 'mc') {
      if (!Array.isArray(it.options) || it.options.length < 2) errs.push(`${at}: needs at least 2 options`);
      if (!Number.isInteger(it.answer) || it.answer < 0 || it.answer >= (it.options?.length || 0)) errs.push(`${at}: “answer” must be an option index`);
    } else if (it?.format === 'written') {
      if (!Array.isArray(it.accepted) || !it.accepted.length) errs.push(`${at}: written items need an “accepted” list`);
    } else errs.push(`${at}: format must be “mc” or “written”`);
  });
  const g = t.scoring?.grammar;
  if (!Array.isArray(g?.cefr_bands) || !g.cefr_bands.length) errs.push('scoring.grammar.cefr_bands is required');
  if (!Array.isArray(t.scoring?.projection?.rules)) errs.push('scoring.projection.rules is required');
  if (!t.advice?.by_level) errs.push('advice.by_level is required');
  return errs.slice(0, 12);
}

/** Sections with their items, without answers or explanations — safe to send before the test ends. */
export function publicTest(t) {
  return {
    id: t.id, title: t.title, version: t.version,
    sections: t.sections.map((s) => ({
      id: s.id, title: s.title, description: s.description, time_limit_minutes: s.time_limit_minutes || 0,
      count: t.items.filter((it) => it.section === s.id).length,
      items: t.items.filter((it) => it.section === s.id).map((it) => ({
        id: it.id, format: it.format, level: it.level, prompt: it.prompt, passage: it.passage || '',
        options: it.format === 'mc' ? it.options : undefined, table: it.table, notes: it.notes,
        domain: it.domain, sat_type: it.sat_type,
      })),
    })),
    note_for_students: t.scoring?.current_estimate?.note_for_students || '',
  };
}

export function isCorrect(item, answer) {
  if (answer == null || answer === '') return false;
  if (item.format === 'mc') return Number(answer) === item.answer;
  const a = normalizeWritten(answer);
  return item.accepted.some((x) => normalizeWritten(x) === a);
}

/** Full scoring exactly as described in test.scoring and test.advice. */
export function scorePlacement(t, answers = {}) {
  const items = t.items.map((it) => ({ ...it, correct: isCorrect(it, answers[it.id]) }));
  const grammar = items.filter((i) => i.section === 'grammar');
  const sat = items.filter((i) => i.section === 'sat');
  const grammarPoints = grammar.filter((i) => i.correct).length;
  const satPoints = sat.filter((i) => i.correct).length;

  const bands = t.scoring.grammar.cefr_bands;
  const band = bands.find((b) => grammarPoints >= b.min && grammarPoints <= b.max) || (grammarPoints > bands.at(-1).max ? bands.at(-1) : bands[0]);
  const level = band.level;
  const order = bands.map((b) => b.level);
  const minLevel = t.scoring.grammar.admission_minimum_level;
  const advice = t.advice.by_level[level] || {};
  const admitted = typeof advice.admitted === 'boolean' ? advice.admitted : order.indexOf(level) >= order.indexOf(minLevel);

  // midpoint = 300 + 6 × grammar_points + 20 × sat_points; round to nearest 10; range = ±30; clamp 200–800
  const midpoint = clamp(round10(300 + 6 * grammarPoints + 20 * satPoints), 200, 800);
  const estimate = { midpoint, low: clamp(midpoint - 30, 200, 800), high: clamp(midpoint + 30, 200, 800) };

  const rule = t.scoring.projection.rules.find((r) => midpoint < r.if_midpoint_below) || t.scoring.projection.rules.at(-1);
  const projection = { low: Math.min(800, round10(midpoint + rule.gain_min)), high: Math.min(800, round10(midpoint + rule.gain_max)) };

  // weak areas: grammar skill missed ≥ 2 (max 3), every missed SAT type (max 4), most-missed first
  const skillStats = {};
  for (const i of grammar) {
    const s = (skillStats[i.skill] ||= { key: i.skill, missed: 0, total: 0 });
    s.total++;
    if (!i.correct) s.missed++;
  }
  const weakGrammar = Object.values(skillStats)
    .filter((s) => s.missed >= 2)
    .sort((a, b) => b.missed - a.missed)
    .slice(0, 3)
    .map((s) => ({ ...s, ...(t.advice.by_grammar_skill?.[s.key] || { label: s.key }) }));
  const typeStats = {};
  sat.forEach((i, idx) => {
    if (i.correct) return;
    const s = (typeStats[i.sat_type] ||= { key: i.sat_type, missed: 0, first: idx });
    s.missed++;
  });
  const weakSat = Object.values(typeStats)
    .sort((a, b) => b.missed - a.missed || a.first - b.first)
    .slice(0, 4)
    .map(({ first, ...s }) => ({ ...s, ...(t.advice.by_sat_type?.[s.key] || { label: s.key }) }));

  return {
    grammar: { points: grammarPoints, total: grammar.length, level, bands, admission_minimum_level: minLevel },
    sat: { points: satPoints, total: sat.length },
    admitted,
    advice: { headline: advice.headline || '', message: advice.message || '', uz: advice.uz || '' },
    estimate, projection,
    notes: {
      estimate: t.scoring.current_estimate?.note_for_students || '',
      projection: t.scoring.projection?.note_for_students || '',
    },
    weak: { grammar: weakGrammar, sat: weakSat },
    review: items.map((i) => ({
      id: i.id, section: i.section, format: i.format, level: i.level, prompt: i.prompt, passage: i.passage || '',
      options: i.options, table: i.table, notes: i.notes, sat_type: i.sat_type, domain: i.domain,
      answer: i.format === 'mc' ? i.answer : i.accepted[0], accepted: i.accepted,
      given: answers[i.id] ?? null, correct: i.correct, explanation: i.explanation || '',
    })),
  };
}
