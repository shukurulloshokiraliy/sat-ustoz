import * as XLSX from 'xlsx';
import pdf from 'pdf-parse/lib/pdf-parse.js';

export const DEFAULT_PROMPT =
  'Which choice completes the text so that it conforms to the conventions of Standard English?';

export const TEMPLATE_HEADERS = [
  'passage',
  'question',
  'A',
  'B',
  'C',
  'D',
  'correct',
  'explanation',
  'tip',
  'topic',
];

const norm = (k) => String(k).toLowerCase().replace(/[^a-z0-9]/g, '');
const ALIASES = {
  passage: ['passage', 'text', 'matn', 'context'],
  prompt: ['question', 'prompt', 'savol', 'q'],
  a: ['a', 'optiona', 'choicea', 'varianta'],
  b: ['b', 'optionb', 'choiceb', 'variantb'],
  c: ['c', 'optionc', 'choicec', 'variantc'],
  d: ['d', 'optiond', 'choiced', 'variantd'],
  correct: ['correct', 'answer', 'javob', 'correctanswer', 'key'],
  explanation: ['explanation', 'rationale', 'izoh', 'tushuntirish', 'why'],
  tip: ['tip', 'ustoztip', 'hint', 'maslahat', 'ustozmaslahati'],
  topic: ['topic', 'mavzu', 'skill', 'category'],
};

function pick(row, key) {
  const wanted = ALIASES[key];
  for (const [k, v] of Object.entries(row)) {
    if (wanted.includes(norm(k)) && v !== undefined && v !== null && String(v).trim() !== '') {
      return String(v).trim();
    }
  }
  return '';
}

function cleanCorrect(v) {
  const m = String(v || '').trim().toUpperCase().match(/[ABCD]/);
  return m ? m[0] : '';
}

export function parseSheet(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  return rows
    .map((r) => ({
      passage: pick(r, 'passage'),
      prompt: pick(r, 'prompt') || DEFAULT_PROMPT,
      opt_a: pick(r, 'a'),
      opt_b: pick(r, 'b'),
      opt_c: pick(r, 'c'),
      opt_d: pick(r, 'd'),
      correct: cleanCorrect(pick(r, 'correct')),
      explanation: pick(r, 'explanation'),
      tip: pick(r, 'tip'),
      topic: pick(r, 'topic') || 'General',
    }))
    .filter((q) => q.passage || q.opt_a || q.opt_b);
}

/**
 * Text/PDF format:
 *   1. Passage text ... ______ ...
 *   Which choice completes the text...?        (optional)
 *   A) option   B) option   C) option   D) option    (one per line)
 *   Answer: B
 *   Explanation: ...
 *   Topic: Boundaries                               (optional)
 */
export function parseText(raw) {
  const text = raw.replace(/\r/g, '').replace(/ /g, ' ');
  const blocks = text.split(/\n\s*(?=\d{1,3}\s*[.)]\s+\S)/g).filter((b) => /^\s*\d{1,3}\s*[.)]/.test(b));
  const out = [];
  for (const block of blocks) {
    const body = block.replace(/^\s*\d{1,3}\s*[.)]\s*/, '');
    const lines = body.split('\n');
    const head = [];
    const opts = { A: '', B: '', C: '', D: '' };
    let cur = null;
    let tail = [];
    let inTail = false;
    for (const line of lines) {
      const mo = line.match(/^\s*\(?([A-D])[).:]\s*(.*)$/);
      const mt = line.match(/^\s*(answer|correct answer|correct|javob|explanation|rationale|izoh|tip|hint|topic|mavzu)\s*[:\-–]\s*(.*)$/i);
      if (mt) {
        inTail = true;
        cur = null;
        tail.push(line);
        continue;
      }
      if (inTail) {
        tail.push(line);
        continue;
      }
      if (mo && (cur || !opts.A || mo[1] === 'A' || opts[mo[1]] === '')) {
        cur = mo[1];
        opts[cur] = mo[2].trim();
        continue;
      }
      if (cur) opts[cur] += ' ' + line.trim();
      else head.push(line);
    }
    const tailText = tail.join('\n');
    const grab = (re) => (tailText.match(re) || [])[1]?.trim() || '';
    const correct = cleanCorrect(grab(/(?:^|\n)\s*(?:answer|correct answer|correct|javob)\s*[:\-–]\s*\(?([A-D])/i));
    const explanation = grab(/(?:^|\n)\s*(?:explanation|rationale|izoh)\s*[:\-–]\s*([\s\S]*?)(?=\n\s*(?:tip|hint|topic|mavzu)\s*[:\-–]|$)/i);
    const tip = grab(/(?:^|\n)\s*(?:tip|hint)\s*[:\-–]\s*([\s\S]*?)(?=\n\s*(?:topic|mavzu)\s*[:\-–]|$)/i);
    const topic = grab(/(?:^|\n)\s*(?:topic|mavzu)\s*[:\-–]\s*(.*)/i) || 'General';

    const headText = head.join('\n').trim();
    const hl = headText.split('\n').map((s) => s.trim()).filter(Boolean);
    let prompt = DEFAULT_PROMPT;
    let passage = hl.join(' ');
    const last = hl[hl.length - 1];
    // A line that looks like the question stem ("Which choice ...?") is split from the passage
    let stemIdx = hl.findIndex((l, i) => i > 0 && /^(which|what|how|why|according)\b.*\?\s*$/i.test(l));
    if (stemIdx === -1 && hl.length > 1 && last && /\?\s*$/.test(last)) stemIdx = hl.length - 1;
    if (stemIdx > 0) {
      prompt = hl[stemIdx];
      passage = hl.filter((_, i) => i !== stemIdx).join(' ');
    } else {
      // single-line head: pull an inline "Which choice ...?" sentence out of the passage
      const m = passage.match(/\s*(Which choice[^?]*\?)/);
      if (m) {
        prompt = m[1].trim();
        passage = passage.replace(m[0], ' ').trim();
      }
    }
    if (!opts.A && !opts.B) continue;
    out.push({
      passage,
      prompt,
      opt_a: opts.A.trim(),
      opt_b: opts.B.trim(),
      opt_c: opts.C.trim(),
      opt_d: opts.D.trim(),
      correct,
      explanation,
      tip,
      topic,
    });
  }
  return out;
}

export async function parseUpload(file) {
  const name = (file.originalname || '').toLowerCase();
  if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv')) {
    return parseSheet(file.buffer);
  }
  if (name.endsWith('.pdf')) {
    const data = await pdf(file.buffer);
    return parseText(data.text);
  }
  if (name.endsWith('.txt') || name.endsWith('.md')) {
    return parseText(file.buffer.toString('utf8'));
  }
  throw new Error('Supported formats: .xlsx, .csv, .pdf, .txt');
}

export function buildTemplate() {
  const rows = [
    {
      passage:
        'Although Marie Curie, a pioneering physicist and chemist, discovered ______ still faced significant skepticism from the male-dominated scientific community.',
      question: DEFAULT_PROMPT,
      A: 'radium, she',
      B: 'radium; she',
      C: 'radium, despite she',
      D: 'radium, but she',
      correct: 'A',
      explanation:
        'The "Although" clause is subordinate, so a comma must separate it from the main clause that begins with "she".',
      tip: 'Find the main clause first — what can stand alone as a sentence?',
      topic: 'Boundaries',
    },
  ];
  const ws = XLSX.utils.json_to_sheet(rows, { header: TEMPLATE_HEADERS });
  ws['!cols'] = [60, 50, 24, 24, 24, 24, 10, 60, 40, 18].map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Questions');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
