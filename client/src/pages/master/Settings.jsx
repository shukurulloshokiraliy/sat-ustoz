import { useEffect, useRef, useState } from 'react';
import { api } from '../../api.js';
import { useToast } from '../../context.jsx';
import { Card, Confirm, Field, Gate, PageHeader, useAsync } from '../../components/ui.jsx';
import { IconCheck } from '../../components/icons.jsx';

export default function Settings() {
  const st = useAsync(() => Promise.all([api.get('/settings'), api.get('/plans')]), []);
  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <PageHeader title="Settings" sub="Access rules, prices and integrations for the whole platform." />
      <Gate state={st}>{([s, p]) => <Form init={{ ...s, tiers: p.tiers }} />}</Gate>
    </div>
  );
}

function Form({ init }) {
  const toast = useToast();
  const [f, setF] = useState({ ...init, require_subscription: init.require_subscription === 'true' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const save = async () => {
    setBusy(true);
    try { await api.put('/settings', f); toast('Settings saved'); } catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  return (
    <>
      <Card className="stack">
        <h2>Access</h2>
        <label className="row" style={{ alignItems: 'flex-start', cursor: 'pointer' }}>
          <input type="checkbox" checked={f.require_subscription} onChange={set('require_subscription')} style={{ width: 20, height: 20, marginTop: 2 }} />
          <span><b>Require a subscription to practise</b><br /><small className="muted">New accounts can always sign up, take the readiness check and see their roadmap. Quizzes, lessons and mocks need an active subscription. Turn this off to open everything for free.</small></span>
        </label>
      </Card>
      <Card className="stack">
        <h2>Plans</h2>
        <small className="muted">Price is per month. Limits: Question Bank answers a day, Take a quiz per day, full mocks per week. 0 a day = unlimited; 0 mocks a week = none.</small>
        <div className="table-wrap"><table className="t plans-edit">
          <thead><tr><th>Plan</th><th>Name</th><th>Price / month</th><th>Questions / day</th><th>Quizzes / day</th><th>Full mocks / week</th><th>Consultation every … days</th></tr></thead>
          <tbody>{f.tiers.map((t, i) => (
            <tr key={t.id}><td><b>{i + 1}</b></td>
              {[['name', 'text'], ['price'], ['q_day'], ['quiz_day'], ['fm_week'], ['consult_days']].map(([k, type]) => (
                <td key={k}><input type={type || 'number'} min="0" value={t[k]} disabled={k === 'consult_days' && i === 0}
                  onChange={(e) => setF({ ...f, tiers: f.tiers.map((x) => (x.id === t.id ? { ...x, [k]: e.target.value } : x)) })} /></td>
              ))}
            </tr>
          ))}</tbody>
        </table></div>
        <small className="muted">1: questions, Take a quiz, mocks, explanations and scores · 2: + roadmap lessons (no video), consultations · 3: + video lessons, ask the teacher, weekly 30-minute consultation · 4: + live online lessons.</small>
        <div className="grid g3">
          <Field label="Free: questions / day"><input type="number" min="0" value={f.free_q_day} onChange={set('free_q_day')} /></Field>
          <Field label="Free: full mocks / week"><input type="number" min="0" value={f.fm_free} onChange={set('fm_free')} /></Field>
          <Field label="Extra full mock (from balance)"><input inputMode="numeric" value={f.fm_extra_price} onChange={set('fm_extra_price')} /></Field>
        </div>
        <div className="grid g3">
          <Field label="Extra quiz (from balance)" hint="after the plan's free quizzes a day"><input inputMode="numeric" value={f.quiz_extra_price ?? ''} onChange={set('quiz_extra_price')} /></Field>
        </div>
        <div className="grid g3">
          <Field label="Currency"><input maxLength={3} value={f.currency} onChange={set('currency')} /></Field>
          <Field label="Live lessons link" hint="plan 4"><input value={f.live_link || ''} onChange={set('live_link')} placeholder="https://meet.google.com/…" /></Field>
          <Field label="Live lessons schedule"><input value={f.live_note || ''} onChange={set('live_note')} placeholder="Tue & Thu, 19:00" /></Field>
        </div>
        <div className="grid g2">
          <Field label="Card for payments" hint="shown on the Subscription page and in the bot"><input inputMode="numeric" value={f.pay_card || ''} onChange={set('pay_card')} placeholder="8600 0000 0000 0000" /></Field>
          <Field label="Card holder name"><input value={f.pay_holder || ''} onChange={set('pay_holder')} placeholder="Name Surname" /></Field>
        </div>
      </Card>
      <Card className="stack">
        <h2>Video lessons (Bunny Stream)</h2>
        <small className="muted">Teachers upload MP4 files in Roadmap; only students whose plan includes video can watch, only on this website, through links that expire after a few hours.</small>
        {init.bunny_env ? <span className="chip good">Set on the server (environment variables)</span> : (
          <div className="grid g3">
            <Field label="Library ID"><input inputMode="numeric" value={f.bunny_library_id || ''} onChange={set('bunny_library_id')} placeholder="123456" /></Field>
            <Field label="API key" hint="Stream → API"><input type="password" autoComplete="off" value={f.bunny_api_key || ''} onChange={set('bunny_api_key')} placeholder="xxxxxxxx-xxxx-…" /></Field>
            <Field label="Token authentication key" hint="Security page"><input type="password" autoComplete="off" value={f.bunny_token_key || ''} onChange={set('bunny_token_key')} placeholder="xxxxxxxx-xxxx-…" /></Field>
          </div>
        )}
        <details>
          <summary className="linkish" style={{ cursor: 'pointer' }}>How to set it up (10 minutes)</summary>
          <ol className="muted tg-steps" style={{ marginTop: 8 }}>
            <li>Sign up at <a href="https://bunny.net" target="_blank" rel="noreferrer">bunny.net</a> (14 days free, then about $1–10 a month depending on views).</li>
            <li><b>Stream → Add Video Library</b>, name “SAT Ustoz”, pick a region close to Europe.</li>
            <li>Library → <b>API</b>: copy the <b>Library ID</b> and the <b>API key</b>.</li>
            <li>Library → <b>Security</b>: turn on <b>Embed view token authentication</b>, copy the <b>Token authentication key</b>, and in <b>Allowed referrers</b> add <code>ustozsat.uz</code> and <code>www.ustozsat.uz</code>.</li>
            <li>Paste the three values here and press Save settings. Then open Roadmap → edit a step → <b>Upload MP4</b>.</li>
          </ol>
        </details>
      </Card>
      <Card className="stack">
        <h2>GIFs and memes (GIPHY)</h2>
        <small className="muted">Lets you search GIPHY when you add a GIF to a roadmap topic, lesson or vocabulary unit. Without a key you can still paste GIF links.</small>
        {init.giphy_env ? <span className="chip good">Set on the server (environment variables)</span> : (
          <Field label="GIPHY API key" hint="developers.giphy.com → Create an API key"><input type="password" autoComplete="off" value={f.giphy_key || ''} onChange={set('giphy_key')} placeholder="xxxxxxxxxxxxxxxxxxxxxxxx" /></Field>
        )}
        <details>
          <summary className="linkish" style={{ cursor: 'pointer' }}>How to get a key (3 minutes, free)</summary>
          <ol className="muted tg-steps" style={{ marginTop: 8 }}>
            <li>Open <a href="https://developers.giphy.com/dashboard/" target="_blank" rel="noreferrer">developers.giphy.com</a> and sign up.</li>
            <li>Press <b>Create an API Key</b> → choose <b>API</b> (not SDK) → name it “SAT Ustoz”.</li>
            <li>Copy the key, paste it here and press Save settings.</li>
            <li>The free beta key allows about 100 searches an hour — plenty for adding GIFs. Students only load the saved GIFs, which does not count.</li>
          </ol>
        </details>
      </Card>
      <Card className="stack">
        <h2>Integrations</h2>
        {!init.google_env && (
          <Field label="Google sign-in — Client ID" hint="public value, not a secret">
            <input value={f.google_client_id || ''} onChange={set('google_client_id')} placeholder="1234567890-abc123.apps.googleusercontent.com" />
          </Field>
        )}
        {!init.google_env && (
          <details>
            <summary className="linkish" style={{ cursor: 'pointer' }}>How to get the Client ID (5 minutes)</summary>
            <ol className="muted tg-steps" style={{ marginTop: 8 }}>
              <li>Open <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">Google Cloud Console → Credentials</a> and create a project (any name).</li>
              <li><b>OAuth consent screen</b>: User type <b>External</b>, app name “SAT Ustoz”, your email → Save. Then <b>Publish app</b>.</li>
              <li><b>Create credentials → OAuth client ID</b> → Application type <b>Web application</b>.</li>
              <li><b>Authorized JavaScript origins</b>: <code>https://www.ustozsat.uz</code> and <code>https://ustozsat.uz</code> (keep <code>https://sat-ustoz.vercel.app</code> too).</li>
              <li>Copy the <b>Client ID</b> (ends with .apps.googleusercontent.com), paste it here and press Save settings.</li>
            </ol>
          </details>
        )}
        <div className="row wrap" style={{ gap: 8 }}>
          <span className={`chip ${init.google_configured ? 'good' : 'warn'}`}>{init.google_configured ? <><IconCheck width={13} height={13} /> Google sign-in on</> : 'Google sign-in off'}</span>
          <span className="chip">{init.database === 'postgres' ? 'Database: Supabase Postgres' : 'Database: local (embedded)'}</span>
        </div>
      </Card>
      <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn primary lg" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button></div>
      <SecurityLog />
      <TelegramCard />
      <RequestsCard />
      <PlacementCard />
    </>
  );
}

/** Placement test content lives in one JSON file (items, timers, scoring, advice). */
function PlacementCard() {
  const toast = useToast();
  const st = useAsync(() => api.get('/placement'), []);
  const file = useRef(null);
  const [busy, setBusy] = useState(false);
  const upload = async (f) => {
    if (!f) return;
    setBusy(true);
    try {
      const json = JSON.parse(await f.text());
      const r = await api.put('/placement/test', json);
      toast(`Placement test updated · ${r.items} questions`); st.reload();
    } catch (e) { toast(e instanceof SyntaxError ? 'This is not a valid JSON file' : e.message, 'bad'); }
    finally { setBusy(false); if (file.current) file.current.value = ''; }
  };
  const reset = async () => {
    setBusy(true);
    try { await api.del('/placement/test'); toast('Back to the built-in placement test'); st.reload(); } catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  return (
    <Card className="stack">
      <h2>Placement test</h2>
      <Gate state={st}>{({ test }) => (
        <>
          <p className="muted" style={{ fontSize: '.92rem' }}>
            <b style={{ color: 'var(--ink)' }}>{test.title}</b> · {test.sections.map((x) => `${x.title} (${x.count} questions, ${x.time_limit_minutes} min)`).join(' · ')} · course level {test.admission_minimum_level}
          </p>
          <div className="row wrap" style={{ gap: 8 }}>
            <button className="btn ghost" onClick={() => api.download('/placement/test.json', 'placement_test.json').catch((e) => toast(e.message, 'bad'))}>Download JSON</button>
            <button className="btn soft" disabled={busy} onClick={() => file.current?.click()}>Upload new JSON</button>
            <button className="btn ghost" disabled={busy} onClick={reset}>Use built-in version</button>
            <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => upload(e.target.files[0])} />
          </div>
          <small className="muted">The file is checked before it is saved. New attempts use the new version; finished results keep their scores.</small>
        </>
      )}</Gate>
    </Card>
  );
}

/** Telegram payment bot: connect with the token from @BotFather, link the teacher, optional Click/Payme token. */
function TelegramCard() {
  const toast = useToast();
  const st = useAsync(() => api.get('/telegram/status'), []);
  const [token, setToken] = useState('');
  const [payToken, setPayToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [off, setOff] = useState(false);
  const run = async (fn, msg) => { setBusy(true); try { await fn(); toast(msg); st.reload(); } catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); } };
  return (
    <Card className="stack">
      <h2>Telegram payment bot</h2>
      <Gate state={st}>{(s) => (
        <>
          <div className="row wrap" style={{ gap: 8 }}>
            <span className={`chip ${s.connected ? 'good' : 'warn'}`}>{s.connected ? <><IconCheck width={13} height={13} /> Connected: @{s.bot}</> : 'Not connected'}</span>
            {s.connected && <span className={`chip ${s.webhook_ok ? 'good' : 'bad'}`}>{s.webhook_ok ? 'Receiving messages' : `Webhook: ${s.webhook_error || 'not set'}`}</span>}
            {s.connected && <span className={`chip ${s.admins ? 'good' : 'warn'}`}>{s.admins ? `${s.admins} teacher chat(s) get receipts` : 'No teacher linked yet'}</span>}
            <span className={`chip ${s.pay_token ? 'good' : ''}`}>{s.pay_token ? 'Click / Payme on' : 'Click / Payme off'}</span>
          </div>
          <ol className="muted tg-steps">
            <li>Open <a href="https://t.me/BotFather" target="_blank" rel="noreferrer">@BotFather</a> → <b>/newbot</b> → choose a name and a username ending in “bot”. Copy the token.</li>
            <li>Paste the token below and press <b>Connect</b> (on the live site — Telegram needs https).</li>
            <li>In Telegram open your bot and send: <code>/admin {s.admin_code}</code> — receipts will come to you with ✅ / ❌ buttons.</li>
            <li>Fill in the <b>card for payments</b> above and save.</li>
          </ol>
          <div className="row wrap" style={{ gap: 8 }}>
            <input className="grow" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder={s.connected ? 'New token (only to change the bot)' : '123456789:AA… token from @BotFather'} aria-label="Bot token" />
            <button className="btn primary" disabled={busy || (!token.trim() && !s.connected)} onClick={() => run(() => api.post('/telegram/connect', token.trim() ? { token: token.trim() } : {}).then(() => setToken('')), 'Bot connected')}>{s.connected && !token.trim() ? 'Reconnect' : 'Connect'}</button>
            {s.connected && <button className="btn ghost" disabled={busy} onClick={() => setOff(true)}>Disconnect</button>}
          </div>
          <details>
            <summary className="linkish" style={{ cursor: 'pointer' }}>Click / Payme inside Telegram (optional)</summary>
            <div className="stack sm" style={{ marginTop: 10 }}>
              <p className="muted" style={{ fontSize: '.9rem' }}>After a merchant agreement with Click or Payme, open @BotFather → your bot → <b>Payments</b> → choose the provider → copy the <b>provider token</b> here. Then the bot also offers automatic payment; the subscription turns on by itself.</p>
              <div className="row wrap" style={{ gap: 8 }}>
                <input className="grow" type="password" autoComplete="off" value={payToken} onChange={(e) => setPayToken(e.target.value)} placeholder={s.pay_token ? 'Saved — paste a new one to change' : 'Provider token'} aria-label="Payment provider token" />
                <button className="btn soft" disabled={busy || !payToken.trim()} onClick={() => run(() => api.put('/telegram/pay-token', { pay_token: payToken.trim() }).then(() => setPayToken('')), 'Saved')}>Save</button>
                {s.pay_token && <button className="btn ghost" disabled={busy} onClick={() => run(() => api.put('/telegram/pay-token', { pay_token: '' }), 'Click / Payme turned off')}>Turn off</button>}
              </div>
            </div>
          </details>
          {s.admins > 0 && <button className="linkish" style={{ justifySelf: 'start' }} onClick={() => run(() => api.post('/telegram/admins/reset'), 'Teacher chats removed — send /admin with the new code')}>Remove linked teacher chats (new code)</button>}
          {off && <Confirm title="Disconnect the bot?" text="Students will not be able to pay through Telegram until you connect it again." confirmLabel="Disconnect" onClose={() => setOff(false)} onConfirm={async () => { await run(() => api.post('/telegram/disconnect'), 'Bot disconnected'); setOff(false); }} />}
        </>
      )}</Gate>
    </Card>
  );
}

/** Card receipts sent to the bot: approve here too (same as the ✅ button in Telegram). */
function RequestsCard() {
  const toast = useToast();
  const st = useAsync(() => api.get('/telegram/requests'), []);
  const [img, setImg] = useState({});
  const [busy, setBusy] = useState(0);
  useEffect(() => () => Object.values(img).forEach((u) => URL.revokeObjectURL(u)), []); // eslint-disable-line react-hooks/exhaustive-deps
  const show = async (id) => {
    try {
      const r = await fetch(`/api/telegram/requests/${id}/file`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      if (!r.ok) throw new Error('Could not load the receipt');
      const url = URL.createObjectURL(await r.blob());
      setImg((m) => ({ ...m, [id]: url }));
    } catch (e) { toast(e.message, 'bad'); }
  };
  const act = async (id, a) => {
    setBusy(id);
    try { await api.post(`/telegram/requests/${id}/${a}`); toast(a === 'approve' ? 'Approved — the subscription is on' : 'Rejected'); st.reload(); } catch (e) { toast(e.message, 'bad'); } finally { setBusy(0); }
  };
  const money = (n) => Number(n || 0).toLocaleString('en-US').replace(/,/g, ' ');
  return (
    <Card className="stack">
      <h2>Payment receipts</h2>
      <Gate state={st}>{(list) => !list.length ? <p className="muted">No receipts yet. When a student sends a receipt to the bot, it appears here and in your Telegram.</p> : (
        <div className="tg-reqs">
          {list.map((r) => (
            <div key={r.id} className={`tg-req ${r.status}`}>
              <div className="grow">
                <b>№{r.id} · {r.name}</b> <small className="muted">{r.email || r.login}</small>
                <div className="muted" style={{ fontSize: '.86rem' }}>{r.plan === 'topup' ? 'Wallet top-up' : { t1: 'Plan 1', t2: 'Plan 2', t3: 'Plan 3', t4: 'Plan 4', quarter: '3 months' }[r.plan] || '1 month'} · {money(r.amount)} {r.currency} · {new Date(r.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                {img[r.id] && <img src={img[r.id]} alt={`Receipt ${r.id}`} className="tg-img" />}
              </div>
              <div className="row wrap" style={{ gap: 6 }}>
                {!img[r.id] && <button className="btn ghost sm" onClick={() => show(r.id)}>Receipt</button>}
                {r.status === 'pending' ? <>
                  <button className="btn primary sm" disabled={busy === r.id} onClick={() => act(r.id, 'approve')}>✅ Approve</button>
                  <button className="btn danger-ghost sm" disabled={busy === r.id} onClick={() => act(r.id, 'reject')}>Reject</button>
                </> : <span className={`chip ${r.status === 'approved' ? 'good' : 'bad'}`}>{r.status === 'approved' ? 'Approved' : 'Rejected'}{r.decided_by ? ` · ${r.decided_by}` : ''}</span>}
              </div>
            </div>
          ))}
        </div>
      )}</Gate>
    </Card>
  );
}

const ACTIONS = { login: 'Teacher signed in', login_failed: 'Teacher sign-in failed', password_changed: 'Password changed', logout_all: 'Signed out everywhere',
  settings_changed: 'Settings changed', subscription_granted: 'Plan activated', subscription_cancelled: 'Plan cancelled', balance_changed: 'Wallet changed',
  student_deleted: 'Student deleted', student_password_reset: 'Student password reset' };
/** Security log: every sensitive action with who, when and from which IP. */
function SecurityLog() {
  const st = useAsync(() => api.get('/audit'), []);
  return (
    <Card className="stack">
      <h2>Security log</h2>
      <small className="muted">Sign-ins to the teacher account, settings, plans, wallet changes and deletions. A sign-in from a new network also goes to your Telegram.</small>
      <Gate state={st}>{(rows) => (!rows.length ? <p className="muted">Nothing yet.</p> : (
        <div className="table-wrap"><table className="t">
          <thead><tr><th>When</th><th>What</th><th>Who</th><th>Details</th><th>IP</th></tr></thead>
          <tbody>{rows.slice(0, 50).map((r) => <tr key={r.id} className={r.action === 'login_failed' ? 'bad-row' : ''}><td className="nowrap">{new Date(r.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
            <td>{ACTIONS[r.action] || r.action}</td><td>{r.actor || '—'}</td><td className="muted">{[r.target, r.detail].filter(Boolean).join(' · ')}</td><td className="nowrap muted">{r.ip}</td></tr>)}</tbody>
        </table></div>
      ))}</Gate>
    </Card>
  );
}
