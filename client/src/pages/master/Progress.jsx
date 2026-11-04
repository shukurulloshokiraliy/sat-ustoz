import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtDate } from '../../api.js';
import { useToast } from '../../context.jsx';
import { Card, Empty, Gate, Modal, PageHeader, Segmented, useAsync } from '../../components/ui.jsx';
import { IconChart, IconDownload, IconSend } from '../../components/icons.jsx';
import { rich } from '../../components/Rich.jsx';

const L = ['A', 'B', 'C', 'D'];

/** Excel opens UTF-8 CSV with a BOM; one click per table. */
function exportCsv(name, head, rows) {
  const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = '﻿' + [head, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
}
const ExportBtn = ({ onClick }) => <button className="btn ghost sm" onClick={onClick}><IconDownload width={15} height={15} /> Excel</button>;

/** Teacher: who is stuck where, which questions look wrong, how groups compare. */
export default function Progress() {
  const [tab, setTab] = useState('stuck');
  const st = useAsync(() => api.get('/progress'), []);
  const [msg, setMsg] = useState(null);
  return (
    <div className="page">
      <PageHeader title="Progress" sub="Things to act on: students who are stuck, steps where they stop, questions that may have a wrong key." />
      <Segmented value={tab} onChange={setTab} options={[{ value: 'stuck', label: 'Stuck' }, { value: 'funnel', label: 'Roadmap funnel' }, { value: 'students', label: 'Students' }, { value: 'questions', label: 'Questions' }, { value: 'groups', label: 'Groups' }]} />
      {tab === 'questions' ? <Questions /> : (
        <Gate state={st}>{(d) => (
          tab === 'stuck' ? <Stuck d={d} onMessage={setMsg} />
            : tab === 'funnel' ? <Funnel d={d} onMessage={setMsg} />
              : tab === 'students' ? <Students d={d} />
                : <Groups d={d} />
        )}</Gate>
      )}
      {msg && <MessageModal to={msg} onClose={() => setMsg(null)} />}
    </div>
  );
}

function Stuck({ d, onMessage }) {
  const idle = d.funnel.flatMap((f) => f.stuck.map((s) => ({ ...s, step: `${f.index}. ${f.title}` })));
  return (
    <div className="stack">
      <Card>
        <div className="row between wrap"><h3 className="fin-h" style={{ margin: 0 }}>Failed the same level check 3+ times · {d.failing.length}</h3>
          <ExportBtn onClick={() => exportCsv('failing-checks', ['Student', 'Step', 'Lesson', 'Fails', 'Last scores %', 'Last try'], d.failing.map((f) => [f.name, f.step, f.lesson, f.fails, f.last_scores.join(' / '), fmtDate(f.last_at)]))} /></div>
        {!d.failing.length ? <p className="muted">Nobody is stuck on a level check right now.</p> : (
          <div className="table-wrap"><table className="t">
            <thead><tr><th>Student</th><th>Where</th><th>Fails</th><th>Last scores</th><th>Last try</th><th /></tr></thead>
            <tbody>{d.failing.map((f) => (
              <tr key={`${f.user_id}-${f.item_id}`}>
                <td><Link to={`/students/${f.user_id}`}><b>{f.name}</b></Link></td>
                <td>{f.step}<small className="muted" style={{ display: 'block' }}>{f.lesson}</small></td>
                <td><span className="chip bad">{f.fails}</span></td>
                <td className="nowrap">{f.last_scores.map((x) => `${x}%`).join(' · ')}</td>
                <td className="nowrap muted">{fmtDate(f.last_at, { day: 'numeric', month: 'short' })}</td>
                <td><button className="btn soft sm" onClick={() => onMessage({ id: f.user_id, name: f.name, hint: `I saw you are working on “${f.lesson}”. ` })}><IconSend width={14} height={14} /> Message</button></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>
      <Card>
        <div className="row between wrap"><h3 className="fin-h" style={{ margin: 0 }}>No progress for 7+ days · {idle.length}</h3>
          <ExportBtn onClick={() => exportCsv('idle-students', ['Student', 'Current step', 'Last active'], idle.map((s) => [s.name, s.step, s.last_day ? fmtDate(s.last_day) : 'never']))} /></div>
        {!idle.length ? <p className="muted">Everyone studied this week.</p> : (
          <div className="as-people" style={{ marginTop: 10 }}>
            {idle.map((s) => (
              <span key={s.id} className="as-person"><b><Link to={`/students/${s.id}`}>{s.name}</Link></b><span>{s.step} · {s.last_day ? `last ${fmtDate(s.last_day, { day: 'numeric', month: 'short' })}` : 'never active'}</span>
                <button className="link-btn" onClick={() => onMessage({ id: s.id, name: s.name, hint: '' })}>Message</button></span>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function Funnel({ d, onMessage }) {
  const max = Math.max(1, ...d.funnel.map((f) => f.reached));
  return (
    <Card>
      <div className="row between wrap"><h3 className="fin-h" style={{ margin: 0 }}>Roadmap funnel</h3>
        <ExportBtn onClick={() => exportCsv('roadmap-funnel', ['Step', 'Reached', 'Passed', 'Stuck 7+ days'], d.funnel.map((f) => [`${f.index}. ${f.title}`, f.reached, f.passed, f.stuck.length]))} /></div>
      <div className="pf-funnel">
        {d.funnel.map((f) => (
          <div key={f.id} className="pf-row">
            <span className="pf-name">{f.index}. {f.title}</span>
            <div className="pf-bars">
              <i className="r" style={{ width: `${(f.reached / max) * 100}%` }} title={`${f.reached} reached`} />
              <i className="p" style={{ width: `${(f.passed / max) * 100}%` }} title={`${f.passed} passed`} />
            </div>
            <span className="pf-n"><b>{f.reached}</b> reached · <b>{f.passed}</b> passed{f.stuck.length ? <> · <button className="link-btn bad-text" onClick={() => onMessage({ id: f.stuck[0].id, name: f.stuck[0].name, hint: '' })}>{f.stuck.length} stuck</button></> : ''}</span>
          </div>
        ))}
      </div>
      <div className="fin-legend"><span><i className="a" style={{ background: '#93A8FF' }} />Reached</span><span><i className="b" style={{ background: '#22B07D' }} />Passed</span></div>
    </Card>
  );
}

function Students({ d }) {
  const [sort, setSort] = useState('name');
  const rows = useMemo(() => [...d.students].sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : (b[sort] ?? -1) - (a[sort] ?? -1))), [d.students, sort]);
  const th = (k, label) => <th><button className="link-btn" onClick={() => setSort(k)}>{label}{sort === k ? ' ↓' : ''}</button></th>;
  return (
    <Card>
      <div className="row between wrap"><h3 className="fin-h" style={{ margin: 0 }}>Every student · {rows.length}</h3>
        <ExportBtn onClick={() => exportCsv('students-progress', ['Student', 'Group', 'Current step', 'Steps done', 'Level checks', 'Passed', 'Quiz avg %', 'Vocab avg %', 'Minutes this week', 'Estimate'], rows.map((r) => [r.name, r.group, r.step, `${r.steps_done}/${r.steps_total}`, r.checks, r.checks_passed, r.quiz_avg, r.vocab_avg, r.week_min, r.estimate]))} /></div>
      <div className="table-wrap"><table className="t">
        <thead><tr>{th('name', 'Student')}<th>Current step</th>{th('steps_done', 'Steps')}{th('checks', 'Level checks')}{th('quiz_avg', 'Quiz avg')}{th('vocab_avg', 'Vocab')}{th('week_min', 'This week')}{th('estimate', 'Estimate')}</tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.id} className={r.idle ? 'pf-idle' : ''}>
            <td><Link to={`/students/${r.id}`}><b>{r.name}</b></Link><small className="muted" style={{ display: 'block' }}>{r.group}</small></td>
            <td>{r.step}</td><td className="nowrap">{r.steps_done}/{r.steps_total}</td>
            <td className="nowrap">{r.checks ? `${r.checks_passed} passed of ${r.checks}` : '—'}</td>
            <td>{r.quiz_avg != null ? `${r.quiz_avg}%` : '—'}</td><td>{r.vocab_avg != null ? `${r.vocab_avg}%` : '—'}</td>
            <td className="nowrap">{r.week_min ? `${r.week_min} min` : <span className="muted">—</span>}</td><td><b>{r.estimate ?? '—'}</b></td>
          </tr>
        ))}</tbody>
      </table></div>
    </Card>
  );
}

function Groups({ d }) {
  if (!d.groups.length) return <Card><Empty icon={<IconChart />} title="No groups yet" text="Create groups to compare them here." /></Card>;
  return (
    <Card>
      <div className="row between wrap"><h3 className="fin-h" style={{ margin: 0 }}>Groups</h3>
        <ExportBtn onClick={() => exportCsv('groups', ['Group', 'Students', 'Avg steps done', 'Avg quiz %', 'Avg estimate', 'Avg minutes this week'], d.groups.map((g) => [g.name, g.students, g.steps_done, g.quiz_avg, g.estimate, g.week_min]))} /></div>
      <div className="table-wrap"><table className="t">
        <thead><tr><th>Group</th><th>Students</th><th>Avg steps done</th><th>Avg quiz score</th><th>Avg estimate</th><th>Avg minutes / week</th></tr></thead>
        <tbody>{d.groups.map((g) => <tr key={g.id}><td><b>{g.name}</b></td><td>{g.students}</td><td>{g.steps_done ?? '—'}</td><td>{g.quiz_avg != null ? `${g.quiz_avg}%` : '—'}</td><td>{g.estimate ?? '—'}</td><td>{g.week_min ?? '—'}</td></tr>)}</tbody>
      </table></div>
    </Card>
  );
}

function Questions() {
  const toast = useToast();
  const [src, setSrc] = useState('qbank');
  const st = useAsync(() => api.get(`/progress/questions?source=${src}`), [src]);
  const fix = async (r, k) => {
    try {
      if (src === 'qbank') await api.put(`/qbank/admin/${encodeURIComponent(r.id)}`, { answer: k });
      else await api.post(`/progress/quiz-question/${r.id}/key`, { correct: L[k] });
      toast(`Key changed to ${L[k]} — past answers re-graded`); st.reload();
    } catch (e) { toast(e.message, 'bad'); }
  };
  return (
    <div className="stack">
      <div className="row between wrap">
        <Segmented value={src} onChange={setSrc} options={[{ value: 'qbank', label: 'Question Bank' }, { value: 'quiz', label: 'Your quizzes' }]} />
        {st.data && <ExportBtn onClick={() => exportCsv(`questions-${src}`, ['Id', 'Skill / quiz', 'Answers', '% correct', 'A', 'B', 'C', 'D', 'Key', 'Likely wrong key'], st.data.rows.map((r) => [r.id, r.skill, r.n, r.pct, ...r.picks, L[r.key], r.suspect ? `maybe ${L[r.likely]}` : '']))} />}
      </div>
      <Gate state={st}>{(d) => (!d.rows.length ? <Card><Empty icon={<IconChart />} title="Not enough answers yet" text="Questions show here once at least 3 students answered them." /></Card> : (
        <div className="stack">
          {d.rows.slice(0, 60).map((r) => (
            <Card key={r.id} className={`pf-q ${r.suspect ? 'suspect' : ''}`}>
              <div className="row wrap" style={{ gap: 8 }}>
                <span className="chip">{r.id}</span><span className="chip domain">{r.skill}</span>
                <span className={`chip ${r.pct < 40 ? 'bad' : r.pct < 70 ? 'warn' : 'good'}`}>{r.pct}% correct · {r.n} answers</span>
                {r.suspect ? <span className="chip bad">Strong students mostly chose {L[r.likely]} — check the key</span> : null}
              </div>
              {r.passage && <p className="muted pf-pass">{rich(r.passage)}</p>}
              <p><b>{rich(r.text)}</b></p>
              <div className="pf-picks">
                {r.options.map((o, k) => {
                  const share = r.n ? Math.round((r.picks[k] / r.n) * 100) : 0;
                  return (
                    <div key={k} className={`pf-pick ${k === r.key ? 'key' : ''} ${r.suspect && k === r.likely ? 'likely' : ''}`}>
                      <span className="pf-bar" style={{ width: `${share}%` }} />
                      <b>{L[k]}</b><span className="grow">{rich(o)}</span><span className="nowrap">{share}%</span>
                      {k !== r.key && <button className="link-btn" onClick={() => fix(r, k)}>make {L[k]} the key</button>}
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      ))}</Gate>
    </div>
  );
}

function MessageModal({ to, onClose }) {
  const toast = useToast();
  const [text, setText] = useState(to.hint || '');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try { await api.post('/progress/message', { user_id: to.id, text }); toast(`Sent to ${to.name}`); onClose(); } catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  return (
    <Modal title={`Message ${to.name}`} onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || !text.trim()} onClick={send}>Send</button></>}>
      <div className="stack">
        <textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder="Let's look at this lesson together on Tuesday…" autoFocus />
        <small className="muted">They see it in “Ask Ustoz” on the website, and on Telegram if they linked the bot.</small>
      </div>
    </Modal>
  );
}
