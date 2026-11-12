// Teacher uploads a word list (CSV, Excel, Word, PDF or text) → rows { word, definition, uz, ru, example } to review and save.
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import pdf from 'pdf-parse/lib/pdf-parse.js';

const COLS = ['word', 'definition', 'uz', 'ru', 'example'];
const HEAD = { word: /^(word|term|vocab(ulary)?|english)$/i, definition: /^(def(inition)?|meaning|explanation)$/i, uz: /^(uz|uzbek|o.?zbek(cha)?)$/i, ru: /^(ru|russian|ruscha|рус\w*)$/i, example: /^(example|sentence|example sentence|context)$/i };
const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

function fromGrid(grid) {
  const g = grid.map((r) => r.map(clean)).filter((r) => r.some(Boolean));
  if (!g.length) return [];
  const map = {};
  g[0].forEach((c, i) => { for (const k of COLS) if (map[k] === undefined && HEAD[k].test(c)) map[k] = i; });
  const hasHeader = map.word !== undefined;
  const pos = hasHeader ? map : Object.fromEntries(COLS.map((k, i) => [k, i]));
  return (hasHeader ? g.slice(1) : g).map((r) => Object.fromEntries(COLS.map((k) => [k, pos[k] === undefined ? '' : r[pos[k]] || '']))).filter((r) => r.word);
}

/** "word - meaning", "word: meaning", "word | meaning | uz | ru | example" or tab separated lines. */
function fromText(text) {
  const rows = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const line = clean(raw.replace(/^[\s\d]+[.)]\s+/, '').replace(/^[•\-*]\s+/, ''));
    if (!line || line.length < 3) continue;
    let parts;
    if (raw.includes('\t')) parts = raw.split('\t');
    else if (line.includes(' | ')) parts = line.split(' | ');
    else { const m = line.match(/^(.{1,60}?)\s*(?:\s[-–—]\s|:\s|\s=\s)\s*(.+)$/); parts = m ? [m[1], m[2]] : null; }
    if (!parts) continue;
    const r = Object.fromEntries(COLS.map((k, i) => [k, clean(parts[i])]));
    if (r.word && r.word.split(' ').length <= 5) rows.push(r);
  }
  return rows;
}

const decode = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

export async function parseWordFile(file) {
  const name = (file.originalname || '').toLowerCase();
  let rows;
  if (/\.(xlsx|xls|csv|tsv)$/.test(name)) {
    const wb = XLSX.read(file.buffer, { type: 'buffer', raw: false });
    rows = fromGrid(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: false }));
  } else if (name.endsWith('.docx')) {
    const { value: html } = await mammoth.convertToHtml({ buffer: file.buffer });
    const trs = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
    if (trs.length) rows = fromGrid(trs.map((t) => [...t[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) => decode(c[1]))));
    else rows = fromText(decode(html.replace(/<\/(p|li|h\d)>/g, '\n')));
  } else if (name.endsWith('.pdf')) {
    rows = fromText((await pdf(file.buffer)).text);
  } else if (/\.(txt|md)$/.test(name)) {
    rows = fromText(file.buffer.toString('utf8'));
  } else throw new Error('Supported files: .xlsx, .csv, .docx, .pdf, .txt');
  const seen = new Set();
  return rows.filter((r) => { const k = r.word.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 500);
}
