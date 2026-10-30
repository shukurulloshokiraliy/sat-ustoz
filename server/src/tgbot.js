/**
 * Telegram payment bot (webhook, works on Vercel).
 *
 * Student: Subscription page → "Pay via Telegram" → the bot opens with a signed link to their account →
 *   chooses a plan → pays
 *     a) by card transfer: the bot shows the card, the student sends a photo of the receipt,
 *        the teacher gets it in Telegram with ✅ / ❌ buttons (also in Settings on the website);
 *     b) by Click / Payme inside Telegram (Telegram Payments) when a provider token is set —
 *        the subscription turns on automatically after payment.
 * Teacher: connects the bot in Settings (token from @BotFather), then sends `/admin CODE` to the bot once
 *   to receive payment requests.
 */
import crypto from 'node:crypto';
import { db, getSettings } from './db.js';
import { getSecret, subActive } from './auth.js';
import { getBlock } from './site.js';
import { CATS, MENU, answer, closeTicket, getState, menuKeyboard, migrateSupport, registerSupportAdmin, registerSupportWeb, setState, ticketByAdminMessage, userMessage } from './tgsupport.js';

export async function migrateBot() {
  await db.exec(`
ALTER TABLE users ADD COLUMN IF NOT EXISTS tg_chat_id TEXT;
CREATE TABLE IF NOT EXISTS tg_requests (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL,
  plan TEXT NOT NULL, days INTEGER NOT NULL, amount INTEGER NOT NULL, currency TEXT NOT NULL DEFAULT 'UZS',
  method TEXT NOT NULL DEFAULT 'card',
  file_id TEXT NOT NULL DEFAULT '', file_kind TEXT NOT NULL DEFAULT 'photo',
  status TEXT NOT NULL DEFAULT 'pending',
  external_id TEXT NOT NULL DEFAULT '',
  admin_msgs TEXT NOT NULL DEFAULT '[]',
  decided_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), decided_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_tg_requests ON tg_requests(status, created_at);
CREATE TABLE IF NOT EXISTS tg_state (chat_id TEXT PRIMARY KEY, data TEXT NOT NULL DEFAULT '{}', updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
ALTER TABLE tg_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE tg_state ENABLE ROW LEVEL SECURITY;
`);
  await migrateSupport();
}

// ---------- internal settings (never sent to the browser) ----------
const getKey = async (k) => (await db.one('SELECT value FROM settings WHERE key = ?', [k]))?.value || '';
const setKey = (k, v) => db.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value', [k, String(v ?? '')]);
const admins = async () => { try { return JSON.parse((await getKey('_tg_admins')) || '[]'); } catch { return []; } };

async function tg(method, body, token) {
  token ||= await getKey('_tg_token');
  if (!token) throw new Error('Telegram bot is not connected');
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}), signal: AbortSignal.timeout(15000),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw Object.assign(new Error(`Telegram: ${j.description || r.status}`), { status: 400 });
  return j.result;
}
async function download(file_id) {
  const f = await tg('getFile', { file_id });
  const token = await getKey('_tg_token');
  const r = await fetch(`https://api.telegram.org/file/bot${token}/${f.file_path}`, { signal: AbortSignal.timeout(20000) });
  return { buf: Buffer.from(await r.arrayBuffer()), type: r.headers.get('content-type') || 'application/octet-stream' };
}
const send = (chat_id, text, extra = {}) => tg('sendMessage', { chat_id, text, parse_mode: 'HTML', disable_web_page_preview: true, ...extra }).catch((e) => console.error('[tg]', e.message));

const isAdmin = async (chat) => (await admins()).map(String).includes(String(chat));
const ctx = { tg: (...a) => tg(...a), send: (...a) => send(...a), admins: () => admins(), download: (id) => download(id) };

// ---------- plans ----------
async function plans() {
  const s = await getSettings();
  return [
    { id: 'month', label: '1 oy', days: 30, amount: Number(s.price_month) || 0 },
    { id: 'quarter', label: '3 oy', days: 90, amount: Number(s.price_quarter) || 0 },
  ].filter((p) => p.amount > 0).map((p) => ({ ...p, currency: s.currency || 'UZS' }));
}
const money = (n, cur = 'UZS') => `${Number(n || 0).toLocaleString('en-US').replace(/,/g, ' ')} ${cur === 'UZS' ? "so'm" : cur}`;
const esc = (s) => String(s ?? '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
const day = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** Signed start code: links a Telegram chat to exactly one website account. */
const sign = (id) => crypto.createHmac('sha256', getSecret()).update(`tg:${id}`).digest('base64url').slice(0, 12);
export const startCode = (userId) => `pay_${Number(userId).toString(36)}_${sign(userId)}`;
function readCode(code) {
  const m = /^pay_([0-9a-z]+)_([\w-]{12})$/.exec(String(code || ''));
  if (!m) return null;
  const id = parseInt(m[1], 36);
  return sign(id) === m[2] ? id : null;
}

/** One place that turns a subscription on (teacher by hand, card receipt, Click/Payme). */
export async function activate(userId, { plan, days, amount, currency = 'UZS', provider = 'manual', note = '', external_id = '', by = null }) {
  const u = await db.one('SELECT * FROM users WHERE id = ?', [userId]);
  if (!u) throw new Error('Student not found');
  const from = subActive(u) ? new Date(u.sub_until) : new Date();
  const until = new Date(from.getTime() + days * 86400e3).toISOString();
  await db.tx(async (t) => {
    await t.run('UPDATE users SET sub_until = ?, sub_plan = ? WHERE id = ?', [until, plan, u.id]);
    await t.run('INSERT INTO payments (user_id, provider, plan, days, amount, currency, note, external_id, created_by) VALUES (?,?,?,?,?,?,?,?,?)',
      [u.id, provider, plan, days, amount, currency, note.slice(0, 300), external_id.slice(0, 120), by]);
  });
  return until;
}

// ---------- bot screens ----------
async function showPlans(chat, user) {
  const ps = await plans();
  const active = subActive(user);
  const head = active
    ? `✅ <b>${esc(user.name)}</b>, obunangiz <b>${day(user.sub_until)}</b> gacha faol.\nUzaytirish uchun tarifni tanlang:`
    : `👋 Assalomu alaykum, <b>${esc(user.name)}</b>!\n\n<b>SAT Ustoz</b> obunasi: to'liq roadmap, video darslar, butun Question Bank, mock imtihonlar va cheksiz practice testlar.\n\nTarifni tanlang:`;
  await send(chat, head, { reply_markup: { inline_keyboard: ps.map((p) => [{ text: `${p.label} — ${money(p.amount, p.currency)}`, callback_data: `plan:${p.id}` }]) } });
}

async function chooseMethod(chat, planId) {
  const p = (await plans()).find((x) => x.id === planId);
  if (!p) return send(chat, 'Bu tarif topilmadi. /start bosing.');
  const payToken = await getKey('_tg_pay_token');
  const s = await getSettings();
  const rows = [];
  if (payToken) rows.push([{ text: '💳 Click / Payme orqali (avtomatik)', callback_data: `click:${p.id}` }]);
  if (s.pay_card) rows.push([{ text: '🏦 Karta orqali o\'tkazish', callback_data: `card:${p.id}` }]);
  if (!rows.length) return send(chat, "To'lov kartasi hali kiritilmagan — ustoz tez orada qo'shadi. Savolingiz bo'lsa, «💬 Savol berish» tugmasini bosing.");
  await send(chat, `<b>${p.label}</b> — ${money(p.amount, p.currency)}\nTo'lov usulini tanlang:`, { reply_markup: { inline_keyboard: rows } });
}

async function cardInfo(chat, planId) {
  const p = (await plans()).find((x) => x.id === planId);
  const s = await getSettings();
  if (!p || !s.pay_card) return send(chat, "Karta hali kiritilmagan. O'qituvchingizga yozing.");
  await setKey(`_tg_wait_${chat}`, JSON.stringify({ plan: p.id, at: Date.now() }));
  await send(chat, [
    `🏦 <b>Karta orqali to'lov</b>`,
    ``,
    `Karta: <code>${esc(s.pay_card)}</code>`,
    s.pay_holder ? `Egasi: <b>${esc(s.pay_holder)}</b>` : null,
    `Summa: <b>${money(p.amount, p.currency)}</b> (${p.label})`,
    ``,
    `1️⃣ Shu kartaga pul o'tkazing (Click, Payme, Uzum yoki bank ilovasi).`,
    `2️⃣ <b>Chek rasmini (skrinshot) shu yerga yuboring.</b>`,
    `3️⃣ O'qituvchi tasdiqlashi bilan obunangiz yoqiladi — bot sizga xabar beradi.`,
  ].filter((x) => x !== null).join('\n'), { reply_markup: { inline_keyboard: [[{ text: "To'lovda muammo bormi? Yozing", callback_data: 'cat:payment' }]] } });
}

async function sendInvoice(chat, user, planId) {
  const p = (await plans()).find((x) => x.id === planId);
  const token = await getKey('_tg_pay_token');
  if (!p || !token) return send(chat, "Click / Payme hozircha ulanmagan. Karta orqali to'lang.");
  await tg('sendInvoice', {
    chat_id: chat, title: `SAT Ustoz — ${p.label}`, description: `SAT Ustoz obunasi: ${p.days} kun`,
    payload: `sub:${user.id}:${p.id}`, provider_token: token, currency: p.currency,
    prices: [{ label: `Obuna ${p.label}`, amount: p.amount * 100 }],
  });
}

async function receipt(chat, user, msg) {
  let wait = null;
  try { wait = JSON.parse((await getKey(`_tg_wait_${chat}`)) || 'null'); } catch {}
  if (!wait || Date.now() - wait.at > 3 * 86400e3) {
    return send(chat, "Avval tarifni tanlang, keyin chek rasmini yuboring. /start");
  }
  const p = (await plans()).find((x) => x.id === wait.plan);
  if (!p) return send(chat, 'Tarif topilmadi. /start');
  const photo = msg.photo?.[msg.photo.length - 1];
  const file_id = photo?.file_id || msg.document?.file_id;
  const kind = photo ? 'photo' : 'document';
  const r = await db.run('INSERT INTO tg_requests (user_id, chat_id, plan, days, amount, currency, method, file_id, file_kind) VALUES (?,?,?,?,?,?,?,?,?) RETURNING id',
    [user.id, String(chat), p.id, p.days, p.amount, p.currency, 'card', file_id, kind]);
  await setKey(`_tg_wait_${chat}`, '');
  await send(chat, `✅ Chek qabul qilindi (№${r.id}). O'qituvchi tekshirib, obunangizni yoqadi — odatda bir necha daqiqada. Bot sizga xabar beradi.`);
  // to the teacher(s)
  const caption = `🧾 <b>To'lov cheki №${r.id}</b>\n👤 ${esc(user.name)} (${esc(user.email || user.login)})\n📦 ${p.label} — ${money(p.amount, p.currency)}\n${subActive(user) ? `Hozirgi obuna: ${day(user.sub_until)} gacha` : 'Hozir obunasi yo\'q'}`;
  const kb = { inline_keyboard: [[{ text: '✅ Tasdiqlash', callback_data: `ok:${r.id}` }, { text: '❌ Rad etish', callback_data: `no:${r.id}` }]] };
  const sent = [];
  for (const a of await admins()) {
    try {
      const m = await tg(kind === 'photo' ? 'sendPhoto' : 'sendDocument', { chat_id: a, [kind]: file_id, caption, parse_mode: 'HTML', reply_markup: kb });
      sent.push([a, m.message_id]);
    } catch (e) { console.error('[tg] admin', e.message); }
  }
  await db.run('UPDATE tg_requests SET admin_msgs = ? WHERE id = ?', [JSON.stringify(sent), r.id]);
  if (!sent.length) console.warn('[tg] no teacher connected — the request is waiting in Settings');
}

/** Approve or reject a card receipt (from Telegram buttons or from the website). */
export async function decide(id, ok, by) {
  const r = await db.one('SELECT * FROM tg_requests WHERE id = ?', [id]);
  if (!r) throw Object.assign(new Error('Request not found'), { status: 404 });
  if (r.status !== 'pending') return { already: r.status, r };
  let until = null;
  if (ok) until = await activate(r.user_id, { plan: r.plan, days: r.days, amount: r.amount, currency: r.currency, provider: 'card', note: `Telegram chek №${r.id}` });
  await db.run('UPDATE tg_requests SET status = ?, decided_at = now(), decided_by = ? WHERE id = ?', [ok ? 'approved' : 'rejected', String(by || ''), id]);
  await send(r.chat_id, ok
    ? `🎉 To'lov tasdiqlandi! Obunangiz <b>${day(until)}</b> gacha faol.\nSaytga kiring va o'qishni davom ettiring. Omad! 💪`
    : `❌ Chek №${r.id} tasdiqlanmadi. Summani va kartani tekshirib, qayta yuboring yoki o'qituvchingizga yozing.`);
  // update the teacher messages
  let msgs = [];
  try { msgs = JSON.parse(r.admin_msgs || '[]'); } catch {}
  for (const [chat, mid] of msgs) {
    await tg('editMessageReplyMarkup', { chat_id: chat, message_id: mid, reply_markup: { inline_keyboard: [[{ text: ok ? `✅ Tasdiqlandi (${by || ''})` : `❌ Rad etildi (${by || ''})`, callback_data: 'noop' }]] } }).catch(() => {});
  }
  return { status: ok ? 'approved' : 'rejected', until };
}

// ---------- webhook ----------
async function handle(u) {
  if (u.pre_checkout_query) {
    const q = u.pre_checkout_query;
    const [, uid, planId] = String(q.invoice_payload).split(':');
    const p = (await plans()).find((x) => x.id === planId);
    const okk = !!p && p.amount * 100 === q.total_amount && !!(await db.one('SELECT 1 AS x FROM users WHERE id = ?', [Number(uid)]));
    await tg('answerPreCheckoutQuery', { pre_checkout_query_id: q.id, ok: okk, ...(okk ? {} : { error_message: "Narx o'zgargan — /start bosib qaytadan urinib ko'ring." }) });
    return;
  }
  if (u.callback_query) {
    const q = u.callback_query;
    const chat = q.message?.chat?.id;
    const data = String(q.data || '');
    await tg('answerCallbackQuery', { callback_query_id: q.id }).catch(() => {});
    if (data === 'noop') return;
    const [act, arg, extra] = data.split(':');
    // ---- support ----
    if (act === 'cat' && CATS[arg]) { await setState(chat, { category: arg }); return send(chat, CATS[arg].ask, { reply_markup: { inline_keyboard: [[{ text: 'Bekor qilish', callback_data: 'cancel' }]] } }); }
    if (act === 'cancel') { await setState(chat, {}); return send(chat, 'Bekor qilindi.', { reply_markup: menuKeyboard() }); }
    if (act === 't_more') { await setState(chat, { ticket: Number(arg) }); return send(chat, `№${arg} murojaatga javobingizni yozing:`, { reply_markup: { inline_keyboard: [[{ text: 'Bekor qilish', callback_data: 'cancel' }]] } }); }
    if (act === 't_done') { await closeTicket(ctx, Number(arg), 'user'); await tg('editMessageReplyMarkup', { chat_id: chat, message_id: q.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => {}); return send(chat, 'Rahmat! Murojaat yopildi. Yana savol bo\'lsa — menyudan yozing.', { reply_markup: menuKeyboard() }); }
    if (act === 't_rate') {
      await db.run('UPDATE tg_tickets SET rating = ? WHERE id = ? AND chat_id = ?', [Number(extra) || null, Number(arg), String(chat)]);
      await tg('editMessageText', { chat_id: chat, message_id: q.message.message_id, text: 'Rahmat, fikringiz qabul qilindi!' }).catch(() => {});
      return;
    }
    if (act === 't_ans' || act === 't_close') {
      if (!(await isAdmin(q.from.id))) return send(chat, "Bu tugma faqat o'qituvchi uchun.");
      if (act === 't_close') { await closeTicket(ctx, Number(arg)); return send(chat, `№${arg} yopildi.`); }
      await setState(chat, { reply_ticket: Number(arg) });
      return send(chat, `№${arg} uchun javobingizni yozing — u o'quvchiga bot orqali boradi. (/cancel — bekor qilish)`);
    }
    if (act === 'ok' || act === 'no') {
      if (!(await admins()).map(String).includes(String(q.from.id))) return send(chat, "Bu tugma faqat o'qituvchi uchun.");
      const r = await decide(Number(arg), act === 'ok', q.from.first_name || 'teacher');
      if (r.already) await send(chat, `Bu chek allaqachon: ${r.already === 'approved' ? 'tasdiqlangan' : 'rad etilgan'}.`);
      return;
    }
    const user = await db.one('SELECT * FROM users WHERE tg_chat_id = ?', [String(chat)]);
    if (!user) return send(chat, "Avval saytga kiring: Subscription → <b>Pay via Telegram</b> tugmasini bosing.");
    if (act === 'plans') return showPlans(chat, user);
    if (act === 'plan') return chooseMethod(chat, arg);
    if (act === 'card') return cardInfo(chat, arg);
    if (act === 'click') return sendInvoice(chat, user, arg);
    return;
  }
  const msg = u.message;
  if (!msg) return;
  const chat = msg.chat.id;
  if (msg.chat.type !== 'private') return;

  if (msg.successful_payment) {
    const sp = msg.successful_payment;
    const [, uid, planId] = String(sp.invoice_payload).split(':');
    const p = (await plans()).find((x) => x.id === planId);
    const dup = await db.one('SELECT 1 AS x FROM payments WHERE external_id = ?', [sp.telegram_payment_charge_id]);
    if (!p || dup) return;
    const until = await activate(Number(uid), { plan: p.id, days: p.days, amount: sp.total_amount / 100, currency: sp.currency, provider: 'telegram', external_id: sp.telegram_payment_charge_id, note: sp.provider_payment_charge_id || '' });
    await send(chat, `🎉 To'lov qabul qilindi! Obunangiz <b>${day(until)}</b> gacha faol. Omad! 💪`);
    const user = await db.one('SELECT name, email, login FROM users WHERE id = ?', [Number(uid)]);
    for (const a of await admins()) await send(a, `💳 Click/Payme to'lovi: <b>${esc(user?.name)}</b> — ${p.label}, ${money(p.amount, p.currency)}. Obuna avtomatik yoqildi.`);
    return;
  }

  const text = String(msg.text || '').trim();
  const st = await getState(chat);
  if (text === '/cancel') { await setState(chat, {}); return send(chat, 'Bekor qilindi.', { reply_markup: menuKeyboard() }); }
  if (text.startsWith('/admin')) {
    const code = text.split(/\s+/)[1] || '';
    if (code && code === (await getKey('_tg_admin_code'))) {
      const list = await admins();
      if (!list.map(String).includes(String(chat))) await setKey('_tg_admins', JSON.stringify([...list, String(chat)]));
      return send(chat, "✅ Siz o'qituvchi sifatida ulandingiz.\n\n• To'lov cheklari shu yerga keladi — ✅/❌ bilan tasdiqlaysiz.\n• O'quvchilarning savol, taklif va shikoyatlari ham keladi — xabarga <b>Reply</b> qilib yoki «Javob berish» tugmasi bilan javob yozasiz.");
    }
    return send(chat, "Kod noto'g'ri. Saytdagi Settings → Telegram bot bo'limidagi kodni yuboring: /admin KOD");
  }
  // ---- the teacher answers a student ----
  if (await isAdmin(chat)) {
    const replyTo = msg.reply_to_message?.message_id;
    const tid = replyTo ? await ticketByAdminMessage(chat, replyTo) : st.reply_ticket;
    if (tid && (text || msg.caption)) {
      await answer(ctx, Number(tid), text || msg.caption, msg.from?.first_name || 'Ustoz');
      await setState(chat, {});
      return send(chat, `✅ Javob №${tid} o'quvchiga yuborildi.`);
    }
  }
  if (text.startsWith('/start')) {
    const code = text.split(/\s+/)[1] || '';
    const uid = readCode(code);
    let user = null;
    if (uid) {
      user = await db.one('SELECT * FROM users WHERE id = ?', [uid]);
      if (user) {
        await db.run('UPDATE users SET tg_chat_id = NULL WHERE tg_chat_id = ? AND id <> ?', [String(chat), user.id]);
        await db.run('UPDATE users SET tg_chat_id = ? WHERE id = ?', [String(chat), user.id]);
      }
    } else {
      user = await db.one('SELECT * FROM users WHERE tg_chat_id = ?', [String(chat)]);
    }
    await setState(chat, {});
    if (!user) {
      const site = await getKey('_site_url');
      await send(chat, "👋 Assalomu alaykum! Bu <b>SAT Ustoz</b> boti.\n\nBu yerda obuna uchun to'lov qilasiz, ustozga savol berasiz, taklif yoki shikoyat yozasiz. Pastdagi menyudan tanlang.", { reply_markup: menuKeyboard() });
      if (code && !uid) return;
      return send(chat, "To'lov qilish uchun saytga kiring → <b>Subscription</b> → <b>Pay via Telegram</b> — bot hisobingizni o'zi taniydi.",
        site ? { reply_markup: { inline_keyboard: [[{ text: 'Saytni ochish', url: `${site}/subscribe` }]] } } : {});
    }
    await send(chat, `Menyu tayyor, ${esc(user.name.split(' ')[0])}. Savol, taklif yoki shikoyat bo'lsa — pastdagi tugmalardan foydalaning.`, { reply_markup: menuKeyboard() });
    return showPlans(chat, user);
  }
  // ---- menu buttons ----
  const linked = () => db.one('SELECT * FROM users WHERE tg_chat_id = ?', [String(chat)]);
  if (text === MENU.plans) {
    const user = await linked();
    if (user) return showPlans(chat, user);
    const site = await getKey('_site_url');
    return send(chat, "Obuna uchun saytga kiring → <b>Subscription</b> → <b>Pay via Telegram</b>. Bot hisobingizni taniydi va tariflarni ko'rsatadi.",
      site ? { reply_markup: { inline_keyboard: [[{ text: 'Saytni ochish', url: `${site}/subscribe` }]] } } : {});
  }
  if (text === MENU.mine) {
    const user = await linked();
    if (!user) return send(chat, "Hisobingiz hali ulanmagan: saytda Subscription → <b>Pay via Telegram</b> tugmasini bosing.");
    const last = await db.one("SELECT status, created_at FROM tg_requests WHERE user_id = ? ORDER BY id DESC LIMIT 1", [user.id]);
    return send(chat, [
      `👤 <b>${esc(user.name)}</b>`,
      subActive(user) ? `✅ Obuna faol: <b>${day(user.sub_until)}</b> gacha` : '⛔ Faol obuna yo\'q',
      last ? `Oxirgi chek: ${last.status === 'pending' ? 'tekshirilmoqda' : last.status === 'approved' ? 'tasdiqlangan' : 'rad etilgan'}` : '',
    ].filter(Boolean).join('\n'), { reply_markup: { inline_keyboard: [[{ text: subActive(user) ? 'Uzaytirish' : 'Obuna olish', callback_data: 'plans' }]] } });
  }
  const catByMenu = { [MENU.question]: 'question', [MENU.idea]: 'idea', [MENU.complaint]: 'complaint' }[text];
  if (catByMenu) {
    await setState(chat, { category: catByMenu });
    return send(chat, CATS[catByMenu].ask, { reply_markup: { inline_keyboard: [[{ text: 'Bekor qilish', callback_data: 'cancel' }]] } });
  }
  if (text === MENU.faq || text === '/help') {
    const faq = await getBlock('faq').catch(() => []);
    const body = (faq || []).slice(0, 10).map((f) => `<b>${esc(f.q)}</b>\n${esc(f.a)}`).join('\n\n') || "Hozircha savollar yo'q.";
    return send(chat, `❓ <b>Ko'p so'raladigan savollar</b>\n\n${body}\n\nJavob topilmadimi? «${MENU.question}» tugmasini bosing.`, { reply_markup: menuKeyboard() });
  }
  // ---- waiting for a support message ----
  if (st.category || st.ticket) return userMessage(ctx, chat, msg, st);
  // ---- a payment receipt ----
  if (msg.photo || msg.document) {
    const user = await linked();
    let wait = null;
    try { wait = JSON.parse((await getKey(`_tg_wait_${chat}`)) || 'null'); } catch {}
    if (user && wait) return receipt(chat, user, msg);
    return userMessage(ctx, chat, msg, { category: 'question' });
  }
  if (text.startsWith('/')) return send(chat, 'Pastdagi menyudan tanlang.', { reply_markup: menuKeyboard() });
  // any other text → a question to the teacher
  if (text) return userMessage(ctx, chat, msg, { category: 'question' });
}

export function registerBot(app, { h, bad, requireMaster, requireStudent }) {
  registerSupportWeb(app, { h, bad }, ctx); // website chat (public: signed-in students and guests)
  // Telegram → webhook (public; checked by the secret header Telegram sends)
  app.post('/api/telegram/webhook', h(async (req, res) => {
    const secret = await getKey('_tg_webhook_secret');
    if (!secret || req.headers['x-telegram-bot-api-secret-token'] !== secret) return res.status(401).end();
    try { await handle(req.body || {}); } catch (e) { console.error('[tg] update failed:', e.message); }
    res.json({ ok: true });
  }));
}

export function registerBotAdmin(app, { h, bad, requireMaster, requireStudent }) {
  registerSupportAdmin(app, { h, bad, requireMaster }, ctx);
  app.get('/api/telegram/link', requireStudent, h(async (req, res) => {
    const s = await getSettings();
    if (!s.telegram_bot || !(await getKey('_tg_token'))) return bad(res, 'The payment bot is not connected yet');
    res.json({ url: `https://t.me/${s.telegram_bot}?start=${startCode(req.user.id)}` });
  }));

  app.get('/api/telegram/status', requireMaster, h(async (req, res) => {
    const token = await getKey('_tg_token');
    let code = await getKey('_tg_admin_code');
    if (!code) { code = crypto.randomBytes(4).toString('hex'); await setKey('_tg_admin_code', code); }
    let webhook = null;
    if (token) { try { webhook = await tg('getWebhookInfo', {}, token); } catch (e) { webhook = { error: e.message }; } }
    const s = await getSettings();
    res.json({ connected: !!token, bot: s.telegram_bot, pay_token: !!(await getKey('_tg_pay_token')), admins: (await admins()).length, admin_code: code,
      webhook_ok: !!webhook?.url && !webhook?.last_error_message, webhook_error: webhook?.last_error_message || webhook?.error || '' });
  }));

  app.post('/api/telegram/connect', requireMaster, h(async (req, res) => {
    const token = String(req.body?.token || '').trim() || (await getKey('_tg_token'));
    if (!/^\d+:[\w-]{30,}$/.test(token)) return bad(res, 'This does not look like a bot token from @BotFather (123456:ABC…)');
    const me = await tg('getMe', {}, token);
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '');
    const proto = String(req.headers['x-forwarded-proto'] || (host.startsWith('localhost') ? 'http' : 'https')).split(',')[0];
    const site = `${proto}://${host}`;
    let secret = await getKey('_tg_webhook_secret');
    if (!secret) { secret = crypto.randomBytes(24).toString('hex'); await setKey('_tg_webhook_secret', secret); }
    if (proto !== 'https') return bad(res, 'Telegram needs an https address — connect the bot on the live site (sat-ustoz.vercel.app)');
    await tg('setWebhook', { url: `${site}/api/telegram/webhook`, secret_token: secret, allowed_updates: ['message', 'callback_query', 'pre_checkout_query'], drop_pending_updates: true }, token);
    await tg('setMyCommands', { commands: [{ command: 'start', description: 'Menyu' }, { command: 'help', description: "Ko'p so'raladigan savollar" }, { command: 'cancel', description: 'Bekor qilish' }] }, token).catch(() => {});
    await setKey('_tg_token', token);
    await setKey('_site_url', site);
    await db.run("INSERT INTO settings (key, value) VALUES ('telegram_bot', ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [me.username]);
    if ('pay_token' in (req.body || {})) await setKey('_tg_pay_token', String(req.body.pay_token || '').trim());
    res.json({ ok: true, bot: me.username });
  }));
  app.put('/api/telegram/pay-token', requireMaster, h(async (req, res) => {
    await setKey('_tg_pay_token', String(req.body?.pay_token || '').trim().slice(0, 200));
    res.json({ ok: true });
  }));
  app.post('/api/telegram/disconnect', requireMaster, h(async (req, res) => {
    const token = await getKey('_tg_token');
    if (token) await tg('deleteWebhook', {}, token).catch(() => {});
    await setKey('_tg_token', '');
    res.json({ ok: true });
  }));
  app.post('/api/telegram/admins/reset', requireMaster, h(async (req, res) => {
    await setKey('_tg_admins', '[]');
    await setKey('_tg_admin_code', crypto.randomBytes(4).toString('hex'));
    res.json({ ok: true });
  }));

  app.get('/api/telegram/requests', requireMaster, h(async (req, res) => {
    res.json(await db.all(`SELECT r.id, r.plan, r.days, r.amount, r.currency, r.method, r.status, r.created_at, r.decided_at, r.decided_by, r.file_kind,
      u.id AS user_id, u.name, u.email, u.login, u.sub_until FROM tg_requests r JOIN users u ON u.id = r.user_id
      ORDER BY (r.status = 'pending') DESC, r.created_at DESC LIMIT 50`));
  }));
  app.get('/api/telegram/requests/:id/file', requireMaster, h(async (req, res) => {
    const r = await db.one('SELECT file_id FROM tg_requests WHERE id = ?', [Number(req.params.id)]);
    if (!r?.file_id) return bad(res, 'Not found', 404);
    const f = await tg('getFile', { file_id: r.file_id });
    const token = await getKey('_tg_token');
    const img = await fetch(`https://api.telegram.org/file/bot${token}/${f.file_path}`);
    res.setHeader('Content-Type', img.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(Buffer.from(await img.arrayBuffer()));
  }));
  app.post('/api/telegram/requests/:id/:act', requireMaster, h(async (req, res) => {
    const ok = req.params.act === 'approve';
    if (!ok && req.params.act !== 'reject') return bad(res, 'Unknown action');
    res.json(await decide(Number(req.params.id), ok, req.user.name));
  }));
}
