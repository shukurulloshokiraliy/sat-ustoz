import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtDate } from '../../api.js';
import { useToast } from '../../context.jsx';
import { Card, Field, Gate, Modal, PageHeader, Segmented, useAsync } from '../../components/ui.jsx';
import { IconDownload, IconEdit, IconPlus, IconSearch, IconTrash } from '../../components/icons.jsx';

const som = (n) => `${Math.round(Number(n || 0)).toLocaleString('en-US').replace(/,/g, ' ')} so'm`;
const REASON = { top_up: 'Top-up', subscription: 'Plan', full_mock: 'Extra full mock', quiz: 'Extra quiz', prize: 'Leaderboard prize', correction: 'Correction', direct: 'Direct payment' };
const PERIODS = [{ value: 'month', label: 'This month' }, { value: 'last', label: 'Last month' }, { value: 'year', label: 'This year' }, { value: 'all', label: 'All time' }];

/** Teacher finance: money in, revenue, prizes, expenses, profit and every student's wallet. */
export default function Finance() {
  const [period, setPeriod] = useState('month');
  const [tab, setTab] = useState(() => (window.location.hash === '#payments' ? 'payments' : 'overview'));
  const st = useAsync(() => (tab === 'overview' ? api.get('/finance?period=' + period) : Promise.resolve(null)), [period, tab]);
  const go = (t) => { setTab(t); try { window.history.replaceState(null, '', t === 'payments' ? '#payments' : window.location.pathname); } catch { /* ignore */ } };
  return (
    <div className="page fin">
      <PageHeader title="Finance" sub="Every payment is saved here for good: bot receipts, top-ups, plans, extra mocks and quizzes, prizes and your expenses." />
      <div className="fin-top">
        <Segmented value={tab} onChange={go} options={[{ value: 'overview', label: 'Overview' }, { value: 'payments', label: 'All payments' }]} />
        <Segmented value={period} onChange={setPeriod} options={PERIODS} />
      </div>
      {tab === 'payments' ? <Payments period={period} /> : <Gate state={st}>{(d) => d && <FinanceView d={d} reload={st.reload} />}</Gate>}
    </div>
  );
}

const KIND = { top_up: 'Top-up', plan: 'Plan', subscription: 'Plan · wallet', full_mock: 'Extra full mock', quiz: 'Extra quiz', prize: 'Prize', correction: 'Correction' };
const VIA = { receipt: 'Bot receipt', wallet: 'Wallet', teacher: 'Teacher', prize: 'Leaderboard', telegram: 'Telegram Pay', card: 'Card', click: 'Click', payme: 'Payme' };
const STATUS = { pending: ['Waiting', 'warn'], approved: ['Approved', 'good'], rejected: ['Rejected', 'bad'], done: ['Done', ''] };
const TYPES = [['', 'All types'], ['top_up', 'Top-ups'], ['plan', 'Plans'], ['mock', 'Extra full mocks'], ['quiz', 'Extra quizzes'], ['prize', 'Prizes'], ['correction', 'Corrections']];
const STATES = [['', 'Any status'], ['pending', 'Waiting'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['done', 'Done']];
const authed = (url) => fetch(url, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

/** Every payment, one row each: bot receipts (waiting / approved / rejected), wallet moves, direct plan payments. */
function Payments({ period }) {
  const toast = useToast();
  const [f, setF] = useState({ q: '', kind: '', status: '' });
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const [more, setMore] = useState(0);
  const [busy, setBusy] = useState(0);
  const [view, setView] = useState(null);
  const qs = (o = 0) => new URLSearchParams({ period, q, kind: f.kind, status: f.status, offset: String(o), limit: '50' }).toString();
  const st = useAsync(() => api.get('/finance/payments?' + qs()).then((d) => { setRows(d.rows); setMore(d.total - d.rows.length); return d; }), [period, q, f.kind, f.status]);
  useEffect(() => { const t = setTimeout(() => setQ(f.q.trim()), 300); return () => clearTimeout(t); }, [f.q]);
  const loadMore = async () => { try { const d = await api.get('/finance/payments?' + qs(rows.length)); setRows((r) => [...r, ...d.rows]); setMore(d.total - rows.length - d.rows.length); } catch (e) { toast(e.message, 'bad'); } };
  const exportCsv = async () => {
    try {
      const r = await authed('/api/finance/payments?' + qs() + '&format=csv');
      if (!r.ok) throw new Error('Could not export');
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement('a'); a.href = url; a.download = `sat-ustoz-payments-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) { toast(e.message, 'bad'); }
  };
  const decide = async (r, act) => {
    setBusy(r.receipt_id);
    try { await api.post(`/telegram/requests/${r.receipt_id}/${act}`); toast(act === 'approve' ? 'Approved: the money is on the student\'s card' : 'Rejected: the student was told in Telegram'); st.reload(); }
    catch (e) { toast(e.message, 'bad'); } finally { setBusy(0); }
  };
  const t = st.data?.totals;
  return (
    <>
      {t && (
        <div className="fin-kpis">
          <div className="fin-kpi in"><small>Money in</small><b>{som(t.money_in)}</b><span>approved receipts, teacher top-ups, direct plans</span></div>
          <div className="fin-kpi rev"><small>Spent from wallets</small><b>{som(t.spent)}</b><span>plans, extra mocks and quizzes</span></div>
          <button type="button" className={`fin-kpi wait ${t.pending ? 'on' : ''}`} onClick={() => setF({ ...f, status: f.status === 'pending' ? '' : 'pending' })}><small>Waiting receipts</small><b>{t.pending}</b><span>{t.pending ? `${som(t.pending_sum)} to check` : 'nothing to check'}</span></button>
          <div className="fin-kpi held"><small>Payments found</small><b>{st.data.total}</b><span>{t.rejected ? `${t.rejected} rejected receipts` : 'in this period'}</span></div>
        </div>
      )}
      <Card className="fin-pay">
        <div className="fin-filters">
          <label className="fin-search"><IconSearch width={16} height={16} /><input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Student, note, receipt # or wallet no." /></label>
          <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} aria-label="Type">{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} aria-label="Status">{STATES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <button className="btn ghost sm" onClick={exportCsv}><IconDownload width={15} height={15} /> Export (Excel)</button>
        </div>
        {st.loading && !rows.length ? <p className="muted" style={{ padding: 12 }}>Loading…</p> : rows.length === 0 ? <p className="muted" style={{ padding: 12 }}>No payments match these filters.</p> : (
          <div className="table-wrap">
            <table className="t fin-table fin-paytable">
              <thead><tr><th>Date</th><th>Student</th><th>What</th><th className="num">Amount</th><th>Status</th><th /></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const [label, tone] = STATUS[r.status] || [r.status, ''];
                  const [name, contact] = String(r.who || '').split(' · ');
                  return (
                    <tr key={r.key} className={r.status === 'pending' ? 'wait' : ''}>
                      <td className="nowrap" data-l="Date">{fmtDate(r.at, { day: 'numeric', month: 'short', year: 'numeric' })}<small className="muted" style={{ display: 'block' }}>{new Date(r.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' })}</small></td>
                      <td data-l="Student">{r.user_id ? <Link to={`/students/${r.user_id}`}><b>{name || 'Student'}</b></Link> : <b>{name || 'Deleted student'}</b>}<small className="muted" style={{ display: 'block' }}>{r.user_id ? contact : 'account deleted · record kept'}</small></td>
                      <td data-l="What"><b>{KIND[r.kind] || r.kind}</b>{r.plan ? <span className="muted"> · {r.plan}</span> : null}<small className="muted" style={{ display: 'block' }}>{VIA[r.via] || r.via}{r.note ? ` · ${r.note}` : ''}</small></td>
                      <td className="num" data-l="Amount"><b className={r.amount < 0 ? 'fin-neg' : r.status === 'rejected' ? 'muted' : 'fin-pos'}>{r.amount > 0 ? '+' : r.amount < 0 ? '−' : ''}{som(Math.abs(r.amount))}</b></td>
                      <td data-l="Status"><span className={`chip ${tone}`}>{label}</span>{r.decided_by && r.status !== 'pending' ? <small className="muted" style={{ display: 'block' }}>by {r.decided_by}</small> : null}</td>
                      <td className="num fin-acts">
                        {r.receipt_id && <button className="btn ghost sm" onClick={() => setView(r)}>Receipt</button>}
                        {r.status === 'pending' && <>
                          <button className="btn primary sm" disabled={busy === r.receipt_id} onClick={() => decide(r, 'approve')}>Approve</button>
                          <button className="btn danger-ghost sm" disabled={busy === r.receipt_id} onClick={() => decide(r, 'reject')}>Reject</button>
                        </>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {more > 0 && <div className="center" style={{ padding: 12 }}><button className="btn soft" onClick={loadMore}>Show {Math.min(50, more)} more ({more} left)</button></div>}
      </Card>
      {view && <ReceiptView r={view} onClose={() => setView(null)} />}
    </>
  );
}

function ReceiptView({ r, onClose }) {
  const [src, setSrc] = useState(null);
  const [err, setErr] = useState('');
  const [pdf, setPdf] = useState(false);
  useEffect(() => {
    let url = null;
    authed(`/api/telegram/requests/${r.receipt_id}/file`).then(async (x) => {
      if (!x.ok) throw new Error((await x.json().catch(() => ({}))).error || 'Could not open the receipt');
      const b = await x.blob(); setPdf(b.type === 'application/pdf'); url = URL.createObjectURL(b); setSrc(url);
    }).catch((e) => setErr(e.message));
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [r.receipt_id]);
  return (
    <Modal title={`${r.note} · ${som(r.amount)}`} onClose={onClose}>
      <p className="muted" style={{ marginTop: 0 }}>{r.who} · {fmtDate(r.at)}</p>
      {err ? <p className="error-box">{err}</p> : !src ? <p className="muted">Loading…</p> : pdf ? <a className="btn soft" href={src} target="_blank" rel="noreferrer">Open PDF</a> : <img src={src} alt="Payment receipt" className="fin-receipt" />}
    </Modal>
  );
}

function FinanceView({ d, reload }) {
  const s = d.summary;
  const max = Math.max(1, ...d.months.map((m) => Math.max(m.cash_in, m.revenue)));
  return (
    <>
      <div className="fin-kpis">
        <div className="fin-kpi in"><small>Money in</small><b>{som(s.cash_in)}</b><span>{s.top_up_count} top-ups{s.direct_count ? ` · ${s.direct_count} direct payments` : ''}</span></div>
        <div className="fin-kpi rev"><small>Revenue</small><b>{som(s.revenue)}</b><span>spent on plans, mocks and quizzes</span></div>
        <div className={`fin-kpi profit ${s.profit < 0 ? 'neg' : ''}`}><small>Profit</small><b>{som(s.profit)}</b><span>revenue − prizes − expenses</span></div>
        <div className="fin-kpi held"><small>In student wallets</small><b>{som(d.held)}</b><span>{d.held_students} students can still spend it</span></div>
      </div>

      <div className="fin-grid">
        <Card>
          <h3 className="fin-h">Where the revenue came from</h3>
          <ul className="fin-break">
            {[['Plans', s.plans, '#2A55E5'], ['Extra full mocks', s.extra_mocks, '#F07A55'], ['Extra quizzes', s.extra_quizzes, '#22B07D']].map(([k, v, c]) => (
              <li key={k}><span><i style={{ background: c }} />{k}</span><b>{som(v)}</b><em style={{ width: `${s.revenue ? (v / s.revenue) * 100 : 0}%`, background: c }} /></li>
            ))}
            <li className="minus"><span><i style={{ background: '#F5B82E' }} />Leaderboard prizes</span><b>− {som(s.prizes)}</b></li>
            <li className="minus"><span><i style={{ background: '#8E5CF7' }} />Expenses</span><b>− {som(s.expenses)}</b></li>
            {s.corrections !== 0 && <li className="minus"><span><i style={{ background: '#9AA3BC' }} />Wallet corrections</span><b>{som(s.corrections)}</b></li>}
          </ul>
        </Card>
        <Card>
          <h3 className="fin-h">Last 6 months</h3>
          <div className="fin-chart" role="img" aria-label="Money in and revenue by month">
            {d.months.map((m) => (
              <div key={m.month} className="fin-col">
                <div className="fin-bars">
                  <i className="a" style={{ height: `${(m.cash_in / max) * 100}%` }} title={`Money in ${som(m.cash_in)}`} />
                  <i className="b" style={{ height: `${(m.revenue / max) * 100}%` }} title={`Revenue ${som(m.revenue)}`} />
                </div>
                <small>{m.month}</small>
              </div>
            ))}
          </div>
          <div className="fin-legend"><span><i className="a" />Money in</span><span><i className="b" />Revenue</span></div>
        </Card>
      </div>

      <Wallets students={d.students} reload={reload} />

      <div className="fin-grid">
        <Expenses list={d.expenses} reload={reload} />
        <Card>
          <h3 className="fin-h">Latest money moves</h3>
          <div className="fin-log">
            {d.recent.length ? d.recent.map((r) => (
              <div key={r.src + r.id} className="fin-log-row">
                <span className={`fin-amt ${r.amount < 0 ? 'neg' : ''}`}>{r.amount > 0 ? '+' : ''}{som(r.amount)}</span>
                <span className="grow"><Link to={`/students/${r.user_id}`}>{r.name}</Link><small>{REASON[r.reason] || r.reason}{r.note ? ` · ${r.note}` : ''}</small></span>
                <small className="muted nowrap">{fmtDate(r.created_at, { day: 'numeric', month: 'short' })}</small>
              </div>
            )) : <p className="muted">No money moves yet.</p>}
          </div>
        </Card>
      </div>
    </>
  );
}

function Wallets({ students, reload }) {
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState(null);
  const list = useMemo(() => {
    const k = q.trim().toLowerCase();
    return k ? students.filter((s) => `${s.name} ${s.email || ''} ${s.login || ''}`.toLowerCase().includes(k)) : students;
  }, [q, students]);
  return (
    <Card className="fin-wallets">
      <div className="row wrap" style={{ justifyContent: 'space-between', gap: 10 }}>
        <h3 className="fin-h" style={{ margin: 0 }}>Student wallets</h3>
        <label className="fin-search"><IconSearch width={16} height={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a student" /></label>
      </div>
      <div className="table-wrap">
        <table className="t fin-table">
          <thead><tr><th>Student</th><th className="num">Wallet</th><th className="num">Topped up</th><th className="num">Spent</th><th>Plan</th><th /></tr></thead>
          <tbody>
            {list.slice(0, 200).map((s) => (
              <tr key={s.id}>
                <td><Link to={`/students/${s.id}`}><b>{s.name}</b></Link><small className="muted" style={{ display: 'block' }}>{s.email || s.login}</small></td>
                <td className="num"><b className={s.balance ? 'fin-pos' : 'muted'}>{som(s.balance)}</b></td>
                <td className="num">{som(s.topped)}</td>
                <td className="num">{som(s.spent)}</td>
                <td>{s.sub_until && new Date(s.sub_until) > new Date() ? <span className="chip good">until {fmtDate(s.sub_until, { day: 'numeric', month: 'short' })}</span> : <span className="chip">Free</span>}</td>
                <td className="num"><button className="btn ghost sm" onClick={() => setEdit(s)}><IconEdit width={15} height={15} /> Wallet</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.length && <p className="muted center" style={{ padding: 16 }}>No students found.</p>}
      </div>
      {edit && <WalletEdit s={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
    </Card>
  );
}

export function WalletEdit({ s, onClose, onSaved }) {
  const toast = useToast();
  const [mode, setMode] = useState('add');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const v = Math.round(Number(String(amount).replace(/\s/g, '')));
  const ok = Number.isFinite(v) && (mode === 'set' ? v >= 0 && amount !== '' : v > 0);
  const after = mode === 'add' ? s.balance + (v || 0) : mode === 'sub' ? s.balance - (v || 0) : v || 0;
  const save = async () => {
    setBusy(true);
    try {
      await api.post(`/students/${s.id}/balance`, mode === 'set' ? { set: v, note } : { amount: mode === 'add' ? v : -v, note });
      toast('Wallet updated'); onSaved();
    } catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  return (
    <Modal title={`${s.name} · wallet`} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!ok || busy || after < 0} onClick={save}>Save</button></>}>
      <div className="stack">
        <div className="fin-wallet-now"><small>Now</small><b>{som(s.balance)}</b>{ok && <><span>→</span><b className={after < 0 ? 'neg' : ''}>{som(after)}</b></>}</div>
        <Segmented value={mode} onChange={setMode} options={[{ value: 'add', label: 'Add' }, { value: 'sub', label: 'Subtract' }, { value: 'set', label: 'Set exact' }]} />
        <Field label={mode === 'set' ? 'New balance' : 'Amount'}><input autoFocus inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="50 000" /></Field>
        <Field label="Note" hint="the student sees it in their wallet history"><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder={mode === 'add' ? 'Cash payment' : 'Refund, mistake…'} /></Field>
        {after < 0 && <p className="error-box">The wallet cannot go below zero.</p>}
      </div>
    </Modal>
  );
}

function Expenses({ list, reload }) {
  const toast = useToast();
  const [f, setF] = useState({ title: '', amount: '', spent_on: '' });
  const [busy, setBusy] = useState(false);
  const add = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { await api.post('/finance/expenses', f); setF({ title: '', amount: '', spent_on: '' }); toast('Expense added'); reload(); } catch (err) { toast(err.message, 'bad'); } finally { setBusy(false); }
  };
  const del = async (id) => { try { await api.del(`/finance/expenses/${id}`); reload(); } catch (e) { toast(e.message, 'bad'); } };
  return (
    <Card>
      <h3 className="fin-h">Your expenses</h3>
      <form className="fin-exp-form" onSubmit={add}>
        <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Hosting, ads, books…" maxLength={120} />
        <input inputMode="numeric" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="Amount" />
        <input type="date" value={f.spent_on} onChange={(e) => setF({ ...f, spent_on: e.target.value })} aria-label="Date" />
        <button className="btn primary" disabled={busy || !f.title || !f.amount}><IconPlus width={16} height={16} /> Add</button>
      </form>
      <div className="fin-log">
        {list.length ? list.map((x) => (
          <div key={x.id} className="fin-log-row">
            <span className="fin-amt neg">− {som(x.amount)}</span>
            <span className="grow"><b>{x.title}</b></span>
            <small className="muted nowrap">{fmtDate(x.spent_on, { day: 'numeric', month: 'short' })}</small>
            <button className="icon-sm" aria-label="Delete expense" onClick={() => del(x.id)}><IconTrash width={15} height={15} /></button>
          </div>
        )) : <p className="muted">Add hosting, ads and other costs to see your real profit.</p>}
      </div>
    </Card>
  );
}
