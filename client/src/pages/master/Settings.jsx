import { useEffect, useRef, useState } from 'react';
import { api } from '../../api.js';
import { useToast } from '../../context.jsx';
import { Card, Confirm, Field, Gate, PageHeader, useAsync } from '../../components/ui.jsx';
import { IconCheck } from '../../components/icons.jsx';

export default function Settings() {
  const st = useAsync(() => api.get('/settings'), []);
  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <PageHeader title="Settings" sub="Access rules, prices and integrations for the whole platform." />
      <Gate state={st}>{(s) => <Form init={s} />}</Gate>
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
        <h2>Prices</h2>
        <div className="grid g3">
          <Field label="1 month"><input inputMode="numeric" value={f.price_month} onChange={set('price_month')} /></Field>
          <Field label="3 months"><input inputMode="numeric" value={f.price_quarter} onChange={set('price_quarter')} /></Field>
          <Field label="Currency"><input maxLength={3} value={f.currency} onChange={set('currency')} /></Field>
        </div>
        <div className="grid g2">
          <Field label="Card for payments" hint="students see it in the Telegram bot"><input inputMode="numeric" value={f.pay_card || ''} onChange={set('pay_card')} placeholder="8600 0000 0000 0000" /></Field>
          <Field label="Card holder name"><input value={f.pay_holder || ''} onChange={set('pay_holder')} placeholder="Name Surname" /></Field>
        </div>
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
              <li><b>Authorized JavaScript origins</b>: <code>https://sat-ustoz.vercel.app</code> (and your own domain if you add one).</li>
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
                <div className="muted" style={{ fontSize: '.86rem' }}>{r.plan === 'quarter' ? '3 months' : '1 month'} · {money(r.amount)} {r.currency} · {new Date(r.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
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
