import { useEffect, useState } from 'react';
import { useAuth, useToast } from '../../context.jsx';
import { api, fmtDate } from '../../api.js';
import { getConfig } from '../../config.js';
import { Card, Field, Gate, PageHeader, useAsync } from '../../components/ui.jsx';
import { IconCheck, IconCopy, IconCrown, IconSend, IconX } from '../../components/icons.jsx';

export const fmtMoney = (n, cur) => `${Number(n || 0).toLocaleString('en-US').replace(/,/g, ' ')} ${cur === 'UZS' ? "so'm" : cur || ''}`.trim();
const lim = (n, unit) => (n ? `${n} ${unit}` : `Unlimited ${unit.replace(/ \/.*/, '')}`);

/** What each plan gives, in plain words (limits come from Settings). */
export function tierPerks(t) {
  return [
    [true, `${lim(t.q_day, 'questions / day')} with explanations`],
    [true, `${t.quiz_day ? `${t.quiz_day} quizzes / day` : 'Unlimited quizzes'} and score tracking`],
    [true, `${t.fm_week} full mock${t.fm_week === 1 ? '' : 's'} / week`],
    [t.roadmap, t.video ? 'Roadmap lessons with video' : 'Roadmap lessons (no video)'],
    [t.ask, 'Ask the teacher about any question'],
    [!!t.consult_days, t.consult_days ? `${t.consult_min}-min consultation ${t.consult_days <= 7 ? 'every week' : `every ${Math.round(t.consult_days / 7)} weeks`}` : 'Consultations with the teacher'],
    [t.live, 'Live online lessons'],
  ];
}

const brand = (n) => { const d = String(n).replace(/\D/g, ''); return d.startsWith('8600') ? 'UZCARD' : d.startsWith('9860') ? 'HUMO' : d.startsWith('4') ? 'VISA' : d.startsWith('5') ? 'MASTERCARD' : 'CARD'; };

/** A bank card drawn for the eye: number in groups, holder, copy button. */
export function PayCard({ card }) {
  const toast = useToast();
  const num = String(card.number).replace(/\D/g, '').replace(/(\d{4})(?=\d)/g, '$1 ');
  const copy = async () => { try { await navigator.clipboard.writeText(num.replace(/\s/g, '')); toast('Card number copied'); } catch { toast(num); } };
  return (
    <div className="paycard">
      <div className="paycard-top"><span className="paycard-chip" aria-hidden="true" /><b>{brand(card.number)}</b></div>
      <button type="button" className="paycard-num" onClick={copy} aria-label="Copy card number">{num}<IconCopy width={18} height={18} /></button>
      <div className="paycard-bottom"><div><small>Card holder</small><span>{card.holder || '—'}</span></div><div><small>SAT Ustoz</small><span>Payments</span></div></div>
    </div>
  );
}

export default function Subscribe() {
  const { user } = useAuth();
  const toast = useToast();
  const st = useAsync(() => Promise.all([api.get('/plans'), api.get('/me/balance')]), []);
  const [cfg, setCfg] = useState(null);
  const [opening, setOpening] = useState(false);
  useEffect(() => { getConfig().then(setCfg); }, []);
  const pay = async () => {
    setOpening(true);
    const w = window.open('', '_blank');
    try { const r = await api.get('/telegram/link'); if (w) w.location.href = r.url; else window.location.href = r.url; }
    catch (e) { w?.close(); toast(e.message, 'bad'); } finally { setOpening(false); }
  };
  const tierId = user.access?.tier?.id || 'free';

  return (
    <div className="page">
      <PageHeader title="Plans & balance" sub="Choose a plan, pay by card and the teacher turns it on. Your balance pays for extra full mocks." />
      <Gate state={st}>{([p, bal]) => (
        <>
          <div className="sub-top">
            <Card className="sub-now">
              <span className="item-ic" style={{ width: 48, height: 48 }}><IconCrown /></span>
              <div className="grow">
                <small className="muted">Your plan</small>
                <b className="sub-plan">{user.access?.tier?.name || 'Free'}</b>
                <p className="muted" style={{ fontSize: '.88rem' }}>{user.sub_active ? `Active until ${fmtDate(user.sub_until)}.` : `Free: ${p.free.q_day} questions a day and ${p.free.fm_week} full mock a week.`}</p>
              </div>
            </Card>
            <Card className="sub-bal">
              <small className="muted">Balance</small>
              <b className="sub-plan">{fmtMoney(bal.balance, p.currency)}</b>
              <p className="muted" style={{ fontSize: '.88rem' }}>One extra full mock beyond your weekly limit: {fmtMoney(p.fm_extra_price, p.currency)}.</p>
            </Card>
          </div>

          <div className="tiers stagger">
            {p.tiers.map((t, i) => (
              <Card key={t.id} className={`tier ${t.id === tierId ? 'cur' : ''} ${i === 2 ? 'best' : ''}`}>
                {i === 2 && <span className="chip primary ribbon">Most chosen</span>}
                <small className="tier-n">Plan {i + 1}</small>
                <b className="tier-name">{t.name}</b>
                <div className="price">{fmtMoney(t.price, p.currency)}<small> / month</small></div>
                <ul className="tier-perks">{tierPerks(t).map(([on, x]) => <li key={x} className={on ? '' : 'off'}>{on ? <IconCheck width={16} height={16} /> : <IconX width={14} height={14} />}{x}</li>)}</ul>
                {t.id === tierId ? <span className="chip good" style={{ justifySelf: 'start' }}><IconCheck width={14} height={14} /> Your plan</span>
                  : cfg?.telegram_bot ? <button className="btn primary" disabled={opening} onClick={pay}><IconSend width={18} height={18} /> Pay via Telegram</button>
                    : <a className="btn soft" href="#pay">Pay by card</a>}
              </Card>
            ))}
          </div>

          <Card className="pay-how" id="pay">
            <div>
              <h2>How to pay</h2>
              <ol className="pay-steps">
                <li>Transfer the plan price (or any amount for your balance) to this card.</li>
                <li>Send a photo of the receipt in the Telegram bot or the <b>Ask Ustoz</b> chat, and write which plan you chose.</li>
                <li>The teacher checks it and turns your plan on (or adds the money to your balance), usually within a few hours.</li>
              </ol>
              <p className="muted" style={{ fontSize: '.84rem' }}>Your account: <b style={{ color: 'var(--ink)' }}>{user.email || user.login}</b>. Payments follow the <a href="/p/oferta" target="_blank" rel="noreferrer">oferta</a>.</p>
            </div>
            {p.card ? <PayCard card={p.card} /> : <p className="muted">The teacher has not added a card yet. Write in the Ask Ustoz chat.</p>}
          </Card>

          <Extras access={user.access} />

          {bal.history.length > 0 && (
            <Card>
              <h3 className="sr-h">Balance history</h3>
              <div className="table-wrap"><table className="t">
                <thead><tr><th>Date</th><th>What</th><th>Amount</th><th>Balance</th></tr></thead>
                <tbody>{bal.history.map((h, i) => <tr key={i}><td className="nowrap">{fmtDate(h.created_at)}</td><td>{h.reason === 'top_up' ? 'Top-up' : h.reason === 'full_mock' ? `Full mock${h.note ? ` · ${h.note}` : ''}` : h.note || h.reason}</td>
                  <td className={h.amount > 0 ? 'good-text' : ''}>{h.amount > 0 ? '+' : ''}{fmtMoney(h.amount, p.currency)}</td><td>{fmtMoney(h.balance_after, p.currency)}</td></tr>)}</tbody>
              </table></div>
            </Card>
          )}
        </>
      )}</Gate>
    </div>
  );
}

/** Plan extras: consultation booking (plans 2–4) and live lessons (plan 4). */
export function Extras({ access }) {
  const toast = useToast();
  const consult = useAsync(() => (access?.tier?.consult_days ? api.get('/consultations') : Promise.resolve(null)), [access?.tier?.consult_days]);
  const live = useAsync(() => (access?.live ? api.get('/live') : Promise.resolve(null)), [access?.live]);
  const [f, setF] = useState({ preferred: '', note: '' });
  const [busy, setBusy] = useState(false);
  const book = async () => {
    setBusy(true);
    try { await api.post('/consultations', f); toast('Request sent. The teacher will confirm the time.'); setF({ preferred: '', note: '' }); consult.reload(); }
    catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  const c = consult.data;
  if (!c && !live.data) return null;
  return (
    <div className="grid g2">
      {c && (
        <Card className="stack">
          <h3 className="sr-h">Consultation with the teacher</h3>
          <p className="muted">{c.minutes} minutes, {c.every_days <= 7 ? 'once a week' : `once every ${Math.round(c.every_days / 7)} weeks`}.</p>
          {c.list.filter((x) => x.status === 'scheduled' || x.status === 'requested').slice(0, 1).map((x) => (
            <div key={x.id} className="consult-st">
              <b>{x.status === 'scheduled' ? `Booked: ${x.scheduled_at ? new Date(x.scheduled_at).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : x.preferred}` : 'Waiting for the teacher to confirm'}</b>
              {x.link && <a className="btn soft sm" href={x.link} target="_blank" rel="noreferrer">Join</a>}
            </div>
          ))}
          {c.next_at ? <small className="muted">Next request from {fmtDate(c.next_at)}.</small> : (
            <>
              <Field label="When suits you?"><input value={f.preferred} onChange={(e) => setF({ ...f, preferred: e.target.value })} placeholder="Saturday after 15:00" /></Field>
              <Field label="What to discuss" hint="optional"><input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Boundaries, my last mock…" /></Field>
              <button className="btn primary" disabled={busy || !f.preferred.trim()} onClick={book}>Request a consultation</button>
            </>
          )}
        </Card>
      )}
      {live.data && (
        <Card className="stack">
          <h3 className="sr-h">Live online lessons</h3>
          <p className="muted">{live.data.note || 'The schedule will appear here.'}</p>
          {live.data.link ? <a className="btn primary" href={live.data.link} target="_blank" rel="noreferrer">Join the live lesson</a> : <small className="muted">The link will appear here before the lesson.</small>}
        </Card>
      )}
    </div>
  );
}
