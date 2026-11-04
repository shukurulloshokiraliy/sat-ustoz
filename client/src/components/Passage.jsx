import { rich } from './Rich.jsx';

const isRow = (l) => (l.match(/\|/g) || []).length >= 1 && l.trim().length > 2 && !/^\s*\|?\s*-{3,}/.test(l);
const isRule = (l) => /^\s*\|?\s*:?-{3,}/.test(l); // markdown |---|---| separator line
const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

/**
 * Passage text (Question Bank, quizzes, lessons):
 * - paragraphs split by blank lines, single line breaks kept (e.g. **Text 1** / **Text 2** headings)
 * - "- " lines become a bullet list (student notes)
 * - a "Table:" line followed by lines with " | " between cells becomes a real table (first row = header)
 * - inline **bold**, *italic*, [[underlined]] and ______ blanks; plus an optional data table object
 */
export function Passage({ text, table }) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const blocks = []; // { kind: 'p' | 'ul' | 'table', lines, caption }
  let para = [];
  const flush = () => { if (para.length) { blocks.push({ kind: 'p', lines: para }); para = []; } };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim()) { flush(); continue; }
    const cap = l.match(/^\s*(table\s*\d*\s*[:.].*)$/i);
    // a table: 2+ consecutive lines with cells (optionally after a "Table:" caption line)
    const start = cap ? i + 1 : i;
    let j = start;
    while (j < lines.length && (isRow(lines[j]) || isRule(lines[j]))) j++;
    const rows = lines.slice(start, j).filter((x) => !isRule(x));
    if (rows.length >= 2) {
      flush();
      blocks.push({ kind: 'table', caption: cap ? cap[1].replace(/^table\s*\d*\s*[:.]\s*/i, '').trim() || null : null, rows: rows.map(cells) });
      i = j - 1;
      continue;
    }
    if (l.startsWith('- ')) {
      flush();
      const items = [];
      while (i < lines.length && lines[i].startsWith('- ')) items.push(lines[i++].slice(2));
      i--;
      blocks.push({ kind: 'ul', lines: items });
      continue;
    }
    para.push(l);
  }
  flush();
  return (
    <div className="qb-passage">
      {blocks.map((b, i) => {
        if (b.kind === 'ul') return <ul key={i} className="qb-notes">{b.lines.map((l, k) => <li key={k}>{rich(l)}</li>)}</ul>;
        if (b.kind === 'table') {
          const [head, ...body] = b.rows;
          return (
            <div key={i} className="qb-table">
              {b.caption && <p className="qb-table-cap">{rich(b.caption)}</p>}
              <table>
                <thead><tr>{head.map((c, k) => <th key={k}>{rich(c)}</th>)}</tr></thead>
                <tbody>{body.map((r, k) => <tr key={k}>{r.map((c, m) => <td key={m}>{rich(c)}</td>)}</tr>)}</tbody>
              </table>
            </div>
          );
        }
        return <p key={i}>{b.lines.map((l, k) => <span key={k}>{k > 0 && <br />}{rich(l)}</span>)}</p>;
      })}
      {table && (
        <div className="qb-table">
          <table>
            <thead><tr>{table.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
            <tbody>{table.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
