import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../context.jsx';
import { Card, Gate, PageHeader, Segmented, useAsync } from '../../components/ui.jsx';
import { IconArrow, IconCheck, IconCrown, IconLock } from '../../components/icons.jsx';

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

  return (
    <>
      <PageHeader title="Question Bank" sub="Original SAT-style Reading and Writing questions, sorted by the skills the digital SAT tests.">
        {user.role === 'student' && <div className="row" style={{ gap: 8 }}>
          <span className="chip">{answered}/{d.total} answered</span>
          {answered > 0 && <span className="chip primary">{Math.round((correct / answered) * 100)}% correct</span>}
        </div>}
      </PageHeader>

      {!d.open_levels.includes('medium') && (
        <div className="banner" style={{ marginBottom: 18 }}>
          <span className="item-ic"><IconCrown /></span>
          <div className="grow"><b>Easy questions are free</b><small>Subscribe to open the medium and hard questions in every skill.</small></div>
          <Link className="btn primary sm" to="/subscribe">See plans <IconArrow width={16} height={16} /></Link>
        </div>
      )}

      <div className="qb-layout">
        <Card className="qb-bank">
          <button type="button" className={`qb-all ${scope.kind === 'all' ? 'on' : ''}`} onClick={() => setScope({ kind: 'all' })}>
            <span><b>Reading and Writing</b><small>{d.total} questions</small></span>
            {scope.kind === 'all' && <IconCheck width={18} height={18} />}
          </button>
          {d.domains.map((dm) => (
            <section key={dm.domain} className="qb-domain">
              <button type="button" className={`qb-dhead ${scope.kind === 'domain' && scope.id === dm.domain ? 'on' : ''}`} onClick={() => setScope({ kind: 'domain', id: dm.domain })}>
                <b>{dm.domain}</b><span>{dm.total}</span>
              </button>
              <div className="qb-skills">
                {dm.skills.map((s) => {
                  const on = scope.kind === 'skill' && scope.id === s.id;
                  const pct = s.total ? (s.answered / s.total) * 100 : 0;
                  return (
                    <button type="button" key={s.id} className={`qb-skill ${on ? 'on' : ''}`} onClick={() => setScope({ kind: 'skill', id: s.id })}>
                      <span className="nm">{s.name}</span>
                      <span className="ct">{s.total}</span>
                      {user.role === 'student' && <span className="bar" title={`${s.answered} answered · ${s.correct} correct`}><i style={{ width: `${pct}%` }} /></span>}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </Card>

        <Card className="qb-setup">
          <small className="muted">PRACTICE SET</small>
          <h2>{scopeLabel}</h2>
          <div className="qb-field">
            <b>Difficulty</b>
            <div className="qb-levels">
              {LEVELS.map(([l, name]) => (
                <button key={l} type="button" disabled={locked(l)} className={`qb-level ${levels.has(l) ? 'on' : ''}`} onClick={() => toggleLevel(l)} aria-pressed={levels.has(l)}>
                  {locked(l) ? <IconLock width={14} height={14} /> : levels.has(l) && <IconCheck width={14} height={14} />} {name}
                </button>
              ))}
            </div>
          </div>
          <div className="qb-field">
            <b>Questions</b>
            <Segmented value={status} onChange={setStatus} options={[{ value: 'new', label: 'New' }, { value: 'mistakes', label: 'My mistakes' }, { value: 'all', label: 'All' }]} />
          </div>
          <div className="qb-field">
            <b>How many</b>
            <Segmented value={count} onChange={setCount} options={[{ value: '5', label: '5' }, { value: '10', label: '10' }, { value: '20', label: '20' }]} />
          </div>
          <p className="muted" style={{ fontSize: '.86rem' }}>{available} questions match. You check each answer and see the explanation right away.</p>
          {user.role === 'student'
            ? <button className="btn primary lg block" disabled={!available} onClick={start}>Start practice <IconArrow /></button>
            : <Link className="btn soft block" to="/question-bank/manage">Manage questions <IconArrow width={16} height={16} /></Link>}
        </Card>
      </div>
    </>
  );
}
