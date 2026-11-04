import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api, fmtDate } from '../../api.js';
import { useToast } from '../../context.jsx';
import { Card, Confetti, Empty, ErrorBox, Gate, PageHeader, Spinner, useAsync } from '../../components/ui.jsx';
import { IconArrow, IconCheck, IconChevron, IconClock, IconTarget, IconTrash } from '../../components/icons.jsx';
import { BBPracticeRunner } from '../../components/Bluebook.jsx';
import { Passage } from '../../components/Passage.jsx';
import { rich } from '../../components/Rich.jsx';
import ReportMistake from '../../components/ReportMistake.jsx';

const L = ['A', 'B', 'C', 'D', 'E'];
const when = (iso) => {
  const d = Math.ceil((new Date(iso) - Date.now()) / 86400e3);
  return d <= 0 ? 'due now' : d === 1 ? 'due tomorrow' : `due in ${d} days`;
};

/** My mistakes: every wrong answer, grouped by skill, back for review two days later. */
export default function Mistakes() {
  const st = useAsync(() => api.get('/mistakes'), []);
  const nav = useNavigate();
  const toast = useToast();
  const [open, setOpen] = useState(null);
  const remove = async (it) => {
    try { await api.del(`/mistakes?src=${encodeURIComponent(it.src)}&ref=${encodeURIComponent(it.ref)}`); toast('Removed from your notebook'); st.reload(); }
    catch (e) { toast(e.message, 'bad'); }
  };
  return (
    <div className="page">
      <PageHeader title="My mistakes" sub="Every question you got wrong, grouped by skill. A question leaves the notebook after you answer it right twice, at least 2 days apart." />
      <Gate state={st}>{(d) => {
        if (!d.total) return (
          <Card><Empty icon={<IconTarget />} title={d.cleared ? 'Notebook clear' : 'No mistakes yet'}
            text={d.cleared ? `You fixed ${d.cleared} ${d.cleared === 1 ? 'question' : 'questions'}. New mistakes from practice, quizzes, level checks and mocks will appear here.` : 'Wrong answers from practice, quizzes, level checks and mocks will appear here automatically.'}>
            <Link to="/question-bank" className="btn primary">Practise now</Link>
          </Empty></Card>
        );
        return (
          <>
            <section className="mk-hero">
              <div className="mk-stats">
                <div><b>{d.due}</b><span>due today</span></div>
                <div><b>{d.total}</b><span>in the notebook</span></div>
                <div><b>{d.cleared}</b><span>fixed</span></div>
              </div>
              <div className="mk-act">
                {d.due > 0
                  ? <button className="btn primary lg" onClick={() => nav('/mistakes/review')}>Review my mistakes <IconArrow /></button>
                  : <>
                    <p className="muted"><IconClock width={16} height={16} /> Nothing due right now. Next review {d.next_due ? fmtDate(d.next_due, { weekday: 'long', day: 'numeric', month: 'short' }) : 'soon'}.</p>
                    <button className="btn soft" onClick={() => nav('/mistakes/review?early=1')}>Practise them early</button>
                  </>}
              </div>
            </section>

            <div className="stack stagger" style={{ marginTop: 18 }}>
              {d.skills.map((s) => (
                <Card key={s.skill} className="mk-skill">
                  <button className="mk-skill-head" onClick={() => setOpen(open === s.skill ? null : s.skill)} aria-expanded={open === s.skill}>
                    <span className="grow"><b>{s.skill}</b><small className="muted">{s.n} {s.n === 1 ? 'question' : 'questions'}{s.due ? ` · ${s.due} due` : ''}</small></span>
                    {s.due > 0 && <Link className="btn soft sm" to={`/mistakes/review?skill=${encodeURIComponent(s.skill)}`} onClick={(e) => e.stopPropagation()}>Review</Link>}
                    <IconChevron className={open === s.skill ? 'rot' : ''} />
                  </button>
                  {open === s.skill && (
                    <ul className="mk-list">
                      {s.items.map((it) => (
                        <li key={it.key}>
                          <div className="grow">
                            {it.passage && <p className="mk-psg">{String(it.passage).replace(/\[\[|\]\]|\*\*|<[^>]+>/g, '').slice(0, 170)}…</p>}
                            <p>{rich(String(it.prompt).slice(0, 220))}</p>
                            <small className="muted">{it.origin} · {fmtDate(it.added_at)} · {it.hits ? 'right once, ' : ''}{when(it.due_at)}</small>
                          </div>
                          <button className="icon-btn" title="I've got it: remove" aria-label="Remove from the notebook" onClick={() => remove(it)}><IconTrash width={18} height={18} /></button>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              ))}
            </div>
          </>
        );
      }}</Gate>
    </div>
  );
}

const DIRECTIONS = (
  <>
    <p>These are questions you answered wrong before. Choose an answer and check it to see the explanation.</p>
    <p>A question leaves your notebook after two correct answers at least 2 days apart. A wrong answer brings it back in 2 days.</p>
  </>
);

/** 10 questions from the notebook, oldest first, with the explanation after each answer. */
export function MistakeReview() {
  const { search } = useLocation();
  const nav = useNavigate();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [cur, setCur] = useState(0);
  const [sel, setSel] = useState({});
  const [rv, setRv] = useState({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [secs, setSecs] = useState(0);
  useEffect(() => { api.get('/mistakes/review' + search).then(setData).catch(setErr); }, [search]);
  useEffect(() => { const t = setInterval(() => setSecs((x) => x + 1), 1000); return () => clearInterval(t); }, []);

  if (err) return <div style={{ padding: 40, maxWidth: 520, margin: '0 auto' }}><ErrorBox error={err} /></div>;
  if (!data) return <div style={{ height: '100vh', display: 'grid', placeItems: 'center' }}><Spinner label="Opening your notebook…" /></div>;
  const qs = data.questions;
  if (!qs.length) return (
    <div style={{ padding: 40, maxWidth: 560, margin: '0 auto', textAlign: 'center', display: 'grid', gap: 14 }}>
      <h2>Nothing to review right now</h2>
      <p className="muted">Mistakes come back 2 days after you make them.</p>
      <div className="row" style={{ justifyContent: 'center' }}><Link className="btn primary" to="/mistakes">Back to My mistakes</Link></div>
    </div>
  );
  const keyOf = (q) => q.key;
  const check = async (q) => {
    const k = keyOf(q);
    if (sel[k] == null || rv[k]) return;
    setBusy(true);
    try { const r = await api.post('/mistakes/check', { src: q.src, ref: q.ref, choice: sel[k] }); setRv((s) => ({ ...s, [k]: r })); }
    catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  if (done) return <ReviewSummary qs={qs} rv={rv} />;
  const STATUS = { cleared: 'Fixed: this question leaves your notebook.', once: 'Right! Answer it right once more in 2 days to clear it.', wait: 'Right again. It clears after a correct answer 2 days from the first one.', again: 'It comes back in 2 days.' };
  const items = qs.map((q) => ({
    id: q.key,
    passage: (q.passage || q.table) ? <Passage text={q.passage} table={q.table} /> : null,
    prompt: rich(q.prompt),
    meta: <><span>{q.skill}</span><span className="chip">{q.origin}</span></>,
    options: q.options.map((o, i) => ({ key: L[i], text: rich(o) })),
  }));
  return (
    <BBPracticeRunner
      title="My mistakes: review" directions={DIRECTIONS}
      questions={items} cur={cur} setCur={setCur} busy={busy} seconds={secs} countdown={false}
      choice={(id) => (sel[id] == null ? null : L[sel[id]])}
      onChoose={(id, k) => !rv[id] && setSel((s) => ({ ...s, [id]: L.indexOf(k) }))}
      reveal={(id) => {
        const r = rv[id]; if (!r) return null;
        const q = qs.find((x) => x.key === id);
        return { correct: L[r.answer], ok: r.correct,
          explanation: <>{r.explanation && <>{rich(r.explanation)}<br /></>}<b>{STATUS[r.status]}</b><div style={{ marginTop: 8 }}><ReportMistake qref={`${q.src}:${q.ref}`} about={`${q.origin}: ${String(q.prompt).slice(0, 120)}`} /></div></>,
          tip: r.tip ? rich(r.tip) : null };
      }}
      onCheck={(q) => check(qs.find((x) => x.key === q.id))}
      onExit={() => (Object.keys(rv).length ? setDone(true) : nav('/mistakes'))}
      onFinish={() => setDone(true)} finishLabel="See results"
    />
  );
}

function ReviewSummary({ qs, rv }) {
  const nav = useNavigate();
  const done = qs.filter((q) => rv[q.key]);
  const right = done.filter((q) => rv[q.key].correct).length;
  const cleared = done.filter((q) => rv[q.key].status === 'cleared').length;
  return (
    <div className="page" style={{ maxWidth: 760, margin: '0 auto' }}>
      {right === done.length && done.length >= 3 && <Confetti />}
      <section className={`hero-card lc-hero ${right === done.length ? 'ok' : ''}`}>
        <small className="eyebrow">MY MISTAKES · REVIEW</small>
        <div className="pl-hero-top">
          <div>
            <h1>{right === done.length ? 'Clean sweep.' : 'Good review.'}</h1>
            <p>{cleared ? `${cleared} ${cleared === 1 ? 'question left' : 'questions left'} your notebook. ` : ''}Questions you missed come back in 2 days.</p>
          </div>
          <div className={`pl-verdict ${right === done.length ? 'yes' : 'no'}`}>{right === done.length ? <IconCheck /> : <span className="dot" />}<span><b>{right} / {done.length}</b><small>right this time</small></span></div>
        </div>
        <div className="row wrap" style={{ marginTop: 20 }}>
          <button className="btn primary lg" onClick={() => nav('/mistakes')}>Back to My mistakes</button>
          <Link className="btn ghost lg" to="/">Dashboard</Link>
        </div>
      </section>
    </div>
  );
}
