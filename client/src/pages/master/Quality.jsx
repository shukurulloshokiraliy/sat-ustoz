import { useMemo, useState } from 'react';
import { api, fmtDate } from '../../api.js';
import { useToast } from '../../context.jsx';
import { Card, Field, Gate, Modal, PageHeader, Segmented, useAsync } from '../../components/ui.jsx';
import Review from './Review.jsx';

/**
 * Question quality (teacher): how hard each Question Bank question really is, text problems found automatically,
 * and questions the statistics say to check. Fix a question right here; its difficulty keeps learning from students.
 */
const LV = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
const TABS = [{ value: 'review', label: 'Review' }, { value: 'difficulty', label: 'Difficulty' }, { value: 'checks', label: 'Text checks' }, { value: 'suspicious', label: 'To check' }];

export default function Quality() {
  const [tab, setTab] = useState('review');
  const review = tab === 'review';
  const st = useAsync(() => (review ? Promise.resolve({}) : api.get('/quality')), [review]);
  return (
    <div className="page">
      <PageHeader title="Question quality" sub="Review and approve every question, see the difficulty learned from students' answers, automatic text checks and questions the statistics flag." />
      {review ? <><div className="ql-bar"><Segmented value={tab} onChange={setTab} options={TABS} /></div><Review /></>
        : <Gate state={st}>{(d) => (d?.rows ? <Body d={d} reload={st.reload} tab={tab} setTab={setTab} /> : null)}</Gate>}
    </div>
  );
}

function Body({ d, reload, tab, setTab }) {
  const toast = useToast();
  const [skill, setSkill] = useState('');
  const [onlyDiff, setOnlyDiff] = useState(false);
  const [order, setOrder] = useState('');
  const [edit, setEdit] = useState(null);
  const [busy, setBusy] = useState('');
  const skills = useMemo(() => [...new Map(d.rows.map((r) => [r.skill_id, r.skill])).entries()], [d.rows]);
  const rows = d.rows.filter((r) => !skill || r.skill_id === skill);
  const s = d.summary;
  const run = async (what, fn) => { setBusy(what); try { await fn(); } catch (e) { toast(e.message, 'bad'); } finally { setBusy(''); } };
  const recalc = () => run('calc', async () => { const r = await api.post('/quality/recalibrate'); toast(`Updated: ${r.answers} answers from ${r.students} students`); reload(); });
  const applyAll = () => run('apply', async () => { const r = await api.post('/quality/apply', { min: 30 }); toast(r.updated ? `${r.updated} labels updated` : 'Nothing to change yet: labels already match'); reload(); });
  const applyOne = (r) => run(r.id, async () => { await api.post('/quality/apply', { ids: [r.id], min: 10 }); toast(`Now ${LV[r.level]}`); reload(); });

  const picked = tab === 'difficulty' ? rows.filter((r) => !onlyDiff || (r.level && r.level !== r.label && r.n >= 10))
    : tab === 'checks' ? rows.filter((r) => r.checks.some((c) => c.level !== 'info'))
      : rows.filter((r) => r.flags.some((f) => ['strong_miss', 'distractor', 'weak', 'very_hard'].includes(f.code)));
  // order: most / least answered, hardest / easiest for students (questions without answers go last)
  const SORT = {
    most: (a, b) => b.n - a.n,
    least: (a, b) => a.n - b.n,
    hard: (a, b) => (a.pct ?? 101) - (b.pct ?? 101) || b.n - a.n,
    easy: (a, b) => (b.pct ?? -1) - (a.pct ?? -1) || b.n - a.n,
  };
  const list = SORT[order] ? [...picked].sort(SORT[order]) : picked;

  return (
    <>
      <div className="ql-kpis">
        <div><b>{s.questions}</b><span>questions</span></div>
        <div><b>{s.with_data}</b><span>with 10+ answers</span></div>
        <div><b>{s.mismatch}</b><span>label differs</span></div>
        <button type="button" className={tab === 'checks' ? 'on' : ''} onClick={() => setTab('checks')}><b>{s.text_errors + s.text_warnings}</b><span>text problems</span></button>
        <button type="button" className={tab === 'suspicious' ? 'on' : ''} onClick={() => setTab('suspicious')}><b>{s.suspicious}</b><span>to check</span></button>
      </div>
      <div className="ql-bar">
        <Segmented value={tab} onChange={setTab} options={TABS} />
        <select value={skill} onChange={(e) => setSkill(e.target.value)} aria-label="Question type"><option value="">All question types</option>{skills.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
        <select value={order} onChange={(e) => setOrder(e.target.value)} aria-label="Order"><option value="">Bank order</option><option value="most">Most answered</option><option value="least">Least answered</option><option value="hard">Lowest % right</option><option value="easy">Highest % right</option></select>
        <span className="grow" />
        <small className="muted">{d.calibrated_at ? `Updated ${fmtDate(d.calibrated_at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'Not calculated yet'}</small>
        <button className="btn ghost sm" disabled={!!busy} onClick={recalc}>{busy === 'calc' ? 'Calculating…' : 'Recalculate now'}</button>
      </div>

      {tab === 'difficulty' && (
        <Card className="ql-help">
          <p>Each question starts from your label. Every student's first answer moves it: after about 30 answers the real difficulty decides. A question that only strong students get right counts as hard even if many students answer it.</p>
          <div className="row wrap" style={{ gap: 10 }}>
            <label className="row" style={{ gap: 6, fontSize: '.88rem' }}><input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} /> Only questions whose label differs</label>
            <button className="btn primary sm" disabled={!!busy || !s.mismatch} onClick={applyAll}>{busy === 'apply' ? 'Updating…' : 'Use learned levels (30+ answers)'}</button>
          </div>
        </Card>
      )}
      {tab === 'suspicious' && <Card className="ql-help"><p>Questions with 15+ answers where the statistics look wrong. Most often the answer key or one choice has a problem. Open the question, check it, fix it: answers already given are re-scored.</p></Card>}
      {tab === 'checks' && <Card className="ql-help"><p>Found automatically in the text students see: spacing, punctuation, quotes, repeated words, a missing blank, empty or identical choices. Read each one: some may be fine as written.</p></Card>}

      <div className="ql-list">
        {!list.length && <Card><p className="muted" style={{ margin: 0 }}>{tab === 'difficulty' ? 'No questions here.' : tab === 'checks' ? 'No text problems found.' : 'Nothing flagged yet. Flags appear once a question has 15+ answers.'}</p></Card>}
        {list.slice(0, 300).map((r) => (
          <Card key={r.id} className="ql-row">
            <div className="ql-main">
              <div className="row wrap" style={{ gap: 6 }}>
                <span className="chip domain">{r.skill}</span>
                <span className={`chip lvl-${r.label}`}>Label: {LV[r.label]}</span>
                {r.level && r.n >= 10 && <span className={`chip lvl-${r.level}`}>Students: {LV[r.level]}</span>}
                {!r.active && <span className="chip">Hidden</span>}
                <small className="muted">{r.id}</small>
              </div>
              <p className="ql-text">{r.preview}{r.preview.length >= 150 ? '…' : ''}</p>
              {tab === 'checks' && <ul className="ql-issues">{r.checks.filter((c) => c.level !== 'info').map((c, i) => <li key={i} className={c.level}><b>{c.where}:</b> {c.text}</li>)}</ul>}
              {tab === 'suspicious' && <ul className="ql-issues">{r.flags.filter((f) => f.code !== 'label').map((f) => <li key={f.code} className="warn">{f.text}</li>)}</ul>}
              {tab === 'suspicious' && <Choices r={r} />}
            </div>
            <div className="ql-side">
              <div className="ql-stat"><b>{r.pct != null ? `${r.pct}%` : '—'}</b><span>{r.n ? `right · ${r.n} answers` : 'no answers yet'}</span></div>
              {r.upper != null && r.lower != null && r.n >= 15 && (
                <div className="ql-sep" title="Share right among the strongest 27% and the weakest 27% of students">
                  <span>Strong {Math.round(r.upper * 100)}%</span><span>Weak {Math.round(r.lower * 100)}%</span>
                </div>
              )}
              <div className="row wrap" style={{ gap: 6, justifyContent: 'flex-end' }}>
                {tab === 'difficulty' && r.level && r.level !== r.label && r.n >= 10 && <button className="btn soft sm" disabled={busy === r.id} onClick={() => applyOne(r)}>Make it {LV[r.level]}</button>}
                <button className="btn ghost sm" onClick={() => setEdit(r.id)}>Edit</button>
              </div>
            </div>
          </Card>
        ))}
        {list.length > 300 && <p className="muted center">Showing 300 of {list.length}. Pick a question type to narrow the list.</p>}
      </div>
      {edit && <EditQuestion id={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
    </>
  );
}

function Choices({ r }) {
  const total = r.choices.reduce((a, b) => a + b, 0) || 1;
  return (
    <div className="ql-choices">
      {r.options.map((o, i) => (
        <div key={i} className={i === r.answer ? 'key' : ''}>
          <span className="ql-l">{'ABCD'[i]}</span>
          <span className="ql-o">{o}</span>
          <span className="ql-b"><span style={{ width: `${(r.choices[i] / total) * 100}%` }} /></span>
          <span className="ql-n">{Math.round((r.choices[i] / total) * 100)}%</span>
        </div>
      ))}
    </div>
  );
}

export function EditQuestion({ id, onClose, onSaved, report = null }) {
  const toast = useToast();
  const st = useAsync(() => api.get(`/quality/q/${encodeURIComponent(id)}`), [id]);
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const q = f || st.data;
  const [close, setClose] = useState(true);
  const set = (k, v) => setF({ ...(f || st.data), [k]: v });
  const save = async () => {
    setBusy(true);
    try {
      if (f) await api.put(`/qbank/admin/${encodeURIComponent(id)}`, { passage: q.passage, prompt: q.prompt, options: q.options, answer: q.answer, explanation: q.explanation, difficulty: q.difficulty });
      if (report && close) await api.put(`/question-reports/${report.id}`, { status: 'resolved' });
      toast(f ? (report && close ? 'Saved and the report is closed. Students see the fixed question now.' : 'Saved. Students see the fixed question now.') : 'Report closed');
      onSaved();
    }
    catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  return (
    <Modal title="Edit question" wide onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={(!f && !(report && close)) || busy} onClick={save}>{busy ? 'Saving…' : f ? 'Save' : 'Close report'}</button></>}>
      {!q ? <p className="muted">Loading…</p> : (
        <div className="stack">
          {report && (
            <div className="rp-box">
              <div><b>{report.kind_label}</b> · {report.student || 'Student'}</div>
              {report.note ? <p>“{report.note}”</p> : <p className="muted">No comment from the student.</p>}
              {report.kind === 'key' && <small>Check the correct answer below: changing it re-scores answers already given.</small>}
            </div>
          )}
          <small className="muted">{q.skill} · {q.id}. Use ______ for a blank, **bold**, [[underline]].</small>
          <Field label="Text"><textarea rows={6} value={q.passage} onChange={(e) => set('passage', e.target.value)} /></Field>
          <Field label="Question"><input value={q.prompt} onChange={(e) => set('prompt', e.target.value)} /></Field>
          {q.options.map((o, i) => (
            <div key={i} className="ql-opt">
              <label className="ql-key" title="Correct answer"><input type="radio" name="key" checked={q.answer === i} onChange={() => set('answer', i)} /> {'ABCD'[i]}</label>
              <input value={o} onChange={(e) => set('options', q.options.map((x, k) => (k === i ? e.target.value : x)))} />
            </div>
          ))}
          <Field label="Explanation"><textarea rows={3} value={q.explanation} onChange={(e) => set('explanation', e.target.value)} /></Field>
          <Field label="Difficulty label" hint="students' answers keep adjusting the real difficulty"><select value={q.difficulty} onChange={(e) => set('difficulty', e.target.value)}>{Object.entries(LV).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          {report && <label className="row" style={{ gap: 8, fontSize: '.9rem' }}><input type="checkbox" checked={close} onChange={(e) => setClose(e.target.checked)} /> Mark the report as fixed when I save</label>}
        </div>
      )}
    </Modal>
  );
}
