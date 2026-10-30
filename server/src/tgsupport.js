/**
 * Support inside the Telegram bot: questions, suggestions and complaints.
 * A student writes → the teacher gets it in Telegram (reply to the message or press “Javob berish”)
 * and in the teacher panel (Support). The answer goes back to the student through the bot.
 * Anyone can write — a website account is not required.
 */
import { db } from './db.js';

export async function migrateSupport() {
  await db.exec(`
CREATE TABLE IF NOT EXISTS tg_tickets (
  id SERIAL PRIMARY KEY,
  chat_id TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  tg_name TEXT NOT NULL DEFAULT '', tg_username TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'question',
  status TEXT NOT NULL DEFAULT 'open',
  rating INTEGER,
  admin_msgs TEXT NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), last_from TEXT NOT NULL DEFAULT 'user'
);
CREATE TABLE IF NOT EXISTS tg_ticket_msgs (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES tg_tickets(id) ON DELETE CASCADE,
  author TEXT NOT NULL DEFAULT 'user',
  text TEXT NOT NULL DEFAULT '', file_id TEXT NOT NULL DEFAULT '', file_kind TEXT NOT NULL DEFAULT '',
  by_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tg_tickets ON tg_tickets(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_tg_ticket_msgs ON tg_ticket_msgs(ticket_id, id);
ALTER TABLE tg_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE tg_ticket_msgs ENABLE ROW LEVEL SECURITY;
`);
}

export const CATS = {
  question: { label: 'Savol', icon: '💬', ask: "Savolingizni yozing — matn yoki rasm. Ustoz imkon qadar tez javob beradi." },
  idea: { label: 'Taklif', icon: '💡', ask: "Taklifingizni yozing. Platformani yaxshilash uchun har bir fikr muhim!" },
  complaint: { label: 'Shikoyat', icon: '⚠️', ask: "Nima noto'g'ri bo'ldi? Batafsil yozing (kerak bo'lsa skrinshot ham yuboring)." },
  payment: { label: "To'lov muammosi", icon: '💳', ask: "To'lov bilan nima muammo? Chek raqami yoki skrinshotni ham yuboring." },
};
export const MENU = {
  plans: '💳 Obuna',
  mine: '📊 Mening obunam',
  question: '💬 Savol berish',
  idea: '💡 Taklif',
  complaint: '⚠️ Shikoyat',
  faq: "❓ Ko'p so'raladigan savollar",
};
export const menuKeyboard = () => ({
  keyboard: [[{ text: MENU.plans }, { text: MENU.mine }], [{ text: MENU.question }, { text: MENU.idea }], [{ text: MENU.complaint }, { text: MENU.faq }]],
  resize_keyboard: true, is_persistent: true,
});

const esc = (s) => String(s ?? '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

// per-chat state (what the bot waits for next)
export async function getState(chat) {
  const r = await db.one('SELECT data FROM tg_state WHERE chat_id = ?', [String(chat)]);
  try { return r ? JSON.parse(r.data) : {}; } catch { return {}; }
}
export async function setState(chat, data) {
  await db.run('INSERT INTO tg_state (chat_id, data, updated_at) VALUES (?, ?, now()) ON CONFLICT (chat_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()', [String(chat), JSON.stringify(data || {})]);
}

/** A message from the student → new ticket, or a follow-up to an open one. */
export async function userMessage(ctx, chat, msg, st) {
  const { tg, send, admins } = ctx;
  const photo = msg.photo?.[msg.photo.length - 1];
  const file_id = photo?.file_id || msg.document?.file_id || '';
  const file_kind = photo ? 'photo' : msg.document ? 'document' : '';
  const text = String(msg.text || msg.caption || '').trim().slice(0, 3500);
  if (!text && !file_id) return send(chat, 'Matn yoki rasm yuboring.');
  const user = await db.one('SELECT id, name, email, login, sub_until FROM users WHERE tg_chat_id = ?', [String(chat)]);
  let t = st.ticket ? await db.one("SELECT * FROM tg_tickets WHERE id = ? AND chat_id = ? AND status <> 'closed'", [st.ticket, String(chat)]) : null;
  const name = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ');
  if (!t) {
    const r = await db.run('INSERT INTO tg_tickets (chat_id, user_id, tg_name, tg_username, category) VALUES (?,?,?,?,?) RETURNING id',
      [String(chat), user?.id || null, name.slice(0, 80), String(msg.from?.username || '').slice(0, 60), st.category || 'question']);
    t = await db.one('SELECT * FROM tg_tickets WHERE id = ?', [r.id]);
  }
  await db.run('INSERT INTO tg_ticket_msgs (ticket_id, author, text, file_id, file_kind) VALUES (?,?,?,?,?)', [t.id, 'user', text, file_id, file_kind]);
  await db.run("UPDATE tg_tickets SET updated_at = now(), last_from = 'user', status = 'open' WHERE id = ?", [t.id]);
  await setState(chat, {});
  const c = CATS[t.category] || CATS.question;
  await send(chat, st.ticket
    ? `✅ Qo'shimcha xabaringiz №${t.id} murojaatga qo'shildi.`
    : `✅ ${c.label} qabul qilindi (№${t.id}). Rahmat! Javob shu chatga keladi.`, { reply_markup: menuKeyboard() });

  // to the teacher(s): reply to this message or press the button
  const head = `${c.icon} <b>${c.label} №${t.id}</b>${st.ticket ? ' (davomi)' : ''}\n👤 ${esc(name || 'Mijoz')}${msg.from?.username ? ` @${esc(msg.from.username)}` : ''}${user ? `\n🎓 ${esc(user.name)} · ${esc(user.email || user.login)}` : '\n(saytda hisobi ulanmagan)'}`;
  const body = `${head}\n\n${esc(text)}`.slice(0, 1000);
  const kb = { inline_keyboard: [[{ text: '✍️ Javob berish', callback_data: `t_ans:${t.id}` }, { text: '✅ Yopish', callback_data: `t_close:${t.id}` }]] };
  let msgs = [];
  try { msgs = JSON.parse(t.admin_msgs || '[]'); } catch {}
  for (const a of await admins()) {
    try {
      const m = file_kind
        ? await tg(file_kind === 'photo' ? 'sendPhoto' : 'sendDocument', { chat_id: a, [file_kind]: file_id, caption: body, parse_mode: 'HTML', reply_markup: kb })
        : await tg('sendMessage', { chat_id: a, text: body, parse_mode: 'HTML', reply_markup: kb });
      msgs.push([String(a), m.message_id]);
    } catch (e) { console.error('[tg] support → admin', e.message); }
  }
  await db.run('UPDATE tg_tickets SET admin_msgs = ? WHERE id = ?', [JSON.stringify(msgs.slice(-40)), t.id]);
}

/** The teacher answers (from Telegram or the website) → the student gets it in the bot. */
export async function answer(ctx, ticketId, text, byName, close = false) {
  const { send } = ctx;
  const t = await db.one('SELECT * FROM tg_tickets WHERE id = ?', [ticketId]);
  if (!t) throw Object.assign(new Error('Ticket not found'), { status: 404 });
  const body = String(text || '').trim().slice(0, 3500);
  if (!body) throw Object.assign(new Error('Write an answer'), { status: 400 });
  await db.run('INSERT INTO tg_ticket_msgs (ticket_id, author, text, by_name) VALUES (?,?,?,?)', [t.id, 'teacher', body, String(byName || '').slice(0, 60)]);
  await db.run(`UPDATE tg_tickets SET updated_at = now(), last_from = 'teacher', status = ? WHERE id = ?`, [close ? 'closed' : 'answered', t.id]);
  await send(t.chat_id, `👨‍🏫 <b>SAT Ustoz javobi</b> (№${t.id})\n\n${esc(body)}`, {
    reply_markup: { inline_keyboard: [[{ text: '↩️ Javob yozish', callback_data: `t_more:${t.id}` }], ...(close ? [] : [[{ text: '✅ Masala hal bo\'ldi', callback_data: `t_done:${t.id}` }]])] },
  });
  return { ok: true };
}

export async function closeTicket(ctx, ticketId, by = 'teacher') {
  const { send } = ctx;
  const t = await db.one('SELECT * FROM tg_tickets WHERE id = ?', [ticketId]);
  if (!t || t.status === 'closed') return { ok: true };
  await db.run("UPDATE tg_tickets SET status = 'closed', updated_at = now() WHERE id = ?", [t.id]);
  if (by === 'teacher') {
    await send(t.chat_id, `Murojaatingiz №${t.id} yopildi. Yordam berdikmi?`, {
      reply_markup: { inline_keyboard: [[{ text: '👍 Ha', callback_data: `t_rate:${t.id}:5` }, { text: '👎 Yo\'q', callback_data: `t_rate:${t.id}:1` }]] },
    });
  }
  return { ok: true };
}

/** Find the ticket the teacher replied to (Telegram “reply” on our forwarded message). */
export async function ticketByAdminMessage(chat, messageId) {
  const rows = await db.all("SELECT id, admin_msgs FROM tg_tickets WHERE admin_msgs LIKE ? ORDER BY id DESC LIMIT 20", [`%${messageId}%`]);
  for (const r of rows) {
    try { if (JSON.parse(r.admin_msgs).some(([c, m]) => String(c) === String(chat) && Number(m) === Number(messageId))) return r.id; } catch {}
  }
  return null;
}

export function registerSupportAdmin(app, { h, bad, requireMaster }, ctx) {
  app.get('/api/support', requireMaster, h(async (req, res) => {
    const status = ['open', 'answered', 'closed'].includes(req.query.status) ? req.query.status : null;
    const list = await db.all(`SELECT t.*, u.name AS user_name, u.email AS user_email,
        (SELECT text FROM tg_ticket_msgs m WHERE m.ticket_id = t.id ORDER BY m.id DESC LIMIT 1) AS last_text,
        (SELECT COUNT(*) FROM tg_ticket_msgs m WHERE m.ticket_id = t.id) AS n
      FROM tg_tickets t LEFT JOIN users u ON u.id = t.user_id
      ${status ? 'WHERE t.status = ?' : ''} ORDER BY (t.status = 'open') DESC, t.updated_at DESC LIMIT 100`, status ? [status] : []);
    const counts = await db.one(`SELECT SUM(CASE WHEN status='open' THEN 1 ELSE 0 END) AS open, SUM(CASE WHEN status='answered' THEN 1 ELSE 0 END) AS answered,
      SUM(CASE WHEN status='closed' THEN 1 ELSE 0 END) AS closed FROM tg_tickets`);
    res.json({ list: list.map((t) => ({ ...t, admin_msgs: undefined, n: Number(t.n) })), counts: { open: Number(counts.open || 0), answered: Number(counts.answered || 0), closed: Number(counts.closed || 0) } });
  }));
  app.get('/api/support/:id', requireMaster, h(async (req, res) => {
    const t = await db.one('SELECT t.*, u.name AS user_name, u.email AS user_email FROM tg_tickets t LEFT JOIN users u ON u.id = t.user_id WHERE t.id = ?', [Number(req.params.id)]);
    if (!t) return bad(res, 'Not found', 404);
    const msgs = await db.all('SELECT id, author, text, file_kind, by_name, created_at FROM tg_ticket_msgs WHERE ticket_id = ? ORDER BY id', [t.id]);
    res.json({ ...t, admin_msgs: undefined, msgs });
  }));
  app.get('/api/support/file/:msgId', requireMaster, h(async (req, res) => {
    const m = await db.one('SELECT file_id FROM tg_ticket_msgs WHERE id = ?', [Number(req.params.msgId)]);
    if (!m?.file_id) return bad(res, 'Not found', 404);
    const { buf, type } = await ctx.download(m.file_id);
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(buf);
  }));
  app.post('/api/support/:id/reply', requireMaster, h(async (req, res) => {
    res.json(await answer(ctx, Number(req.params.id), req.body?.text, req.user.name, !!req.body?.close));
  }));
  app.post('/api/support/:id/close', requireMaster, h(async (req, res) => {
    res.json(await closeTicket(ctx, Number(req.params.id)));
  }));
}
