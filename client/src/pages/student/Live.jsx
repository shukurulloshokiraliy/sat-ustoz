import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth, useToast } from '../../context.jsx';
import { Card, Confirm, Gate, Modal, PageHeader, useAsync } from '../../components/ui.jsx';
import { IconCheck, IconClock, IconLive, IconLock, IconTelegram, IconX } from '../../components/icons.jsx';
import { useTopUp } from '../../components/StudentCard.jsx';
import { fmtMoney } from './Subscribe.jsx';

/**
 * Live 1-on-1 lessons (Ultra): six fixed times, one student each, 12 lessons per 4 weeks.
 * Students book, pre-book, renew or join the waitlist; the teacher sees who has which time and the queue.
 */
const day = (d, o = { day: 'numeric', month: 'short' }) => (d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', ...o }) : '—');
const wday = (d) => day(d, { weekday: 'short', day: 'numeric', month: 'short' });
const when = (iso) => new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Tashkent', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function Live() {
  const { user } = useAuth();
  const st = useAsync(() => api.get('/live/slots'), []);
  return (
    <div className="page">
      <PageHeader title="Live lessons" sub="One-on-one with the teacher, three times a week at your own fixed time. 12 lessons in 4 weeks, with everything in Ultra." />
      <Gate state={st}>{(d) => (user.role === 'master' ? <Board d={d} reload={st.reload} /> : <Student d={d} reload={st.reload} />)}</Gate>
    </div>
  );
}

const STATE = { free: ['Free', 'good'], taken: ['Taken', ''], mine: ['Your time', 'primary'], mine_next: ['Booked', 'primary'], closed: ['Closed', ''] };

function Student({ d, reload }) {
  const { refresh } = useAuth();
  const toast = useToast();
  const [ask, setAsk] = useState(null);
  const [cancel, setCancel] = useState(null);
  const [busy, setBusy] = useState('');
  const mine = d.mine || [];
  const now = mine.find((b) => b.started);
  const next = mine.filter((b) => !b.started);
  const offer = d.slots.find((s) => s.action === 'offer');
  const queue = async (s, join) => {
    setBusy(s.id);
    try {
      if (join) { await api.post('/live/queue', { slot: s.id }); toast('You are on the waitlist. The Telegram bot tells you when the time frees up.'); }
      else { await api.del(`/live/queue/${s.id}`); toast('You left the waitlist'); }
      reload();
    } catch (e) { toast(e.message, 'bad'); } finally { setBusy(''); }
  };
  const byGroup = d.groups.map((g) => ({ ...g, slots: d.slots.filter((s) => s.group === g.id) }));

  return (
    <>
      {offer && (
        <div className="lv-offer">
          <div><b>Your turn: {offer.days}, {offer.from}–{offer.to}</b><span>The time is yours if you pay by {when(offer.offer_until)}. After that it goes to the next student.</span></div>
          <button className="btn sun" onClick={() => setAsk(offer)}>Book it now</button>
        </div>
      )}

      <div className="lv-top">
        {now ? <MyTime b={now} slot={d.slots.find((s) => s.id === now.slot)} onRenew={(s) => setAsk(s)} /> : (
          <Card className="lv-intro">
            <span className="item-ic lv-ic"><IconLive /></span>
            <div>
              <h2>Pick your time</h2>
              <p className="muted">Choose one of six times below. It stays yours: the same days and hour every week, only you and the teacher.</p>
            </div>
          </Card>
        )}
        <Card className="lv-price">
          <small className="muted">{d.plan} · 12 lessons</small>
          <b>{fmtMoney(d.price, d.currency)}</b>
          <span className="muted">Wallet: {fmtMoney(d.balance, d.currency)}</span>
          <Link to="/subscribe#pay" className="lv-link">Top up</Link>
        </Card>
      </div>

      {next.map((b) => (
        <div key={b.id} className="lv-note">
          <span><b>Booked:</b> {b.days} {b.from}–{b.to}, from {wday(b.starts_on)} to {day(b.last)}.</span>
          <button className="btn ghost sm" onClick={() => setCancel(b)}>Cancel and refund</button>
        </div>
      ))}

      <div className="lv-grid">
        {byGroup.map((g) => (
          <Card key={g.id} className="lv-col">
            <h3 className="lv-days">{g.label}</h3>
            {g.slots.map((s) => {
              const [label, tone] = STATE[s.state] || ['', ''];
              return (
                <div key={s.id} className={`lv-slot ${s.state}`}>
                  <div className="lv-time"><IconClock width={16} height={16} /><b>{s.from}–{s.to}</b></div>
                  <div className="lv-st">
                    <span className={`chip ${tone}`}>{label}</span>
                    <small className="muted">
                      {s.state === 'taken' && s.taken_until ? `until ${day(s.taken_until)}` : s.state === 'free' && s.period ? `starts ${wday(s.period.starts_on)}` : s.note}
                      {s.queue_len > 0 && s.action !== 'waiting' ? ` · ${s.queue_len} waiting` : ''}
                    </small>
                  </div>
                  <div className="lv-act">
                    {s.action === 'book' && <button className="btn primary sm" onClick={() => setAsk(s)}>Book</button>}
                    {s.action === 'prebook' && <button className="btn soft sm" onClick={() => setAsk(s)}>Pre-book from {day(s.period.starts_on)}</button>}
                    {s.action === 'renew' && <button className="btn primary sm" onClick={() => setAsk(s)}>Renew</button>}
                    {s.action === 'offer' && <button className="btn sun sm" onClick={() => setAsk(s)}>Book now</button>}
                    {s.action === 'join' && <button className="btn ghost sm" disabled={busy === s.id} onClick={() => queue(s, true)}>Join waitlist</button>}
                    {s.action === 'waiting' && <button className="btn ghost sm" disabled={busy === s.id} onClick={() => queue(s, false)} title="Leave the waitlist">#{s.my_pos} in line <IconX width={14} height={14} /></button>}
                    {s.state === 'closed' && <IconLock width={16} height={16} className="muted" />}
                  </div>
                </div>
              );
            })}
          </Card>
        ))}
      </div>

      <div className="lv-how">
        <div><b>Fixed time</b><span>3 lessons a week on your days, 60 minutes each, for 4 weeks.</span></div>
        <div><b>Keep it</b><span>Renew at least {d.priority_days} days before the end and the time stays yours.</span></div>
        <div><b>Waitlist</b><span>When a time frees up, the first in line gets a Telegram message and {d.offer_hours} hours to pay.</span></div>
        <div><b>Pre-book</b><span>Pay ahead for a taken time; cancel any time before it starts and the money goes back to your wallet.</span></div>
      </div>

      {ask && <BookModal s={ask} d={d} onClose={() => setAsk(null)} onDone={() => { setAsk(null); reload(); refresh(); }} />}
      {cancel && <Confirm title="Cancel this booking?" text={`${cancel.days} ${cancel.from}–${cancel.to} from ${day(cancel.starts_on)}. ${fmtMoney(cancel.price, d.currency)} goes back to your wallet.`} confirmLabel="Cancel and refund"
        onClose={() => setCancel(null)} onConfirm={async () => { try { await api.post(`/live/bookings/${cancel.id}/cancel`); toast('Cancelled. The money is back in your wallet.'); setCancel(null); reload(); refresh(); } catch (e) { toast(e.message, 'bad'); } }} />}
    </>
  );
}

function MyTime({ b, slot, onRenew }) {
  return (
    <Card className="lv-mine">
      <div className="lv-mine-h">
        <span className="item-ic lv-ic"><IconLive /></span>
        <div className="grow">
          <small className="muted">Your lesson time</small>
          <b className="lv-mine-t">{b.days} · {b.from}–{b.to}</b>
          <span className="muted">{b.left} lesson{b.left === 1 ? '' : 's'} left · last on {day(b.last)}</span>
        </div>
        {slot?.action === 'renew' && <button className="btn primary" onClick={() => onRenew(slot)}>Renew</button>}
      </div>
      <div className="lv-next">{b.next_lessons.map((x, i) => <span key={x} className={i === 0 ? 'on' : ''}>{wday(x)}</span>)}</div>
      {slot?.action === 'renew' && slot.renew_by && <small className="muted">Renew by {wday(slot.renew_by)} to keep this time for the next 4 weeks.</small>}
      {slot?.note && <small className="muted">{slot.note}</small>}
    </Card>
  );
}

function BookModal({ s, d, onClose, onDone }) {
  const toast = useToast();
  const top = useTopUp();
  const [busy, setBusy] = useState(false);
  const [key] = useState(() => Math.random().toString(36).slice(2) + Date.now().toString(36));
  const enough = d.balance >= d.price;
  const title = s.action === 'renew' ? 'Renew your time' : s.action === 'prebook' ? 'Pre-book this time' : 'Book this time';
  const go = async () => {
    setBusy(true);
    try { const r = await api.post('/live/book', { slot: s.id, key }); toast(`Booked: ${s.days} ${s.from}, from ${day(r.starts_on)}`); onDone(); }
    catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  return (
    <Modal title={title} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button>
        {enough ? <button className="btn primary" disabled={busy} onClick={go}>Pay {fmtMoney(d.price, d.currency)}</button>
          : top.ready ? <button className="btn primary" disabled={top.busy} onClick={top.open}><IconTelegram width={16} height={16} /> Top up in Telegram</button>
            : <Link className="btn primary" to="/subscribe#pay">Top up</Link>}</>}>
      <div className="lv-sum">
        <div><small>Time</small><b>{s.days} · {s.from}–{s.to}</b></div>
        <div><small>Lessons</small><b>12 · {wday(s.period.starts_on)} – {day(s.period.last)}</b></div>
        <div><small>Price</small><b>{fmtMoney(d.price, d.currency)}</b></div>
        <div><small>Wallet after</small><b className={enough ? '' : 'bad-text'}>{enough ? fmtMoney(d.balance - d.price, d.currency) : `${fmtMoney(d.price - d.balance, d.currency)} short`}</b></div>
      </div>
      <ul className="lv-terms">
        <li><IconCheck width={14} height={14} /> Ultra plan for the whole period: unlimited practice, mocks, roadmap and video lessons.</li>
        {s.action === 'prebook' && <li><IconCheck width={14} height={14} /> If the current student renews in time, your start moves 4 weeks later. You can cancel before it starts and get the money back.</li>}
        {s.action === 'offer' && <li><IconCheck width={14} height={14} /> The waitlist offer is yours until {when(s.offer_until)}.</li>}
        <li><IconCheck width={14} height={14} /> Renew {d.priority_days}+ days before the end to keep this time.</li>
      </ul>
    </Modal>
  );
}

/* ---------- teacher ---------- */
function Board({ d, reload }) {
  const toast = useToast();
  const [busy, setBusy] = useState('');
  const [end, setEnd] = useState(null);
  const closed = new Set(d.closed || []);
  const run = async (k, fn, ok) => { setBusy(k); try { await fn(); if (ok) toast(ok); reload(); } catch (e) { toast(e.message, 'bad'); } finally { setBusy(''); } };
  const taken = d.board.filter((b) => b.cur).length;
  const waiting = d.board.reduce((s, b) => s + b.queue.length, 0);
  return (
    <>
      <div className="ql-kpis lv-kpis">
        <div><b>{taken} / 6</b><span>times taken</span></div>
        <div><b>{d.board.reduce((s, b) => s + b.future.length, 0)}</b><span>booked ahead</span></div>
        <div><b>{waiting}</b><span>on waitlists</span></div>
        <div><b>{fmtMoney(d.price, d.currency)}</b><span>per 12 lessons (Settings → plans)</span></div>
      </div>
      <div className="lv-grid">
        {d.groups.map((g) => (
          <Card key={g.id} className="lv-col">
            <h3 className="lv-days">{g.label}</h3>
            {d.board.filter((b) => b.id.startsWith(g.id)).map((b) => {
              const s = d.slots.find((x) => x.id === b.id);
              return (
                <div key={b.id} className="lv-tslot">
                  <div className="row between wrap" style={{ gap: 8 }}>
                    <div className="lv-time"><IconClock width={16} height={16} /><b>{s.from}–{s.to}</b></div>
                    <label className="row lv-close"><input type="checkbox" checked={closed.has(b.id)} disabled={busy === b.id}
                      onChange={(e) => run(b.id, () => api.put('/live/closed', { slot: b.id, closed: e.target.checked }))} /> Closed for new students</label>
                  </div>
                  {b.cur ? (
                    <div className="lv-who">
                      <div><Link to={`/students/${b.cur.user_id}`}><b>{b.cur.name}</b></Link><small className="muted">{day(b.cur.starts_on)} – {day(b.cur.ends_on)} · renew by {day(b.cur.renew_by)}</small></div>
                      <button className="btn ghost sm" onClick={() => setEnd({ ...b.cur, started: true })}>End</button>
                    </div>
                  ) : <p className="muted lv-empty">Free</p>}
                  {b.future.map((f) => (
                    <div key={f.id} className="lv-who next">
                      <div><span className="chip">Next</span> <Link to={`/students/${f.user_id}`}>{f.name}</Link><small className="muted">from {day(f.starts_on)}</small></div>
                      <button className="btn ghost sm" onClick={() => setEnd(f)}>Cancel</button>
                    </div>
                  ))}
                  {b.queue.length > 0 && (
                    <ol className="lv-q">
                      {b.queue.map((q) => (
                        <li key={q.id}>
                          <span><Link to={`/students/${q.user_id}`}>{q.name}</Link>{q.status === 'offered' ? <small className="warn-text"> · offered until {when(q.offer_until)}</small> : ''}{!q.tg && <small className="muted"> · no Telegram</small>}</span>
                          <button className="icon-btn" aria-label="Remove from waitlist" disabled={busy === `q${q.id}`} onClick={() => run(`q${q.id}`, () => api.del(`/live/queue-entry/${q.id}`), 'Removed')}><IconX width={14} height={14} /></button>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              );
            })}
          </Card>
        ))}
      </div>
      {end && <Confirm title={end.started ? 'End this period now?' : 'Cancel this booking?'}
        text={end.started ? `${end.name}'s lessons stop now. No money moves automatically: top up their wallet if you return part of it. Their plan stays until its date.` : `${end.name}'s booking from ${day(end.starts_on)} is cancelled and the full price goes back to their wallet.`}
        confirmLabel={end.started ? 'End period' : 'Cancel and refund'} onClose={() => setEnd(null)}
        onConfirm={async () => { try { await api.post(`/live/bookings/${end.id}/cancel`); toast('Done'); setEnd(null); reload(); } catch (e) { toast(e.message, 'bad'); } }} />}
    </>
  );
}
