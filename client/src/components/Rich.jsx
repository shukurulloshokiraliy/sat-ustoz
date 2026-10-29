/**
 * Inline markup used in course content:
 *   **bold**  *italic*  ~~struck out~~  [[underlined]]  ______ (SAT blank)
 * Markers can nest (e.g. *The **students** asked.*). Anything else is plain text — no HTML is ever injected.
 */
function findClose(s, from, marker) {
  for (let j = from; j < s.length; j++) {
    if (marker === '*' && s.startsWith('**', j)) {
      const end = s.indexOf('**', j + 2);
      if (end === -1) return -1;
      j = end + 1;
      continue;
    }
    if (s.startsWith(marker, j)) return j;
  }
  return -1;
}

function parse(s, keyBase = 'r') {
  const out = [];
  let buf = '';
  let k = 0;
  const flush = () => { if (buf) { out.push(buf); buf = ''; } };
  for (let i = 0; i < s.length;) {
    const blank = s.slice(i).match(/^_{3,}/);
    if (blank) { flush(); out.push(<span key={`${keyBase}${k++}`} className="blank" aria-label="blank" />); i += blank[0].length; continue; }
    const pairs = [['**', '**', 'b'], ['~~', '~~', 's'], ['[[', ']]', 'u'], ['*', '*', 'i']];
    let hit = null;
    for (const [open, close, tag] of pairs) {
      if (!s.startsWith(open, i)) continue;
      const end = open === '*' ? findClose(s, i + 1, '*') : s.indexOf(close, i + open.length);
      if (end > i + open.length - 1 && end !== -1) { hit = { open, close, tag, end }; break; }
    }
    if (!hit) { buf += s[i++]; continue; }
    flush();
    const inner = parse(s.slice(i + hit.open.length, hit.end), `${keyBase}${k}-`);
    const key = `${keyBase}${k++}`;
    if (hit.tag === 'b') out.push(<strong key={key}>{inner}</strong>);
    else if (hit.tag === 'i') out.push(<em key={key}>{inner}</em>);
    else if (hit.tag === 's') out.push(<s key={key} className="cross">{inner}</s>);
    else out.push(<u key={key} className="mark-u">{inner}</u>);
    i = hit.end + hit.close.length;
  }
  flush();
  return out;
}

export function Rich({ text, as: Tag = 'span', className }) {
  return <Tag className={className}>{parse(String(text ?? ''))}</Tag>;
}
export const rich = (text) => parse(String(text ?? ''));
