import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { useToast } from '../../context.jsx';
import { Card, Confirm, Modal, PageHeader, Segmented, Spinner } from '../../components/ui.jsx';
import { IconEye, IconEyeOff, IconSearch, IconTrash, IconUpload } from '../../components/icons.jsx';
import { Passage } from '../../components/Passage.jsx';
import { rich } from '../../components/Rich.jsx';

const L = ['A', 'B', 'C', 'D'];
const LEVEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
const RES = { exam: 'Reserved · exam', lesson: 'Reserved · lesson' };

/** Teacher: the Question Bank, 50 questions a page with server-side search and filters. */
export default function QbankAdmin() {
  const toast = useToast();
  const fileRef = useRef(null);
  const [premiumImport, setPremiumImport] = useState(false);
  const [f, setF] = useState({ q: '', skill: 'all', level: 'all', view: 'all', reserved: 'all', src: 'all', page: 1 });
  const [qText, setQText] = useState('');
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [counts, setCounts] = useState(null);
  const [sel, setSel] = useState(() => new Set());
  const [del, setDel] = useState(null);
  const [usage, setUsage] = useState(null);
  const seq = useRef(0);

  const load = async (withCounts = false) => {
    const my = ++seq.current;
    const p = new URLSearchParams({ ...f, counts: withCounts || !counts ? '1' : '0' });
    try {
      const d = await api.get('/qbank/admin?' + p);
      if (my !== seq.current) return;
      setData(d); setErr(null); if (d.counts) setCounts(d.counts);
    } catch (e) { if (my === seq.current) setErr(e); }
  };
  useEffect(() => { load(); }, [f]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(() => setF((x) => (x.q === qText ? x : { ...x, q: qText, page: 1 })), 350); return () => clearTimeout(t); }, [qText]);
  const set = (k, v) => { setF((x) => ({ ...x, [k]: v, page: 1 })); setSel(new Set()); };

  const importFile = async (file) => {
    if (!file) return;
    const form = new FormData(); form.append('file', file); form.append('premium', String(premiumImport));
    try {
      const r = await api.upload('/qbank/import', form);
      toast(`${r.imported} ${r.premium ? 'premium ' : ''}questions imported into ${r.skill}${r.duplicate_count ? ` · ${r.duplicate_count} skipped as duplicates (e.g. ${r.duplicates[0].id} = #${r.duplicates[0].of})` : ''}`);
      load(true);
    } catch (e) { toast(e.message, 'bad'); } finally { if (fileRef.current) fileRef.current.value = ''; }
  };
  const put = async (r, body, msg) => {
    try { await api.put(`/qbank/admin/${encodeURIComponent(r.id)}`, body); toast(msg); load(); } catch (e) { toast(e.message, 'bad'); }
  };
  const bulk = async (setBody, msg) => {
    try { await api.post('/qbank/admin/bulk', { ids: [...sel], set: setBody }); toast(`${msg} · ${sel.size} questions`); setSel(new Set()); load(true); } catch (e) { toast(e.message, 'bad'); }
  };
  const rows = data?.rows || [];
  const allOn = rows.length > 0 && rows.every((r) => sel.has(r.id));

  return (
    <div className="page">
      <PageHeader title="Question Bank" sub="Practice and the Question Bank use regular questions. Premium = only in full mocks. Reserved = used in an exam or lesson check, so never shown in practice.">
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => importFile(e.target.files?.[0])} />
        <div className="row wrap" style={{ gap: 8 }}>
          <Link className="btn ghost" to="/question-bank">Student view</Link>
          <label className="switch-row"><input type="checkbox" checked={premiumImport} onChange={(e) => setPremiumImport(e.target.checked)} /> Import as premium</label>
          <button className="btn primary" onClick={() => fileRef.current?.click()}><IconUpload width={16} height={16} /> Import questions (JSON)</button>
        </div>
      </PageHeader>

      <Card className="qb-filters">
        <select value={f.skill} onChange={(e) => set('skill', e.target.value)} aria-label="Skill">
          <option value="all">All skills{counts ? ` · ${counts.all}` : ''}</option>
          {(counts?.skills || []).map((s) => <option key={s.id} value={s.id}>{s.name} · {s.n}</option>)}
        </select>
        <Segmented value={f.level} onChange={(v) => set('level', v)} options={[{ value: 'all', label: 'All' }, { value: 'easy', label: 'Easy' }, { value: 'medium', label: 'Medium' }, { value: 'hard', label: 'Hard' }]} />
        <select value={f.view} onChange={(e) => set('view', e.target.value)} aria-label="Type">
          <option value="all">Regular + premium</option><option value="regular">Regular only</option><option value="premium">Premium{counts ? ` · ${counts.premium}` : ''}</option>
        </select>
        <select value={f.reserved} onChange={(e) => set('reserved', e.target.value)} aria-label="Reserved">
          <option value="all">Reserved or not</option><option value="any">Reserved{counts ? ` · ${counts.reserved}` : ''}</option><option value="exam">Reserved · exam</option><option value="lesson">Reserved · lesson</option><option value="none">Not reserved</option>
        </select>
        <select value={f.src} onChange={(e) => set('src', e.target.value)} aria-label="Source">
          <option value="all">Any source</option><option value="bundled">Built-in</option><option value="upload">Imported</option>
        </select>
        <label className="qb-search"><IconSearch width={16} height={16} /><input value={qText} onChange={(e) => setQText(e.target.value)} placeholder="Find a phrase from the passage, question or id" /></label>
      </Card>

      <div className="qb-bar">
        <label className="row" style={{ gap: 8, cursor: 'pointer' }}><input type="checkbox" checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(rows.map((r) => r.id)))} /> <span className="muted">{data ? `${data.total.toLocaleString('en-US')} questions · page ${data.page} of ${data.pages}` : 'Loading…'}</span></label>
        {sel.size > 0 && (
          <div className="qb-bulk">
            <b>{sel.size} selected</b>
            <select defaultValue="" onChange={(e) => { if (e.target.value) bulk({ difficulty: e.target.value }, `Difficulty → ${LEVEL[e.target.value]}`); e.target.value = ''; }}>
              <option value="">Difficulty…</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
            </select>
            <select defaultValue="" onChange={(e) => { if (e.target.value) bulk({ skill_id: e.target.value }, 'Skill changed'); e.target.value = ''; }}>
              <option value="">Skill…</option>{(counts?.skills || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button className="btn ghost sm" onClick={() => bulk({ reserved: 'exam' }, 'Reserved for exams')}>Reserve</button>
            <button className="btn ghost sm" onClick={() => bulk({ reserved: null }, 'Released for practice')}>Un-reserve</button>
            <button className="btn ghost sm" onClick={() => bulk({ premium: true }, 'Premium')}>Premium</button>
            <button className="btn ghost sm" onClick={() => bulk({ active: false }, 'Hidden')}>Hide</button>
            <button className="btn ghost sm" onClick={() => bulk({ active: true }, 'Visible')}>Show</button>
          </div>
        )}
      </div>

      {err ? <p className="error-box">{err.message}</p> : !data ? <Spinner /> : (
        <div className="qb-review">
          {rows.map((r) => (
            <Card key={r.id} className={`rq ${r.active ? '' : 'hidden-q'} ${sel.has(r.id) ? 'picked' : ''}`}>
              <div className="row wrap" style={{ gap: 8 }}>
                <input type="checkbox" aria-label={`Select ${r.id}`} checked={sel.has(r.id)} onChange={() => setSel((s) => { const n = new Set(s); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n; })} />
                <span className="chip">{r.id}</span><span className="chip domain">{r.skill}</span><span className={`chip lvl-${r.difficulty}`}>{LEVEL[r.difficulty]}</span>
                {r.src === 'upload' && <span className="chip sun">Imported</span>}
                {!r.active && <span className="chip warn">Hidden</span>}
                {r.premium && <span className="chip primary">Premium · full mocks only</span>}
                {r.reserved_for && <span className="chip bad" title="Never shown in practice or random tests">{RES[r.reserved_for]}</span>}
                {r.edited && <span className="chip good">Edited</span>}
                <span className="grow" />
                <small className="muted">{r.answered ? `${r.answered} students · ${Math.round((r.first_correct / r.answered) * 100)}% right first time` : 'Not answered yet'}</small>
                <button className="btn ghost sm" onClick={() => setUsage(r)}>Where used</button>
                {r.reserved_for
                  ? <button className="btn ghost sm" onClick={() => api.post('/qbank/reserved', { ids: [r.id], reserved_for: null }).then(() => { toast('Released for practice'); load(true); }).catch((e) => toast(e.message, 'bad'))}>Un-reserve</button>
                  : <button className="btn ghost sm" onClick={() => api.post('/qbank/reserved', { ids: [r.id], reserved_for: 'exam' }).then(() => { toast('Reserved for exams'); load(true); })}>Reserve</button>}
                <button className="btn ghost sm" onClick={() => put(r, { premium: !r.premium }, r.premium ? 'Back to regular questions' : 'Premium: only in full mocks')}>{r.premium ? 'Make regular' : 'Make premium'}</button>
                <button className="icon-sm" title={r.active ? 'Hide from students' : 'Show to students'} aria-label={r.active ? 'Hide' : 'Show'} onClick={() => put(r, { active: !r.active }, r.active ? 'Hidden from students' : 'Visible to students')}>{r.active ? <IconEyeOff width={15} height={15} /> : <IconEye width={15} height={15} />}</button>
                {r.src === 'upload' && <button className="icon-sm danger" aria-label="Delete" onClick={() => setDel(r)}><IconTrash width={15} height={15} /></button>}
              </div>
              {(r.passage || r.table) && <Passage text={r.passage} table={r.table} />}
              <p style={{ fontWeight: 600 }}>{rich(r.prompt)}</p>
              <ul className="qb-opts-review">{r.options.map((o, k) => <li key={k} className={k === r.answer ? 'ok' : ''}><b>{L[k]})</b> {rich(o)}{k === r.answer ? ' · correct' : <button className="link-btn key-fix" onClick={() => put(r, { answer: k }, `Correct answer changed to ${L[k]}`)}>make {L[k]} correct</button>}</li>)}</ul>
              <details className="qb-why"><summary>Explanation and tip</summary><p>{rich(r.explanation)}</p>{r.tip && <div className="tip"><b>Ustoz tip:</b> {rich(r.tip)}</div>}</details>
            </Card>
          ))}
          {!rows.length && <p className="muted center">No questions match.</p>}
        </div>
      )}

      {data && data.pages > 1 && (
        <div className="qb-pager">
          <button className="btn ghost sm" disabled={data.page <= 1} onClick={() => { setF((x) => ({ ...x, page: x.page - 1 })); window.scrollTo({ top: 0 }); }}>← Previous</button>
          <span className="muted">Page {data.page} of {data.pages}</span>
          <button className="btn ghost sm" disabled={data.page >= data.pages} onClick={() => { setF((x) => ({ ...x, page: x.page + 1 })); window.scrollTo({ top: 0 }); }}>Next →</button>
        </div>
      )}

      {del && <Confirm title="Delete question" text={`“${del.id}” will be removed from the Question Bank, together with students' answers to it.`}
        onClose={() => setDel(null)} onConfirm={async () => { await api.del(`/qbank/admin/${encodeURIComponent(del.id)}`); setDel(null); toast('Question deleted'); load(true); }} />}
      {usage && <UsageModal q={usage} onClose={() => setUsage(null)} />}
    </div>
  );
}

function UsageModal({ q, onClose }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { api.get(`/qbank/admin/${encodeURIComponent(q.id)}/usage`).then(setD).catch(setErr); }, [q.id]);
  return (
    <Modal title={`Where “${q.id}” is used`} onClose={onClose}>
      {err ? <p className="error-box">{err.message}</p> : !d ? <Spinner /> : (
        <div className="stack">
          <div><b>Quizzes · {d.quizzes.length}</b>{d.quizzes.length ? <ul className="imp-list">{d.quizzes.map((z) => <li key={z.id}><Link to={`/quizzes/${z.id}/edit`}>{z.title}</Link></li>)}</ul> : <p className="muted">Not in any quiz.</p>}</div>
          <div><b>Roadmap lesson checks · {d.steps.length}</b>{d.steps.length ? <ul className="imp-list">{d.steps.map((s, i) => <li key={i}>{s.step} → {s.lesson}</li>)}</ul> : <p className="muted">Not in any lesson check.</p>}</div>
          <p className="muted">Given in {d.exams} random final exam attempt{d.exams === 1 ? '' : 's'}.</p>
        </div>
      )}
    </Modal>
  );
}
