import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useAuth, useToast } from '../../context.jsx';
import { Avatar, Card, Empty, Gate, Modal, PageHeader, Segmented, useAsync } from '../../components/ui.jsx';
import { IconAward, IconCrown, IconEdit, IconFlame, IconTrophy } from '../../components/icons.jsx';

const HOW = [['Correct SAT answer', '+10'], ['Vocabulary review', '+2'], ['Correct Word Arena answer', '+5'], ['Minute of study', '+1']];
const PLACE = ['1st', '2nd', '3rd'];

function useCountdown(to) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const s = Math.max(0, Math.floor((new Date(to).getTime() - now) / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

/** Ranking of all students by points this week or all time, with weekly prizes for the top 3. */
export default function Leaderboard() {
  const { user } = useAuth();
  const teacher = user.role === 'master';
  const [period, setPeriod] = useState('week');
  const [edit, setEdit] = useState(false);
  const st = useAsync(() => api.get('/leaderboard?period=' + period), [period]);
  return (
    <div className="page" style={{ maxWidth: 900, margin: '0 auto', width: '100%' }}>
      <PageHeader title="Leaderboard" sub="Every correct answer and every minute of study earns points. The top 3 of the week win prizes." />
      <Gate state={st}>{(d) => (
        <>
          <Prizes d={d} teacher={teacher} onEdit={() => setEdit(true)} onAwarded={st.reload} />
          <Segmented value={period} onChange={setPeriod} options={[{ value: 'week', label: 'This week' }, { value: 'all', label: 'All time' }]} />
          <Board d={d} />
          {edit && <EditPrizes d={d} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); st.reload(); }} />}
        </>
      )}</Gate>
      <Card>
        <h3 className="sr-h">How to earn points</h3>
        <div className="lb-how">{HOW.map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}</div>
        <p className="muted" style={{ fontSize: '.82rem', marginTop: 8 }}>The weekly board starts again every Monday at 00:00 (Tashkent). Only first names are shown.</p>
      </Card>
    </div>
  );
}

function Prizes({ d, teacher, onEdit, onAwarded }) {
  const toast = useToast();
  const c = useCountdown(d.ends_at);
  const [busy, setBusy] = useState(false);
  const prizes = d.prizes.filter((p) => p.text || p.bonus);
  const lw = d.last_week?.winners || [];
  const due = teacher && lw.some((w, i) => !w.awarded && d.prizes[i]?.bonus);
  const award = async () => {
    setBusy(true);
    try { const r = await api.post('/leaderboard/award', {}); toast(r.awarded ? `${r.awarded} prize${r.awarded === 1 ? '' : 's'} sent to wallets` : 'Nothing new to award'); onAwarded(); }
    catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  return (
    <section className="lb-prizes">
      <div className="lb-prizes-head">
        <div>
          <small className="tq-eyebrow">WEEKLY PRIZES</small>
          <h2>Finish in the top 3 this week</h2>
          {d.prize_note && <p>{d.prize_note}</p>}
        </div>
        <div className="lb-clock" aria-label="Time left this week">
          {[[c.d, 'days'], [c.h, 'hrs'], [c.m, 'min'], [c.s, 'sec']].map(([v, l]) => <span key={l}><b>{String(v).padStart(2, '0')}</b><i>{l}</i></span>)}
        </div>
      </div>
      <div className="lb-prize-row">
        {prizes.length ? prizes.slice(0, 3).map((p, i) => (
          <div key={i} className={`lb-prize p${i + 1}`}>
            <span className="lb-medal">{i === 0 ? <IconCrown width={22} height={22} weight="fill" /> : <IconAward width={22} height={22} weight="fill" />}</span>
            <small>{PLACE[i]} place</small>
            <b>{p.text || `${p.bonus.toLocaleString('en-US').replace(/,/g, ' ')} so‘m`}</b>
            {d.top[i]?.points > 0 && <em>now: {d.top[i].name}{d.top[i].me ? ' (you)' : ''}</em>}
          </div>
        )) : <p className="muted">No prizes set yet.</p>}
      </div>
      {d.chase && d.period === 'week' && (
        <p className="lb-chase"><IconFlame width={18} height={18} /> <b>{d.chase.gap} points</b> to pass {d.chase.name} and take #{d.chase.rank}{d.chase.rank <= 3 ? ` — that is a prize place` : ''}.</p>
      )}
      {d.me?.rank === 1 && d.me.points > 0 && d.period === 'week' && <p className="lb-chase win"><IconCrown width={18} height={18} /> You are #1 this week — keep going to hold it.</p>}
      {lw.length > 0 && (
        <div className="lb-last">
          <span>Last week:</span>
          {lw.map((w, i) => <span key={w.id} className="lb-last-w"><i>{i + 1}</i> {w.name} · {w.points}{w.awarded ? ' · prize sent' : ''}</span>)}
        </div>
      )}
      {teacher && (
        <div className="row wrap" style={{ marginTop: 12 }}>
          <button className="btn ghost sm" onClick={onEdit}><IconEdit width={16} height={16} /> Edit prizes</button>
          {due && <button className="btn sun sm" disabled={busy} onClick={award}>Send last week’s wallet prizes</button>}
        </div>
      )}
    </section>
  );
}

function Board({ d }) {
  const top3 = d.top.filter((x) => x.points > 0).slice(0, 3);
  const rest = d.top.filter((x) => x.points > 0).slice(3);
  if (!top3.length) return <Card><Empty icon={<IconTrophy />} title="No points yet this week" text="Answer a few questions and you will be first on the board." /></Card>;
  return (
    <>
      {d.me && <div className={`lb-me ${d.me.rank <= 3 ? 'top' : ''}`}><span>Your place</span><b>#{d.me.rank}</b><small>{d.me.points} points{d.total ? ` · of ${d.total} ${d.total === 1 ? 'student' : 'students'}` : ''}</small></div>}
      <div className="lb-podium">
        {[top3[1], top3[0], top3[2]].map((x, i) => !x ? <div key={'e' + i} /> : (
          <div key={x.id} className={`lb-pod p${x.rank} ${x.me ? 'me' : ''}`} style={{ '--i': i }}>
            {x.rank === 1 && <IconCrown className="lb-crown" width={26} height={26} weight="fill" />}
            <Avatar name={x.name} src={x.avatar_url} size={x.rank === 1 ? 64 : 52} />
            <b>{x.name}{x.me ? ' (you)' : ''}</b>
            <small>{x.points} pts</small>
            {d.period === 'week' && d.prizes[x.rank - 1]?.text && <span className="lb-pod-prize">{d.prizes[x.rank - 1].text}</span>}
            <div className="lb-step"><span>{x.rank}</span></div>
          </div>
        ))}
      </div>
      {rest.length > 0 && (
        <Card className="lb-list">
          {rest.map((x) => (
            <div key={x.id} className={`lb-row ${x.me ? 'me' : ''}`}>
              <span className="lb-rank">{x.rank}</span>
              <Avatar name={x.name} src={x.avatar_url} />
              <b>{x.name}{x.me ? ' (you)' : ''}</b>
              {top3[2] && <small className="lb-gap">{top3[2].points - x.points + 1} to top 3</small>}
              <span className="lb-pts">{x.points}</span>
            </div>
          ))}
        </Card>
      )}
      {d.me && d.me.rank > 50 && <Card className="lb-row me"><span className="lb-rank">{d.me.rank}</span><b>You</b><span className="lb-pts">{d.me.points}</span></Card>}
    </>
  );
}

function EditPrizes({ d, onClose, onSaved }) {
  const toast = useToast();
  const [rows, setRows] = useState(() => [0, 1, 2].map((i) => ({ text: d.prizes[i]?.text || '', bonus: d.prizes[i]?.bonus || 0 })));
  const [note, setNote] = useState(d.prize_note || '');
  const set = (i, k) => (e) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)));
  const save = async () => {
    try { await api.put('/leaderboard/prizes', { prizes: rows, note }); toast('Prizes saved'); onSaved(); } catch (e) { toast(e.message, 'bad'); }
  };
  return (
    <Modal title="Weekly prizes" onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save</button></>}>
      <div className="stack">
        {rows.map((r, i) => (
          <div key={i} className="grid g2">
            <label className="field"><span>{PLACE[i]} place — prize</span><input value={r.text} onChange={set(i, 'text')} maxLength={80} placeholder="SAT book, free month of Plan 3…" /></label>
            <label className="field"><span>Wallet bonus (so‘m)</span><input inputMode="numeric" value={r.bonus} onChange={set(i, 'bonus')} placeholder="0" /></label>
          </div>
        ))}
        <label className="field"><span>Note for students</span><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Prizes are announced every Monday on Telegram." /></label>
        <small className="muted">Wallet bonuses go to last week’s top 3 when you press “Send last week’s wallet prizes”. Each place is paid only once.</small>
      </div>
    </Modal>
  );
}
