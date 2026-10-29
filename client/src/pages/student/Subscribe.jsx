import { useEffect, useState } from 'react';
import { useAuth } from '../../context.jsx';
import { fmtDate } from '../../api.js';
import { getConfig } from '../../config.js';
import { Card, PageHeader } from '../../components/ui.jsx';
import { IconCheck, IconCrown, IconSend } from '../../components/icons.jsx';

const fmtMoney = (n, cur) => `${Number(n || 0).toLocaleString('en-US').replace(/,/g, ' ')} ${cur || ''}`.trim();
const PERKS = ['Full roadmap: every step, video lesson and note', 'All practice quizzes and full-length mocks', 'Mistake analysis with explanations', 'Saved questions, analytics and portfolio'];

export default function Subscribe() {
  const { user } = useAuth();
  const [cfg, setCfg] = useState(null);
  useEffect(() => { getConfig().then(setCfg); }, []);
  const active = user.sub_active;
  const bot = cfg?.telegram_bot;
  const link = (plan) => (bot ? `https://t.me/${bot}?start=sub_${user.id}_${plan}` : null);
  const plans = [
    { id: 'month', name: '1 month', price: cfg?.prices?.month, note: 'Billed monthly' },
    { id: 'quarter', name: '3 months', price: cfg?.prices?.quarter, note: 'Best value', best: true },
  ];

  return (
    <div className="page">
      <PageHeader title="Subscription" sub="Full access to the SAT course. Payments are made securely through our Telegram bot." />
      <Card className="row wrap" style={{ gap: 16 }}>
        <span className="item-ic" style={{ width: 48, height: 48 }}><IconCrown /></span>
        <div className="grow">
          <b>{active ? 'Your subscription is active' : user.access?.subscription_required ? 'No active subscription' : 'Free access is open right now'}</b>
          <p className="muted" style={{ fontSize: '.9rem' }}>
            {active ? `Valid until ${fmtDate(user.sub_until)}.` : user.access?.subscription_required ? 'Choose a plan to unlock quizzes, lessons and mocks.' : 'Your teacher has opened the platform for everyone. You can still subscribe in advance.'}
          </p>
        </div>
        {active && <span className="chip good"><IconCheck width={14} height={14} /> Active</span>}
      </Card>
      <div className="plans stagger">
        {plans.map((p) => (
          <Card key={p.id} className={`plan ${p.best ? 'best' : ''}`}>
            {p.best && <span className="chip primary ribbon">Best value</span>}
            <b>{p.name}</b>
            <div className="price">{cfg ? fmtMoney(p.price, cfg.prices.currency) : '…'}</div>
            <ul className="check-list">{PERKS.map((x) => <li key={x}><IconCheck width={16} height={16} />{x}</li>)}</ul>
            {link(p.id)
              ? <a className="btn primary" href={link(p.id)} target="_blank" rel="noreferrer"><IconSend width={18} height={18} /> Pay via Telegram</a>
              : <button className="btn primary" disabled><IconSend width={18} height={18} /> Telegram payments — coming soon</button>}
          </Card>
        ))}
      </div>
      <p className="muted" style={{ fontSize: '.86rem' }}>
        After payment the bot activates your subscription automatically. Until the bot is live, your teacher can activate your access manually — tell them the email you signed up with: <b style={{ color: 'var(--ink)' }}>{user.email || user.login}</b>.
      </p>
    </div>
  );
}
