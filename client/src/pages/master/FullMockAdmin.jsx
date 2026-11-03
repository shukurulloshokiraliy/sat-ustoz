import { useRef, useState } from 'react';
import { api, fmtDate } from '../../api.js';
import { useToast } from '../../context.jsx';
import { Card, Confirm, Empty, Field, Gate, Modal, PageHeader, useAsync } from '../../components/ui.jsx';
import { IconDoc, IconPlus, IconTrash, IconUpload } from '../../components/icons.jsx';

const MODS = [['1', 'Module 1'], ['2', 'Module 2 (same for everyone)'], ['2h', 'Module 2 · harder'], ['2e', 'Module 2 · easier']];
const LABEL = Object.fromEntries(MODS);

/** Teacher: official full mocks — upload questions (Excel / CSV / PDF text) or a PDF with an answer key, publish, see results. */
export default function FullMockAdmin() {
  const st = useAsync(() => api.get('/full-mocks/admin'), []);
  const [add, setAdd] = useState(false);
  return (
    <div className="page">
      <PageHeader title="Full Mocks" sub="Official full-length mocks for students. Module 1 decides whether students get the harder or easier Module 2.">
        <button className="btn primary" onClick={() => setAdd(true)}><IconPlus width={16} height={16} /> New mock</button>
      </PageHeader>
      <Gate state={st}>{(d) => (
        <>
          <Limits limits={d.limits} />
          {!d.mocks.length ? <Card><Empty icon={<IconDoc />} title="No mocks yet" text="Create one, then upload Module 1 and Module 2." /></Card>
            : <div className="stack">{d.mocks.map((m) => <MockCard key={m.id} m={m} onChange={st.reload} />)}</div>}
        </>
      )}</Gate>
      {add && <NewMock onClose={() => setAdd(false)} onDone={() => { setAdd(false); st.reload(); }} />}
    </div>
  );
}

function Limits({ limits }) {
  const toast = useToast();
  const [f, setF] = useState(limits);
  const save = async () => { try { await api.put('/settings', f); toast('Limits saved'); } catch (e) { toast(e.message, 'bad'); } };
  return (
    <Card>
      <h3 className="sr-h">Weekly limit per student</h3>
      <div className="fm-limits">
        {[['fm_free', 'No subscription'], ['fm_month', 'Monthly plan'], ['fm_quarter', '3-month plan']].map(([k, label]) => (
          <Field key={k} label={label}><input type="number" min="0" max="99" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Field>
        ))}
        <button className="btn soft" onClick={save}>Save limits</button>
      </div>
      <small className="muted">Mocks per week (Monday to Sunday). 7 = every day. A mock counts when the student starts it.</small>
    </Card>
  );
}

function NewMock({ onClose, onDone }) {
  const toast = useToast();
  const [f, setF] = useState({ title: '', note: '', minutes: 32 });
  const save = async () => { try { await api.post('/full-mocks/admin', f); onDone(); } catch (e) { toast(e.message, 'bad'); } };
  return (
    <Modal title="New full mock" onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Create</button></>}>
      <Field label="Title"><input autoFocus placeholder="Official Practice Test 4" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
      <Field label="Note for students (optional)"><input placeholder="Bluebook Practice Test 4, May 2026" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      <Field label="Minutes per module"><input type="number" min="5" max="120" value={f.minutes} onChange={(e) => setF({ ...f, minutes: e.target.value })} /></Field>
    </Modal>
  );
}

function MockCard({ m, onChange }) {
  const toast = useToast();
  const file = useRef(null);
  const pdf = useRef(null);
  const [mod, setMod] = useState('1');
  const [busy, setBusy] = useState(false);
  const [keys, setKeys] = useState(m.keys || {});
  const [del, setDel] = useState(false);
  const [res, setRes] = useState(null);
  const run = async (fn, ok) => { setBusy(true); try { await fn(); if (ok) toast(ok); onChange(); } catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); } };
  const upload = (e) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    const form = new FormData(); form.append('file', f); form.append('module', mod);
    run(async () => { const r = await api.upload(`/full-mocks/admin/${m.id}/import`, form); toast(`Added: ${Object.entries(r.added).map(([k, v]) => `${LABEL[k]} ${v}`).join(', ')}`); });
  };
  const uploadPdf = (e) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    const form = new FormData(); form.append('file', f);
    run(() => api.upload(`/full-mocks/admin/${m.id}/pdf`, form), 'PDF uploaded');
  };
  return (
    <Card className="fm-admin">
      <div className="row between wrap" style={{ gap: 10 }}>
        <div>
          <h3>{m.title}</h3>
          <small className="muted">{m.mode === 'pdf' ? `PDF${m.pdf_name ? ` · ${m.pdf_name}` : ''}` : 'Questions'} · 2 × {m.minutes} min · taken {m.taken}×{m.avg ? ` · average ${m.avg}` : ''}</small>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <label className="switch-row"><input type="checkbox" checked={m.published} disabled={busy}
            onChange={(e) => run(() => api.put(`/full-mocks/admin/${m.id}`, { published: e.target.checked }), e.target.checked ? 'Published for students' : 'Hidden from students')} /> Published</label>
          <button className="btn ghost sm" onClick={async () => setRes(await api.get(`/full-mocks/admin/${m.id}/results`))}>Results</button>
          <button className="icon-btn" onClick={() => setDel(true)} aria-label="Delete mock"><IconTrash width={18} height={18} /></button>
        </div>
      </div>

      <div className="fm-mods">
        {MODS.map(([k, label]) => (
          <span key={k} className={`chip ${m.modules[k] ? 'good' : ''}`}>{label}: {m.modules[k] || 0}
            {m.modules[k] && m.mode !== 'pdf' ? <button className="link-btn" onClick={() => run(() => api.del(`/full-mocks/admin/${m.id}/module/${k}`), 'Removed')}>×</button> : null}</span>
        ))}
        {!m.ready && <span className="chip warn">Needs Module 1 and Module 2 (or harder + easier)</span>}
      </div>

      <div className="fm-up">
        <div>
          <b>Questions file</b>
          <small className="muted">Excel, CSV or PDF text with columns passage, question, A, B, C, D, correct (explanation, difficulty optional). A <code>module</code> column (1, 2, 2 hard, 2 easy) splits one file; otherwise pick the module.</small>
          <div className="row wrap" style={{ gap: 8, marginTop: 8 }}>
            <select value={mod} onChange={(e) => setMod(e.target.value)}>{MODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            <button className="btn soft" disabled={busy} onClick={() => file.current?.click()}><IconUpload width={16} height={16} /> Upload questions</button>
            <a className="link-btn" href="/api/template.xlsx">Template</a>
          </div>
          <input ref={file} type="file" hidden accept=".xlsx,.xls,.csv,.pdf,.txt" onChange={upload} />
        </div>
        <div>
          <b>Or: original PDF + answer key</b>
          <small className="muted">Students read the PDF and fill an answer sheet. Type the key as letters, e.g. BADC… (one letter per question).</small>
          <div className="row wrap" style={{ gap: 8, marginTop: 8 }}>
            <button className="btn soft" disabled={busy} onClick={() => pdf.current?.click()}><IconUpload width={16} height={16} /> {m.pdf_name ? 'Replace PDF' : 'Upload PDF'}</button>
          </div>
          <input ref={pdf} type="file" hidden accept="application/pdf" onChange={uploadPdf} />
          {m.mode === 'pdf' && (
            <div className="fm-keys">
              {MODS.map(([k, label]) => (
                <Field key={k} label={`${label} key${keys[k] ? ` (${String(keys[k]).replace(/[^ABCD]/gi, '').length})` : ''}`}>
                  <input value={keys[k] || ''} placeholder={k === '1' ? 'BADCABDC…' : 'optional'} onChange={(e) => setKeys({ ...keys, [k]: e.target.value.toUpperCase() })} />
                </Field>
              ))}
              <button className="btn primary" disabled={busy} onClick={() => run(() => api.put(`/full-mocks/admin/${m.id}`, { keys }), 'Answer key saved')}>Save answer key</button>
            </div>
          )}
        </div>
      </div>

      {res && (
        <Modal title={`${m.title} · results`} onClose={() => setRes(null)} wide>
          {!res.length ? <p className="muted">Nobody has taken this mock yet.</p> : (
            <div className="table-wrap"><table className="t">
              <thead><tr><th>Student</th><th>Date</th><th>Module 1</th><th>Module 2</th><th>Score</th></tr></thead>
              <tbody>{res.map((r) => <tr key={r.id}><td>{r.name}</td><td className="nowrap">{fmtDate(r.finished_at || r.started_at)}</td>
                <td>{r.m1_correct != null ? `${r.m1_correct}/${r.m1_total ?? '—'}` : '—'}</td><td>{r.m2_correct != null ? `${r.m2_correct}/${r.m2_total}${r.route ? ` · ${r.route}` : ''}` : r.stage === 'done' ? '—' : 'in progress'}</td>
                <td><b>{r.score ?? '—'}</b>{r.low ? <small className="muted"> {r.low}–{r.high}</small> : null}</td></tr>)}</tbody>
            </table></div>
          )}
        </Modal>
      )}
      {del && <Confirm title="Delete this mock?" text="The mock, its questions and all student results will be deleted." onClose={() => setDel(false)} onConfirm={() => run(() => api.del(`/full-mocks/admin/${m.id}`), 'Deleted')} />}
    </Card>
  );
}
