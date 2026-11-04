import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtDate } from '../api.js';
import { getConfig } from '../config.js';
import { useToast } from '../context.jsx';
import { Avatar, useAsync } from './ui.jsx';
import Character, { CHARACTERS, isVipCharacter } from './Character.jsx';
import { IconCopy, IconSend } from './icons.jsx';

/**
 * The student's SAT Ustoz card: drawn like a bank card, it is their wallet on the platform.
 *  - balance and wallet number (SU 0000 0000 0005, not a real bank card), owner, plan and "valid thru" (plan end)
 *  - Top up: opens the Telegram bot (the student sends a receipt, the teacher confirms, the money lands here)
 *  - Spend: plans and extra full mocks are paid from this balance on the server (balance_ledger)
 * Shown on the dashboard (compact) and the profile (with the last payments).
 */
const money = (n, cur = 'UZS') => `${Number(n || 0).toLocaleString('en-US').replace(/,/g, ' ')} ${cur === 'UZS' ? "so'm" : cur}`;
const heroOf = (vip) => {
  try { const h = localStorage.getItem('arena-hero'); if (CHARACTERS[h] && (vip || !isVipCharacter(h))) return h; } catch { /* storage blocked */ }
  return null;
};
const WHAT = { top_up: 'Top-up', subscription: 'Plan', full_mock: 'Full mock', quiz: 'Extra quiz', prize: 'Leaderboard prize', correction: 'Correction', topup: 'Top-up' };

/** Opens the payment bot in Telegram (new tab), with the student's start code. */
export function useTopUp() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [bot, setBot] = useState(null);
  useEffect(() => { getConfig().then((c) => setBot(c?.telegram_bot || '')).catch(() => setBot('')); }, []);
  const open = async () => {
    setBusy(true);
    const w = window.open('', '_blank');
    try { const r = await api.get('/telegram/link'); if (w) w.location.href = r.url; else window.location.href = r.url; }
    catch (e) { w?.close(); toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  return { open, busy, ready: bot !== '' };
}

export default function StudentCard({ user, compact = false, history = false }) {
  const toast = useToast();
  const st = useAsync(() => Promise.all([api.get('/me/balance'), api.get('/plans').catch(() => null)]), [user.id]);
  const top = useTopUp();
  const [bal, plans] = st.data || [];
  const cur = plans?.currency || 'UZS';
  const acc = user.access || {};
  const paid = !!acc.sub_active;
  const plan = paid ? (acc.tier?.name || 'Pro') : 'Free';
  const hero = heroOf(paid || acc.subscription_required === false);
  const no = bal?.wallet_no || `SU ${String(user.id || 0).padStart(12, '0').replace(/(\d{4})(?=\d)/g, '$1 ')}`;
  const copy = async () => { try { await navigator.clipboard.writeText(no.replace(/\s/g, '')); toast('Wallet number copied'); } catch { toast(no); } };
  const thru = paid && user.sub_until ? new Date(user.sub_until).toLocaleDateString('en-GB', { month: '2-digit', year: '2-digit' }) : '—';
  const cheapest = plans?.tiers?.length ? Math.min(...plans.tiers.map((t) => t.price).filter(Boolean)) : null;

  return (
    <div className={`wcard-wrap ${compact ? 'compact' : ''}`}>
      <section className={`wcard ${paid ? 'paid' : ''}`} aria-label="Your SAT Ustoz wallet card">
        <div className="wcard-top">
          <span className="wcard-brand">SAT <b>Ustoz</b></span>
          <span className={`wcard-plan ${paid ? 'on' : ''}`}>{paid && <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 7l4.5 4L12 4l4.5 7L21 7l-2 12H5z" /></svg>}{plan}</span>
        </div>
        <div className="wcard-mid">
          <span className="wcard-chip" aria-hidden="true" />
          <svg className="wcard-nfc" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M8.5 8.5a5 5 0 0 1 0 7" /><path d="M12 6a8.5 8.5 0 0 1 0 12" /><path d="M15.5 3.5a12 12 0 0 1 0 17" /></svg>
          <div className="wcard-bal">
            <small>Balance</small>
            <b>{st.loading && !bal ? '…' : money(bal?.balance, cur)}</b>
          </div>
        </div>
        <button type="button" className="wcard-no" onClick={copy} aria-label="Copy wallet number">{no}<IconCopy width={15} height={15} /></button>
        <div className="wcard-bottom">
          <div className="wcard-owner">
            <span className="wcard-face"><Avatar name={user.name} size={30} src={user.avatar_url} />{hero && <span className="wcard-hero" title={`Arena hero: ${CHARACTERS[hero].name}`}><Character kind={hero} size={20} /></span>}</span>
            <span><small>Owner</small><span>{user.name}</span></span>
          </div>
          <div className="wcard-thru"><small>Plan until</small><span>{thru}</span></div>
        </div>
      </section>

      <div className="wcard-acts">
        {top.ready
          ? <button type="button" className="btn primary" onClick={top.open} disabled={top.busy} title="Send a payment receipt in our Telegram bot"><IconSend width={16} height={16} /> {top.busy ? 'Opening…' : 'Top up'}</button>
          : <Link to="/subscribe#pay" className="btn primary"><IconSend width={16} height={16} /> Top up</Link>}
        <Link to="/subscribe" className="btn soft">Plans</Link>
        <Link to="/full-mocks" className="btn soft">Mocks</Link>
      </div>
      {!compact && <p className="wcard-help muted">Top up any amount in our Telegram bot: send the receipt, the teacher confirms and the money appears here. Pay for plans{cheapest ? ` (from ${money(cheapest, cur)})` : ''} and extra full mocks{plans?.fm_extra_price ? ` (${money(plans.fm_extra_price, cur)})` : ''} straight from the balance.</p>}

      {history && bal?.history?.length > 0 && (
        <div className="wcard-hist">
          <b>Last payments</b>
          {bal.history.slice(0, 5).map((h, i) => (
            <div key={i} className="wcard-row">
              <span className={`wcard-dot ${h.amount > 0 ? 'in' : 'out'}`} aria-hidden="true">{h.amount > 0 ? '+' : '−'}</span>
              <span className="grow"><span>{WHAT[h.reason] || h.reason}{h.note ? ` · ${h.note}` : ''}</span><small>{fmtDate(h.created_at)}</small></span>
              <b className={h.amount > 0 ? 'good-text' : ''}>{h.amount > 0 ? '+' : '−'}{money(Math.abs(h.amount), cur)}</b>
            </div>
          ))}
          <Link to="/subscribe" className="linkish">All payments →</Link>
        </div>
      )}
    </div>
  );
}
