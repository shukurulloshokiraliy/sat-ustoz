import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtDate } from '../../api.js';
import { useToast } from '../../context.jsx';
import { Card, Field, Gate, Modal, useAsync } from '../../components/ui.jsx';
import { IconArrow, IconBack, IconCheck, IconEdit } from '../../components/icons.jsx';
import { rich } from '../../components/Rich.jsx';

/**
 * Review every question once (Question quality → Review): one question at a time, as students see it, with the key,
 * explanation, reports, text warnings and statistics. Approve takes it off the list (it stays in use either way).
 * Problems come first; an approved question comes back if it changes, gets a report or a new statistics flag.
 */
const L = ['A', 'B', 'C', 'D', 'E', 'F'];
const SRCS = [['', 'All'], ['qbank', 'Question Bank'], ['quiz', 'Quizzes'], ['check', 'Level checks'], ['fullmock', 'Full mocks']];

export default function Review() {
  const st = useAsync(() => api.get('/review'), []);
  return <Gate state={st}>{(d) => <Queue d={d} reload={st.reload} />}</Gate>;
}

function Queue({ d, reload }) {
  const toast = useToast();
  const [src, setSrc] = useState('');
  const [problems, setProblems] = useState(false);
  const [done, setDone] = useState(() => new Set()); // approved in this visit (the list is not reloaded each time)
  const [skipped, setSkipped] = useState(() => new Set());
  const [hist, setHist] = useState([]); // for Back
  const [cur, setCur] = useState(null);
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showRecent, setShowRecent] = useState(false);
  const key = (x) => `${x.src}|${x.ref}`;
  const list = useMemo(() => d.queue.filter((x) => (!src || x.src === src) && (!problems || x.problem) && !done.has(key(x))), [d.queue, src, problems, done]);
  const next = useMemo(() => list.find((x) => !skipped.has(key(x))) || list[0] || null, [list, skipped]);
  const shown = cur && list.some((x) => key(x) === key(cur)) ? cur : next;

  const item = useAsync(() => (shown ? api.get(`/review/item?src=${shown.src}&ref=${encodeURIComponent(shown.ref)}`) : Promise.resolve(null)), [shown?.src, shown?.ref]);
  const q = item.data;
  const approvedNow = d.approved + done.size;
  const pct = d.total ? Math.round((approvedNow / d.total) * 100) : 0;

  const go = useCallback((x) => { if (shown) setHist((h) => [...h.slice(-30), shown]); setCur(x); window.scrollTo({ top: 0, behavior: 'smooth' }); }, [shown]);
  const skip = useCallback(() => {
    if (!shown) return;
    const s = new Set(skipped); s.add(key(shown)); setSkipped(s);
    const n = list.find((x) => !s.has(key(x)));
    if (n) go(n); else { setSkipped(new Set()); toast('You skipped every question in this list: starting again from the top'); go(list[0]); }
  }, [shown, skipped, list, go, toast]);
  const back = () => { const h = [...hist]; const p = h.pop(); setHist(h); if (p) { setCur(p); setDone((s) => { const n = new Set(s); n.delete(key(p)); return n; }); } };
  const approve = useCallback(async () => {
    if (!shown || busy) return;
    setBusy(true);
    try {
      const r = await api.post('/review/approve', { src: shown.src, ref: shown.ref });
      const k = key(shown);
      setDone((s) => new Set(s).add(k));
      setHist((h) => [...h.slice(-30), shown]);
      setCur(list.find((x) => key(x) !== k && !skipped.has(key(x))) || null);
      toast(r.closed_reports ? `Approved · ${r.closed_reports} report${r.closed_reports > 1 ? 's' : ''} closed` : 'Approved');
    } catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  }, [shown, busy, list, skipped, toast]);

  // keyboard: A approve, S or → skip, E edit, ← back
  useEffect(() => {
    const f = (e) => {
      if (edit || /input|textarea|select/i.test(e.target.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'a' || e.key === 'A') { e.preventDefault(); approve(); }
      else if (e.key === 's' || e.key === 'S' || e.key === 'ArrowRight') { e.preventDefault(); skip(); }
      else if (e.key === 'e' || e.key === 'E') { e.preventDefault(); setEdit(true); }
      else if (e.key === 'ArrowLeft') back();
    };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  });

  // on phones the action bar sticks just above the bottom tab bar (its height differs for teachers and students)
  const [barH, setBarH] = useState(0);
  useEffect(() => {
    const m = () => { const t = document.querySelector('.tabbar'); setBarH(t && getComputedStyle(t).display !== 'none' ? t.offsetHeight : 0); };
    m(); window.addEventListener('resize', m);
    return () => window.removeEventListener('resize', m);
  }, []);
  const left = (s) => d.queue.filter((x) => (!s || x.src === s) && !done.has(key(x))).length;
  return (
    <div className="qr">
      <div className="qr-top">
        <div className="qr-prog">
          <div className="row between"><b>{approvedNow.toLocaleString('en-US')} of {d.total.toLocaleString('en-US')} approved</b><span className="muted">{pct}%</span></div>
          <div className="qr-bar"><span style={{ width: `${pct}%` }} /></div>
        </div>
        <div className="qr-filters">
          {SRCS.filter(([s]) => !s || d.by[s]?.total).map(([s, label]) => (
            <button key={s || 'all'} type="button" className={`qr-chip ${src === s ? 'on' : ''}`} onClick={() => { setSrc(s); setCur(null); }}>{label} <b>{left(s)}</b></button>
          ))}
          <label className="qr-chip qr-check"><input type="checkbox" checked={problems} onChange={(e) => { setProblems(e.target.checked); setCur(null); }} /> Problems only <b>{d.queue.filter((x) => x.problem && !done.has(key(x))).length}</b></label>
        </div>
      </div>

      {!shown ? (
        <Card className="qr-empty"><span className="item-ic"><IconCheck /></span><div><b>{problems ? 'No problem questions left here' : 'Everything here is approved'}</b><p className="muted">Approved questions come back only if they change, get a student report or a new statistics flag.</p></div></Card>
      ) : (
        <Card className="qr-card">
          {!q ? <p className="muted">Loading…</p> : (
            <>
              <div className="row wrap qr-meta">
                <span className="chip domain">{q.src_label}</span>
                {q.label && <span className={`chip lvl-${q.label}`}>{q.label[0].toUpperCase() + q.label.slice(1)}</span>}
                {q.hidden && <span className="chip">Hidden</span>}
                <small className="muted">{q.where}</small>
              </div>
              {q.reasons.length > 0 && <ul className="ql-issues qr-reasons">{q.reasons.map((r, i) => <li key={i} className="warn">{r}</li>)}</ul>}
              {q.reports.length > 0 && (
                <div className="qr-reports">
                  {q.reports.map((r) => <div key={r.id} className={r.status}><b>{r.student}</b> · {r.kind === 'key' ? 'Wrong answer key' : r.kind === 'typo' ? 'Typo' : r.kind === 'unclear' ? 'Unclear question' : 'Other'} · {fmtDate(r.at, { day: 'numeric', month: 'short' })}{r.status !== 'open' ? ' · closed' : ''}{r.note && <p>“{r.note}”</p>}</div>)}
                </div>
              )}
              <div className="qr-q">
                {q.passage && <div className="qr-passage">{rich(q.passage)}</div>}
                {q.prompt && <p className="qr-prompt">{rich(q.prompt)}</p>}
                <ol className="qr-opts">
                  {q.options.map((o, i) => <li key={i} className={i === q.answer ? 'key' : ''}><span>{L[i]}</span><div>{rich(o)}</div>{i === q.answer && <IconCheck width={18} height={18} />}</li>)}
                </ol>
                {q.answer < 0 && <p className="bad-text">No correct answer is set.</p>}
                <div className="qr-expl"><small>Explanation</small>{q.explanation ? <div>{rich(q.explanation)}</div> : <p className="muted">No explanation.</p>}</div>
                {q.n > 0 && <small className="muted">{q.pct}% of students got it right · {q.n} first answers</small>}
              </div>
            </>
          )}
          <div className="qr-actions" style={{ bottom: barH }}>
            <button className="btn ghost" disabled={!hist.length} onClick={back} title="Back (←)"><IconBack width={16} height={16} /><span className="qr-hide-s"> Back</span></button>
            <span className="grow" />
            <button className="btn ghost" onClick={skip} title="Skip (S)">Skip <IconArrow width={16} height={16} /></button>
            <button className="btn soft" disabled={!q} onClick={() => setEdit(true)} title="Edit (E)"><IconEdit width={16} height={16} /> Edit</button>
            <button className="btn primary" disabled={!q || busy} onClick={approve} title="Approve (A)"><IconCheck width={16} height={16} /> Approve</button>
          </div>
          <small className="muted qr-keys">Keys: A approve · S skip · E edit · ← back</small>
        </Card>
      )}

      {d.recent.length > 0 && (
        <div className="qr-recent">
          <button type="button" className="btn ghost sm" onClick={() => setShowRecent(!showRecent)}>{showRecent ? 'Hide' : 'Show'} recently approved ({d.recent.length})</button>
          {showRecent && (
            <Card className="stack">
              {d.recent.map((r) => (
                <div key={`${r.src}|${r.ref}`} className="qr-rec">
                  <div><small className="muted">{r.where} · {fmtDate(r.at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small><span>{r.preview}</span></div>
                  <button className="btn ghost sm" onClick={async () => { try { await api.post('/review/unapprove', { src: r.src, ref: r.ref }); toast('Back on the review list'); reload(); } catch (e) { toast(e.message, 'bad'); } }}>Undo</button>
                </div>
              ))}
            </Card>
          )}
        </div>
      )}

      {edit && q && <ReviewEditor q={q} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); item.reload(); }} />}
    </div>
  );
}

/** Edit any reviewed question: text, choices, key, explanation. Saving keeps it on the list until approved. */
function ReviewEditor({ q, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState({ passage: q.passage, prompt: q.prompt, options: [...q.options], answer: q.answer, explanation: q.explanation });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF({ ...f, [k]: v });
  const save = async () => {
    setBusy(true);
    try {
      if (q.src === 'qbank') await api.put(`/qbank/admin/${encodeURIComponent(q.ref)}`, f);
      else await api.put('/review/item', { src: q.src, ref: q.ref, ...f });
      toast('Saved. Students see the fixed question now.'); onSaved();
    } catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  return (
    <Modal title="Edit question" wide onClose={onClose}
      footer={<>{q.link && <Link className="btn ghost" to={q.link}>Open in its editor</Link>}<span className="grow" /><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button></>}>
      <div className="stack">
        <small className="muted">{q.where}. Use ______ for a blank, **bold**, [[underline]].{q.src === 'qbank' ? ' Changing the key re-scores answers already given.' : ''}</small>
        <Field label="Text"><textarea rows={6} value={f.passage} onChange={(e) => set('passage', e.target.value)} /></Field>
        <Field label="Question"><input value={f.prompt} onChange={(e) => set('prompt', e.target.value)} /></Field>
        {f.options.map((o, i) => (
          <div key={i} className="ql-opt">
            <label className="ql-key" title="Correct answer"><input type="radio" name="rkey" checked={f.answer === i} onChange={() => set('answer', i)} /> {L[i]}</label>
            <input value={o} onChange={(e) => set('options', f.options.map((x, k) => (k === i ? e.target.value : x)))} />
          </div>
        ))}
        <Field label="Explanation"><textarea rows={3} value={f.explanation} onChange={(e) => set('explanation', e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
