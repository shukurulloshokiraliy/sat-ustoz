import { useRef, useState } from 'react';
import { api } from '../../api.js';
import { useToast } from '../../context.jsx';
import { Card, Field, Gate, PageHeader, useAsync } from '../../components/ui.jsx';
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
      </Card>
      <Card className="stack">
        <h2>Integrations</h2>
        <Field label="Telegram payment bot" hint="username, without @ — the bot is the next stage"><input value={f.telegram_bot} onChange={set('telegram_bot')} placeholder="satprep_pay_bot" /></Field>
        <div className="row wrap" style={{ gap: 8 }}>
          <span className={`chip ${init.google_configured ? 'good' : 'warn'}`}>{init.google_configured ? <><IconCheck width={13} height={13} /> Google sign-in on</> : 'Google sign-in off — set GOOGLE_CLIENT_ID in server/.env'}</span>
          <span className="chip">{init.database === 'postgres' ? 'Database: Supabase Postgres' : 'Database: local (embedded)'}</span>
        </div>
      </Card>
      <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn primary lg" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button></div>
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
