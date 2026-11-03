import { Link } from 'react-router-dom';
import { fmtDate } from '../../api.js';
import { Card } from '../../components/ui.jsx';

const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);
const tone = (p) => (p == null ? '' : p >= 80 ? 'hi' : p >= 50 ? 'mid' : 'lo');
const when = (d) => (d ? fmtDate(d, { day: 'numeric', month: 'short' }) : '—');

export const SECTIONS = {
  lessons: ['Lessons', '#2A55E5'], quiz: ['Quizzes', '#8E5CF7'], mock: ['Take a quiz', '#C0392B'], qbank: ['Question Bank', '#1E8E4E'],
  practice: ['Practice tests', '#F28B4E'], vocab: ['Vocabulary', '#E8A93C'], arena: ['Word Arena', '#3CCB9A'], placement: ['Placement', '#5C88FF'],
  home: ['Dashboard', '#9AA3BF'], other: ['Other pages', '#C9CFDB'],
};
const mins = (sec) => Math.round(sec / 60);
const fmtMin = (sec) => { const m = mins(sec); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`; };
const dayKey = (d) => d.toISOString().slice(0, 10);
const daysBack = (n) => Array.from({ length: n }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (n - 1) + i); return dayKey(d); });

/** Plain-language findings for the teacher. tone: good | warn | bad */
function analyse(r, self) {
  const out = [];
  const T = (teacher, you) => (self ? you : teacher);
  const last7 = new Set(daysBack(7)); const prev7 = new Set(daysBack(14).slice(0, 7));
  const sum = (set) => r.time.filter((t) => set.has(t.day)).reduce((s, t) => s + t.seconds, 0);
  const w = sum(last7); const pw = sum(prev7);
  const activeDays = new Set(r.time.filter((t) => last7.has(t.day) && t.seconds >= 60).map((t) => t.day)).size;
  if (!w) out.push(['bad', T('No time on the platform in the last 7 days.', 'You have not studied on the platform in the last 7 days. Even 20 minutes a day makes a difference.')]);
  else {
    const change = pw ? Math.round(((w - pw) / pw) * 100) : null;
    out.push([w >= 150 * 60 ? 'good' : w >= 60 * 60 ? 'warn' : 'bad', `${fmtMin(w)} ${T('on the platform', 'of study')} this week${change == null ? '' : ` (${change >= 0 ? '+' : ''}${change}% vs the week before)`}.`]);
    out.push([activeDays >= 5 ? 'good' : activeDays >= 3 ? 'warn' : 'bad', `${T('Studied', 'You studied')} on ${activeDays} of the last 7 days${activeDays <= 2 ? T(': not regular yet', '. Try to study a little every day') : ''}.`]);
  }
  const by = {}; r.time.filter((t) => last7.has(t.day)).forEach((t) => { by[t.section] = (by[t.section] || 0) + t.seconds; });
  const top = Object.entries(by).sort((a, b) => b[1] - a[1])[0];
  if (top && w) {
    const share = Math.round((top[1] / w) * 100);
    out.push([top[0] === 'arena' && share > 50 ? 'warn' : 'good', `Most time this week: ${SECTIONS[top[0]]?.[0] || top[0]} (${share}%).${top[0] === 'arena' && share > 50 ? T(' Mostly games: ask for more Question Bank or Take a quiz.', ' Great for words, but add Question Bank or Take a quiz for SAT questions.') : ''}`]);
    if (!by.qbank && !by.mock && !by.quiz) out.push(['warn', T('No SAT question practice this week (Question Bank, Take a quiz or quizzes).', 'No SAT questions this week yet: try the Question Bank or Take a quiz.')]);
  }
  if (r.quizzes_available && !self) out.push([r.quizzes.length >= r.quizzes_available ? 'good' : 'warn', `${T('Finished', 'You finished')} ${new Set(r.quizzes.map((q) => q.title)).size} of ${r.quizzes_available} available teacher quizzes.`]);
  if (r.vocab.due > 20) out.push(['warn', `${r.vocab.due} vocabulary words are waiting for review${T('', ': open Vocabulary and press Review')}.`]);
  else if (r.vocab.learned + r.vocab.learning === 0) out.push(['warn', T('Has not started Vocabulary yet.', 'You have not started Vocabulary yet: Set 1 is open.')]);
  const weak = r.qbank.skills.filter((x) => x.answered >= 3 && x.correct / x.answered < 0.5).map((x) => `${x.skill} (${Math.round((x.correct / x.answered) * 100)}%)`);
  if (weak.length) out.push(['bad', `${T('Weak skills', 'Practise these skills next')}: ${weak.slice(0, 3).join(', ')}.`]);
  if (r.mocks.length >= 4) {
    const avg = (a) => a.reduce((s, m) => s + m.score / m.total, 0) / a.length;
    const d = Math.round((avg(r.mocks.slice(0, 2)) - avg(r.mocks.slice(2, 4))) * 100);
    out.push([d >= 0 ? 'good' : 'bad', `Take a quiz trend: ${d >= 0 ? 'up' : 'down'} ${Math.abs(d)} points (last 2 vs previous 2).`]);
  }
  if (r.lessons.total) out.push([r.lessons.done / r.lessons.total >= 0.5 ? 'good' : 'warn', `Lessons: ${r.lessons.done} of ${r.lessons.total} steps done${r.lessons.last ? `, last on ${when(r.lessons.last)}` : ''}.`]);
  return out;
}

function TimeBlock({ r }) {
  const days = daysBack(14);
  const per = Object.fromEntries(days.map((d) => [d, {}]));
  r.time.forEach((t) => { if (per[t.day]) per[t.day][t.section] = (per[t.day][t.section] || 0) + t.seconds; });
  const totals = days.map((d) => Object.values(per[d]).reduce((s, x) => s + x, 0));
  const max = Math.max(60 * 30, ...totals);
  const today = totals[totals.length - 1];
  const week = totals.slice(7).reduce((s, x) => s + x, 0);
  const active = totals.slice(7).filter((x) => x >= 60).length;
  const month = {}; r.time.filter((t) => daysBack(28).includes(t.day)).forEach((t) => { month[t.section] = (month[t.section] || 0) + t.seconds; });
  const mTotal = Object.values(month).reduce((s, x) => s + x, 0);
  return (
    <Card>
      <div className="row between wrap" style={{ gap: 10 }}>
        <h3 className="sr-h" style={{ margin: 0 }}>Time on the platform</h3>
        <div className="sr-time-kpis"><span><b>{fmtMin(today)}</b> today</span><span><b>{fmtMin(week)}</b> this week</span><span><b>{active ? fmtMin(week / active) : '0 min'}</b> per active day</span></div>
      </div>
      {!r.time.length ? <p className="muted" style={{ marginTop: 12 }}>No time recorded yet. Time is counted from now on while the student uses the site.</p> : (
        <>
          <div className="sr-stack" role="img" aria-label="Minutes per day, last 14 days">
            {days.map((d, i) => (
              <div key={d} className="sr-col" title={`${d}: ${fmtMin(totals[i])}`}>
                <div className="sr-col-bar" style={{ height: `${(totals[i] / max) * 100}%` }}>
                  {Object.entries(per[d]).sort((a, b) => b[1] - a[1]).map(([sec, v]) => <i key={sec} style={{ flexGrow: v, background: SECTIONS[sec]?.[1] || '#ccc' }} />)}
                </div>
                <small>{new Date(d).getDate()}</small>
              </div>
            ))}
          </div>
          <div className="sr-split">
            {Object.entries(month).sort((a, b) => b[1] - a[1]).map(([sec, v]) => (
              <div key={sec}><span><i style={{ background: SECTIONS[sec]?.[1] }} />{SECTIONS[sec]?.[0] || sec}</span><b>{fmtMin(v)}</b><em><u style={{ width: `${(v / mTotal) * 100}%`, background: SECTIONS[sec]?.[1] }} /></em></div>
            ))}
          </div>
          <small className="muted">Bars: last 14 days. Breakdown: last 28 days. Only active time counts (page open and in use).</small>
        </>
      )}
    </Card>
  );
}

/** Everything a student did: time, activity, lessons, Question Bank, quizzes, vocabulary, Word Arena. */
export default function StudentReport({ r, self = false }) {
  const insights = analyse(r, self);
  const qbP = pct(r.qbank.correct, r.qbank.answered);
  const mockAvg = r.mocks.length ? pct(r.mocks.reduce((s, m) => s + m.score, 0), r.mocks.reduce((s, m) => s + m.total, 0)) : null;
  const lessonP = pct(r.lessons.done, r.lessons.total);
  const byDay = new Map(r.days.map((d) => [d.day, d.n]));
  const today = new Date();
  const cells = Array.from({ length: 28 }, (_, i) => {
    const d = new Date(today); d.setDate(today.getDate() - 27 + i);
    const key = d.toISOString().slice(0, 10);
    return { key, n: byDay.get(key) || 0 };
  });
  const activeDays = cells.filter((c) => c.n).length;
  const weak = [...r.qbank.skills].filter((s) => s.answered >= 3).sort((a, b) => a.correct / a.answered - b.correct / b.answered).slice(0, 3);

  return (
    <div className="stack">
      <Card className="sr-insights">
        <h3 className="sr-h">{self ? 'What your results say' : 'Analysis'}</h3>
        <ul>{insights.map(([t, text], i) => <li key={i} className={t}>{text}</li>)}</ul>
      </Card>
      <TimeBlock r={r} />
      <div className="sr-kpis">
        <Kpi label="Question Bank accuracy" value={qbP == null ? '—' : `${qbP}%`} sub={`${r.qbank.correct}/${r.qbank.answered} answers`} t={tone(qbP)} />
        <Kpi label="Take a quiz average" value={mockAvg == null ? '—' : `${mockAvg}%`} sub={`${r.mocks.length} quizzes`} t={tone(mockAvg)} />
        <Kpi label="Lessons done" value={lessonP == null ? '—' : `${lessonP}%`} sub={`${r.lessons.done}/${r.lessons.total} steps`} t={tone(lessonP)} />
        <Kpi label="Words learned" value={r.vocab.learned} sub={`${r.vocab.learning} learning · ${r.vocab.due} due`} />
        <Kpi label="Word Arena" value={r.arena.games} sub={r.arena.games ? `games · best ${r.arena.best} pts` : 'games'} />
        <Kpi label="Active days (28)" value={activeDays} sub={`last: ${when([r.qbank.last, r.vocab.last, r.arena.last, r.lessons.last].filter(Boolean).sort().pop())}`} t={activeDays >= 12 ? 'hi' : activeDays >= 5 ? 'mid' : 'lo'} />
      </div>

      <Card>
        <h3 className="sr-h">Activity · last 4 weeks</h3>
        <div className="sr-heat" aria-label={`${activeDays} active days out of 28`}>
          {cells.map((c) => <i key={c.key} title={`${c.key}: ${c.n} actions`} className={c.n === 0 ? '' : c.n < 5 ? 'l1' : c.n < 15 ? 'l2' : 'l3'} />)}
        </div>
      </Card>

      <div className="grid g2">
        <Card>
          <h3 className="sr-h">Question Bank by skill</h3>
          {!r.qbank.skills.length ? <p className="muted">No Question Bank answers yet.</p> : (
            <div className="sr-skills">
              {r.qbank.skills.map((s) => {
                const p = pct(s.correct, s.answered);
                return <div key={s.skill}><span>{s.skill}</span><b>{s.correct}/{s.answered}</b><i><em className={tone(p)} style={{ width: `${p}%` }} /></i></div>;
              })}
            </div>
          )}
          {weak.length > 0 && <p className="sr-note"><b>Needs work:</b> {weak.map((w) => w.skill).join(', ')}</p>}
        </Card>
        <Card>
          <h3 className="sr-h">Take a quiz (random modules)</h3>
          {!r.mocks.length ? <p className="muted">No random quizzes yet.</p> : (
            <>
              <div className="sr-bars">{[...r.mocks].reverse().map((m) => <i key={m.id} title={`${when(m.finished_at)}: ${m.score}/${m.total}`} className={tone(pct(m.score, m.total))} style={{ height: `${Math.max(6, pct(m.score, m.total))}%` }} />)}</div>
              <List rows={r.mocks.slice(0, 6).map((m) => [when(m.finished_at), 'Random module', `${m.score}/${m.total}`, pct(m.score, m.total)])} />
            </>
          )}
        </Card>
      </div>

      <div className="grid g2">
        {(r.full || []).length > 0 && <Card>
          <h3 className="sr-h">Full mocks</h3>
          <List rows={r.full.slice(0, 8).map((f) => [when(f.finished_at), self ? <Link key={f.id} to={`/full-mock/result/${f.id}`}>{f.title}</Link> : `${f.title}${f.route ? ` · ${f.route} M2` : ''}`, `${f.score} (${f.low}–${f.high})`, pct(f.m1_correct + f.m2_correct, f.m1_total + f.m2_total)])} />
        </Card>}
        {(!self || r.quizzes.length > 0) && <Card>
          <h3 className="sr-h">{self ? 'Quizzes' : 'Teacher quizzes'}</h3>
          {!r.quizzes.length ? <p className="muted">No quizzes finished yet.</p> : <List rows={r.quizzes.slice(0, 8).map((q) => [when(q.finished_at), <Link key={q.id} to={`/result/${q.id}`}>{q.title}</Link>, q.total ? `${q.score}/${q.total}` : `${q.score}%`, q.total ? pct(q.score, q.total) : q.score])} />}
        </Card>}
        <Card>
          <h3 className="sr-h">Lesson level checks</h3>
          {!r.lessons.checks.length ? <p className="muted">No level checks yet.</p> : <List rows={r.lessons.checks.slice(0, 8).map((c) => [when(c.finished_at), c.title, `${c.score}/${c.total}${c.passed ? ' · passed' : ''}`, pct(c.score, c.total)])} />}
        </Card>
      </div>

      <div className="grid g2">
        <Card>
          <h3 className="sr-h">Practice tests (27 questions)</h3>
          {!r.practice?.length ? <p className="muted">No practice tests yet.</p> : <List rows={r.practice.slice(0, 8).map((p) => [when(p.finished_at), 'Reading & Writing practice test', `${p.score}/${p.total}`, pct(p.score, p.total)])} />}
        </Card>
        <Card>
          <h3 className="sr-h">Flashcard reviews</h3>
          {!r.reviews?.length ? <p className="muted">No flashcards reviewed in the last 4 weeks.</p> : (
            <>
              <div className="sr-bars">{r.reviews.map((d) => <i key={d.day} title={`${d.day}: ${d.n} cards`} className="hi" style={{ height: `${Math.max(8, (d.n / Math.max(...r.reviews.map((x) => x.n))) * 100)}%` }} />)}</div>
              <p className="muted" style={{ margin: 0 }}>{r.reviews.reduce((s2, d) => s2 + d.n, 0)} cards on {r.reviews.length} days · {r.vocab.learned} words learned, {r.vocab.due} due now</p>
            </>
          )}
        </Card>
      </div>

      <div className="grid g2">
        <Card>
          <h3 className="sr-h">Vocabulary tests</h3>
          {!r.vocab.tests.length ? <p className="muted">No vocabulary tests yet.</p> : <List rows={r.vocab.tests.slice(0, 8).map((t) => [when(t.created_at), t.title ? `Unit ${t.n}: ${t.title}` : 'Review', `${t.score}/${t.total}`, pct(t.score, t.total)])} />}
        </Card>
        <Card>
          <h3 className="sr-h">Word Arena</h3>
          {!r.arena.games ? <p className="muted">Has not played yet.</p> : (
            <div className="sr-arena">
              <div><b>{r.arena.games}</b><span>games</span></div>
              <div><b>{pct(r.arena.correct, r.arena.answered) ?? '—'}%</b><span>right answers</span></div>
              <div><b>{r.arena.best}</b><span>best score</span></div>
              <div><b>{when(r.arena.last)}</b><span>last game</span></div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

const Kpi = ({ label, value, sub, t = '' }) => <div className={`sr-kpi ${t}`}><small>{label}</small><b>{value}</b><span>{sub}</span></div>;
const List = ({ rows }) => (
  <ul className="sr-list">
    {rows.map(([d, name, score, p], i) => <li key={i}><span className="d">{d}</span><span className="n">{name}</span><b className={tone(p)}>{score}</b></li>)}
  </ul>
);
