import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../context.jsx';
import { Gate, PageHeader, Segmented, useAsync } from '../../components/ui.jsx';
import { IconArrow, IconLock } from '../../components/icons.jsx';

const LEVELS = [['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']];

/** Question Bank: pick a domain or skill, difficulty and question status, then practise. */
export default function QuestionBank() {
  const st = useAsync(() => api.get('/qbank'), []);
  return (
    <div className="page">
      <Gate state={st}>{(d) => <Bank d={d} />}</Gate>
    </div>
  );
}

function Bank({ d }) {
  const nav = useNavigate();
  const { user } = useAuth();
  const [scope, setScope] = useState({ kind: 'all' }); // all | domain | skill
  const [levels, setLevels] = useState(() => new Set(d.open_levels));
  const [status, setStatus] = useState('new');
  const [count, setCount] = useState('10');
  const locked = (l) => !d.open_levels.includes(l);
  const allSkills = d.domains.flatMap((x) => x.skills.map((s) => ({ ...s, domain: x.domain })));
  const inScope = scope.kind === 'all' ? allSkills : scope.kind === 'domain' ? allSkills.filter((s) => s.domain === scope.id) : allSkills.filter((s) => s.id === scope.id);
  const available = inScope.reduce((n, s) => n + [...levels].reduce((m, l) => m + (s.per[l] || 0), 0), 0);
  const answered = allSkills.reduce((n, s) => n + s.answered, 0);
  const correct = allSkills.reduce((n, s) => n + s.correct, 0);
  const scopeLabel = scope.kind === 'all' ? 'All Reading and Writing' : scope.kind === 'domain' ? scope.id : allSkills.find((s) => s.id === scope.id)?.name;

  const toggleLevel = (l) => setLevels((s) => { const n = new Set(s); n.has(l) ? n.size > 1 && n.delete(l) : n.add(l); return n; });
  const start = () => {
    const q = new URLSearchParams({ difficulty: [...levels].join(','), status, limit: count });
    if (scope.kind === 'domain') q.set('domain', scope.id);
    if (scope.kind === 'skill') q.set('skill', scope.id);
    nav('/question-bank/practice?' + q.toString());
  };

  const doneAll = allSkills.reduce((n, s) => n + s.answered, 0);
  const isOn = (k, id) => scope.kind === k && (k === 'all' || scope.id === id);
  const startBtn = user.role === 'student'
    ? <button className="btn primary lg block" disabled={!available} onClick={start}>Start {Math.min(available, Number(count))} questions <IconArrow /></button>
    : <Link className="btn soft block" to="/question-bank/manage">Manage questions <IconArrow width={16} height={16} /></Link>;

  return (
    <>
      <PageHeader title="Question Bank" sub="Choose a skill, set the level and practise. Every answer comes with an explanation.">
        {user.role === 'student' && <span className="qb-done"><b>{doneAll}</b> of {d.total} done{answered > 0 && <> · {Math.round((correct / answered) * 100)}% right</>}</span>}
      </PageHeader>

      {!d.open_levels.includes('medium') && (
        <div className="qb-note">
          <span><b>Easy questions are free.</b> Medium and hard open with a subscription.</span>
          <Link to="/subscribe">See plans</Link>
        </div>
      )}

      <div className="qb-layout">
        <div className="qb-list">
          <button type="button" className={`qb-row qb-row-all ${isOn('all') ? 'on' : ''}`} onClick={() => setScope({ kind: 'all' })} aria-pressed={isOn('all')}>
            <i className="qb-radio" /><span className="nm">All skills, mixed</span><span className="ct">{d.total}</span>
          </button>
          {d.domains.map((dm, k) => (
            <section key={dm.domain} className={`qb-group c${k % 4}`}>
              <button type="button" className={`qb-row qb-ghead ${isOn('domain', dm.domain) ? 'on' : ''}`} onClick={() => setScope({ kind: 'domain', id: dm.domain })} aria-pressed={isOn('domain', dm.domain)}>
                <i className="qb-radio" /><span className="nm">{dm.domain}</span><span className="ct">{dm.total}</span>
              </button>
              {dm.skills.map((s) => (
                <button type="button" key={s.id} className={`qb-row ${isOn('skill', s.id) ? 'on' : ''}`} onClick={() => setScope({ kind: 'skill', id: s.id })} aria-pressed={isOn('skill', s.id)}>
                  <i className="qb-radio" /><span className="nm">{s.name}</span>
                  <span className="ct">{user.role === 'student' ? `${s.answered}/${s.total}` : s.total}</span>
                </button>
              ))}
            </section>
          ))}
        </div>

        <aside className="card qb-panel">
          <h2>{scopeLabel}</h2>
          <div className="qb-field">
            <b>Level</b>
            <div className="qb-levels">
              {LEVELS.map(([l, name]) => (
                <button key={l} type="button" disabled={locked(l)} className={`qb-level ${levels.has(l) ? 'on' : ''}`} onClick={() => toggleLevel(l)} aria-pressed={levels.has(l)}>
                  {locked(l) && <IconLock width={14} height={14} />}{name}
                </button>
              ))}
            </div>
          </div>
          <div className="qb-field">
            <b>Which questions</b>
            <Segmented value={status} onChange={setStatus} options={[{ value: 'new', label: 'Not done yet' }, { value: 'mistakes', label: 'My mistakes' }, { value: 'all', label: 'All' }]} />
          </div>
          <div className="qb-field">
            <b>How many</b>
            <Segmented value={count} onChange={setCount} options={[{ value: '5', label: '5' }, { value: '10', label: '10' }, { value: '20', label: '20' }]} />
          </div>
          {!available && <p className="qb-empty">No questions here yet. Try another level or “All”.</p>}
          <div className="qb-go">{startBtn}</div>
        </aside>
      </div>
    </>
  );
}
