import { useState } from 'react';
import { api } from '../../api.js';
import { useToast } from '../../context.jsx';
import { Modal } from '../../components/ui.jsx';
import { IconDownload, IconUpload } from '../../components/icons.jsx';

// header names teachers actually use (English, Uzbek, Russian)
const ALIAS = {
  unit: ['unit', 'unit title', 'passage', 'mavzu', 'unit nomi', 'тема', 'юнит'],
  word: ['word', 'term', "so'z", 'soz', 'so‘z', 'слово', 'english'],
  definition: ['definition', 'meaning', "ta'rif", "ma'nosi", 'manosi', 'izoh', 'определение', 'значение'],
  uz: ['uz', 'uzbek', "o'zbekcha", 'ozbekcha', 'tarjima', 'перевод (uz)'],
  ru: ['ru', 'russian', 'ruscha', 'русский', 'перевод'],
  example: ['example', 'sentence', 'misol', 'gap', 'пример'],
};
const ORDER = ['word', 'definition', 'uz', 'ru', 'example'];
const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/[‘’`]/g, "'");

/** Rows (arrays) → words. Uses the header row when it names the columns, otherwise the fixed order. */
function toWords(rows, withUnit) {
  const clean = rows.map((r) => r.map((c) => String(c ?? '').trim())).filter((r) => r.some(Boolean));
  if (!clean.length) return [];
  const head = clean[0].map(norm);
  const map = {};
  for (const [k, names] of Object.entries(ALIAS)) { const i = head.findIndex((h) => names.includes(h)); if (i >= 0) map[k] = i; }
  const hasHeader = map.word != null;
  const body = hasHeader ? clean.slice(1) : clean;
  const cols = hasHeader ? map : Object.fromEntries((withUnit ? ['unit', ...ORDER] : ORDER).map((k, i) => [k, i]));
  return body.map((r) => Object.fromEntries(Object.entries(cols).map(([k, i]) => [k, r[i] || '']))).filter((w) => w.word);
}

async function readFile(file) {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', codepage: 65001 });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
}

export function downloadTemplate(withUnit) {
  const head = withUnit ? ['unit', ...ORDER] : ORDER;
  const ex = withUnit ? ['The Lost City', 'ancient', 'very old; from a long time ago', 'qadimiy', 'древний', 'They found an ancient wall under the sand.'] : ['ancient', 'very old; from a long time ago', 'qadimiy', 'древний', 'They found an ancient wall under the sand.'];
  const csv = '\uFEFF' + [head, ex].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = withUnit ? 'vocab-set-template.csv' : 'vocab-unit-template.csv';
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/**
 * Import words from CSV or Excel.
 * unitId → all rows go into that unit. setId → rows are grouped by the "unit" column; missing units are created.
 */
export default function ImportWords({ unitId, setId, units = [], onClose, onSaved }) {
  const toast = useToast();
  const withUnit = !unitId;
  const [words, setWords] = useState(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const pick = async (file) => {
    if (!file) return;
    setErr(''); setName(file.name);
    try {
      const w = toWords(await readFile(file), withUnit);
      if (!w.length) setErr('No words found. The first column (or a column called “word”) must contain the words.');
      else if (withUnit && w.some((x) => !x.unit)) setErr('Some rows have no unit. Add a “unit” column with the unit title for every word.');
      setWords(w);
    } catch { setErr('Could not read this file. Save it as .xlsx or .csv and try again.'); setWords(null); }
  };

  const save = async () => {
    setBusy(true);
    try {
      let added = 0;
      if (unitId) {
        for (let i = 0; i < words.length; i += 200) added += (await api.post(`/vocab/units/${unitId}/words`, { words: words.slice(i, i + 200) })).added;
      } else {
        const byUnit = new Map();
        words.forEach((w) => { const k = w.unit.trim(); if (!byUnit.has(k)) byUnit.set(k, []); byUnit.get(k).push(w); });
        const known = new Map(units.map((u) => [u.title.trim().toLowerCase(), u.id]));
        for (const [title, list] of byUnit) {
          let id = known.get(title.toLowerCase());
          if (!id) { id = (await api.post(`/vocab/sets/${setId}/units`, { title })).id; known.set(title.toLowerCase(), id); }
          for (let i = 0; i < list.length; i += 200) added += (await api.post(`/vocab/units/${id}/words`, { words: list.slice(i, i + 200) })).added;
        }
      }
      toast(`${added} words imported`); onSaved();
    } catch (e) { toast(e.message, 'bad'); setBusy(false); }
  };

  const unitCount = withUnit && words ? new Set(words.map((w) => w.unit)).size : 0;
  return (
    <Modal wide title={unitId ? 'Import words from a file' : 'Import a set from a file'} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!words?.length || !!err || busy} onClick={save}>{busy ? 'Importing…' : `Import ${words?.length || ''} words`}</button></>}>
      <div className="stack">
        <p className="muted">
          Excel (.xlsx, .xls) or CSV. Columns: {withUnit && <><b>unit</b>, </>}<b>word</b>, definition, uz, ru, example. A header row with these names can be in any order; without a header the columns are read in this order.
          {' '}Existing words with the same spelling are updated, not duplicated.
        </p>
        <div className="row wrap" style={{ gap: 8 }}>
          <label className="btn primary"><IconUpload width={18} height={18} /> Choose file
            <input type="file" hidden accept=".csv,.xlsx,.xls,.ods,.tsv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" onChange={(e) => pick(e.target.files?.[0])} />
          </label>
          <button type="button" className="btn ghost" onClick={() => downloadTemplate(withUnit)}><IconDownload width={18} height={18} /> Download template</button>
          {name && <span className="muted">{name}</span>}
        </div>
        {err && <p className="error-box">{err}</p>}
        {words?.length > 0 && (
          <>
            <b>{words.length} words{withUnit ? ` in ${unitCount} unit${unitCount === 1 ? '' : 's'}` : ''} · preview</b>
            <div className="table-wrap imp-preview">
              <table className="t">
                <thead><tr>{withUnit && <th>Unit</th>}<th>Word</th><th>Definition</th><th>UZ</th><th>RU</th><th>Example</th></tr></thead>
                <tbody>{words.slice(0, 8).map((w, i) => <tr key={i}>{withUnit && <td>{w.unit}</td>}<td><b>{w.word}</b></td><td>{w.definition}</td><td>{w.uz}</td><td>{w.ru}</td><td>{w.example}</td></tr>)}</tbody>
              </table>
            </div>
            {words.length > 8 && <small className="muted">…and {words.length - 8} more</small>}
          </>
        )}
      </div>
    </Modal>
  );
}
