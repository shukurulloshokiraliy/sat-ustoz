import { rich } from './Rich.jsx';

/**
 * Passage text from the question bank: paragraphs split by blank lines,
 * "- " lines become a bullet list (student notes), plus an optional data table.
 */
export function Passage({ text, table }) {
  const blocks = String(text || '').split(/\n{2,}/).filter((b) => b.trim());
  return (
    <div className="qb-passage">
      {blocks.map((b, i) => {
        const lines = b.split('\n');
        const bullets = lines.filter((l) => l.startsWith('- '));
        if (bullets.length) {
          const head = lines.filter((l) => !l.startsWith('- '));
          return (
            <div key={i}>
              {head.map((h, k) => <p key={k}>{rich(h)}</p>)}
              <ul className="qb-notes">{bullets.map((l, k) => <li key={k}>{rich(l.slice(2))}</li>)}</ul>
            </div>
          );
        }
        return <p key={i}>{lines.map((l, k) => <span key={k}>{k > 0 && <br />}{rich(l)}</span>)}</p>;
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
