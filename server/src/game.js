/**
 * Word Arena — a live vocabulary game (classic, team battle or 1-v-1 duel).
 * A host (teacher or student) opens a room with a 6-digit code; players join from any device with a
 * nickname and a character — no account needed. Everyone answers the same questions at their own pace;
 * correct answers score 100 + a streak bonus. Screens poll the room state every ~1.5 s (works on Vercel).
 *
 * Games are endless: questions keep coming (the chosen words come back mixed) until the host ends the game, a player
 * or team reaches the goal score, or the optional timer runs out. Every right answer opens three mystery boxes:
 * points, a jackpot, Double, Triple, Steal (10–25% from a player you pick), Swap (scores), Shield (blocks the next
 * attack on you) or Freeze (a player you pick waits 10 s). Cipher Raid adds the password Hack.
 * Question types: meaning → word, and fill the blank (when the word has an example sentence).
 */
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { db } from './db.js';
import { getSecret } from './auth.js';
import { gameWords } from './vocab.js';

const MODES = ['classic', 'team', 'duel'];
// epic and legendary characters come with a subscription (bots may still use them)
export const VIP_CHARACTERS = new Set(['lion', 'tiger', 'shark', 'axolotl', 'robot', 'dragon', 'unicorn']);
export const CHARACTERS = ['owl', 'fox', 'cat', 'bear', 'bunny', 'frog', 'penguin', 'chick', 'panda', 'koala', 'lion', 'tiger', 'redpanda', 'raccoon', 'hedgehog', 'monkey', 'octo', 'shark', 'whale', 'axolotl', 'robot', 'ghost', 'dragon', 'unicorn'];
const TEAMS = ['Blue', 'Sun'];

export async function migrateGame() {
  await db.exec(`
CREATE TABLE IF NOT EXISTS game_rooms (
  code TEXT PRIMARY KEY, host_user INTEGER REFERENCES users(id) ON DELETE SET NULL, host_token TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'classic', status TEXT NOT NULL DEFAULT 'lobby', minutes INTEGER NOT NULL DEFAULT 3,
  questions TEXT NOT NULL DEFAULT '[]', title TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), started_at TIMESTAMPTZ, ends_at TIMESTAMPTZ, finished_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS game_players (
  id SERIAL PRIMARY KEY, code TEXT NOT NULL REFERENCES game_rooms(code) ON DELETE CASCADE, token TEXT NOT NULL UNIQUE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, name TEXT NOT NULL, avatar TEXT NOT NULL DEFAULT 'owl', team TEXT NOT NULL DEFAULT '',
  score INTEGER NOT NULL DEFAULT 0, correct INTEGER NOT NULL DEFAULT 0, answered INTEGER NOT NULL DEFAULT 0, streak INTEGER NOT NULL DEFAULT 0, best_streak INTEGER NOT NULL DEFAULT 0,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(), seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_game_players ON game_players(code);
ALTER TABLE game_rooms ENABLE ROW LEVEL SECURITY; ALTER TABLE game_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_rooms ADD COLUMN IF NOT EXISTS quick BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE game_players ADD COLUMN IF NOT EXISTS is_bot BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE game_players ADD COLUMN IF NOT EXISTS bot_level REAL NOT NULL DEFAULT 0;
ALTER TABLE game_players ADD COLUMN IF NOT EXISTS bot_speed REAL NOT NULL DEFAULT 1;
ALTER TABLE game_rooms ADD COLUMN IF NOT EXISTS zone TEXT NOT NULL DEFAULT 'classic';
ALTER TABLE game_rooms ADD COLUMN IF NOT EXISTS raid BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE game_players ADD COLUMN IF NOT EXISTS pw TEXT NOT NULL DEFAULT '';
ALTER TABLE game_players ADD COLUMN IF NOT EXISTS pending TEXT NOT NULL DEFAULT '';
ALTER TABLE game_players ADD COLUMN IF NOT EXISTS hacks INTEGER NOT NULL DEFAULT 0;
ALTER TABLE game_players ADD COLUMN IF NOT EXISTS hacked INTEGER NOT NULL DEFAULT 0;
ALTER TABLE game_players ADD COLUMN IF NOT EXISTS stolen INTEGER NOT NULL DEFAULT 0;
ALTER TABLE game_players ADD COLUMN IF NOT EXISTS hit_by TEXT NOT NULL DEFAULT '';
ALTER TABLE game_players ADD COLUMN IF NOT EXISTS hit_amt INTEGER NOT NULL DEFAULT 0;
ALTER TABLE game_players ADD COLUMN IF NOT EXISTS hit_seq INTEGER NOT NULL DEFAULT 0;
ALTER TABLE game_rooms ADD COLUMN IF NOT EXISTS goal INTEGER NOT NULL DEFAULT 0;
ALTER TABLE game_rooms ADD COLUMN IF NOT EXISTS pool TEXT NOT NULL DEFAULT '';
ALTER TABLE game_players ADD COLUMN IF NOT EXISTS shield BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE game_players ADD COLUMN IF NOT EXISTS frozen_until TIMESTAMPTZ;
ALTER TABLE game_players ADD COLUMN IF NOT EXISTS hit_kind TEXT NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS game_events (id SERIAL PRIMARY KEY, code TEXT NOT NULL REFERENCES game_rooms(code) ON DELETE CASCADE, text TEXT NOT NULL, at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS idx_game_events ON game_events(code, id);
ALTER TABLE game_events ENABLE ROW LEVEL SECURITY;
`);
}

// ---------- Cipher Raid: pick a password, open mystery boxes, hack other players' credits ----------
const PW_A = ['swift', 'brave', 'lucky', 'mighty', 'silent', 'cosmic', 'wild', 'sunny', 'frosty', 'turbo', 'magic', 'rapid', 'clever', 'shiny', 'stormy', 'jolly'];
const PW_B = ['fox', 'owl', 'tiger', 'comet', 'rocket', 'panda', 'wizard', 'falcon', 'dragon', 'pixel', 'ninja', 'koala', 'robot', 'shark', 'otter', 'lion'];
const genPw = () => `${PW_A[crypto.randomInt(PW_A.length)]}-${PW_B[crypto.randomInt(PW_B.length)]}-${crypto.randomInt(10, 100)}`;
const genPwList = (n) => { const s = new Set(); while (s.size < n) s.add(genPw()); return [...s]; };
/** The real password plus two decoys: one shares its first letter, one does not. */
function pwOptions(real) {
  const out = new Set([real]);
  for (let i = 0; i < 200 && out.size < 2; i++) { const d = genPw(); if (d[0] === real[0] && !out.has(d)) out.add(d); }
  for (let i = 0; i < 200 && out.size < 3; i++) { const d = genPw(); if (d[0] !== real[0] && !out.has(d)) out.add(d); }
  while (out.size < 3) out.add(genPw());
  return shuffle([...out]);
}
/** Share of the victim's credits that a hacker takes: found fast 50-60%, slow 20-50%. */
export function hackShare(seconds) {
  if (seconds <= 6) return 0.6 - 0.1 * (seconds / 6);
  if (seconds <= 20) return 0.5 - 0.3 * ((seconds - 6) / 14);
  return 0.2;
}
/** Three mystery boxes after a right answer. Weights out of 100 (Cipher Raid swaps part of them for Hack). */
const BOX_WEIGHTS = [['bonus', 30], ['jackpot', 6], ['double', 11], ['triple', 4], ['steal', 15], ['swap', 6], ['shield', 12], ['freeze', 16]];
const RAID_WEIGHTS = [['hack', 30], ['bonus', 22], ['jackpot', 5], ['double', 8], ['triple', 3], ['steal', 8], ['swap', 4], ['shield', 10], ['freeze', 10]];
function rollBoxes(raid) {
  const W = raid ? RAID_WEIGHTS : BOX_WEIGHTS;
  const total = W.reduce((s, [, w]) => s + w, 0);
  return Array.from({ length: 3 }, () => {
    let r = crypto.randomInt(total);
    for (const [t, w] of W) {
      if (r < w) return t === 'bonus' ? { t, amt: 50 + 10 * crypto.randomInt(0, 11) } : t === 'jackpot' ? { t, amt: 300 } : t === 'steal' ? { t, pct: 10 + crypto.randomInt(0, 16) } : { t };
      r -= w;
    }
    return { t: 'bonus', amt: 100 };
  });
}
const TARGETED = new Set(['steal', 'swap', 'freeze']);
const FREEZE_MS = 10000;
const logEvent = (code, text) => db.run('INSERT INTO game_events (code, text) VALUES (?, ?)', [code, String(text).slice(0, 160)]).catch(() => {});
const parse = (s) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };

/** What a raid player may see of their pending box / hack step (never the real password). */
function raidView(me) {
  const pend = parse(me.pending);
  const out = { hacks: me.hacks, hacked: me.hacked, stolen: me.stolen, hit: me.hit_seq ? { seq: me.hit_seq, by: me.hit_by, amt: me.hit_amt, kind: me.hit_kind || 'hack' } : null, stage: null };
  if (pend?.boxes) out.stage = 'boxes';
  else if (pend?.target) Object.assign(out, { stage: 'target', target: { kind: pend.target.kind, pct: pend.target.pct } });
  else if (pend?.hack) Object.assign(out, { stage: 'hack', victim: pend.hack.victim, options: pend.hack.options, hint: pend.hack.hint });
  return out;
}

const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const blankOut = (sentence, word) => {
  const stem = word.toLowerCase().replace(/(e|ed|ing|s|es|ly)$/, '');
  const re = new RegExp(`\\b(${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}|${stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\w*)\\b`, 'i');
  return re.test(sentence) && stem.length >= 3 ? sentence.replace(re, '______') : null;
};

/** Question types: meaning → word, and fill the blank when the word has an example sentence. Endless: the pool is
 * reshuffled as often as needed, so `count` can be larger than the pool. */
function buildQuestions(pool, count) {
  const qs = [];
  let picks = [];
  while (picks.length < count && pool.length) picks = picks.concat(shuffle([...pool]));
  picks = picks.slice(0, count);
  picks.forEach((w, i) => {
    const others = shuffle(pool.filter((x) => x.id !== w.id && x.word !== w.word)).slice(0, 3);
    if (others.length < 3) return;
    const blank = w.example ? blankOut(w.example, w.word) : null;
    const kind = blank && i % 2 === 1 ? 'blank' : 'word';
    let prompt; let opts;
    if (kind === 'meaning') { prompt = w.word; opts = [w, ...others].map((x) => x.definition); }
    else if (kind === 'word') { prompt = w.definition; opts = [w, ...others].map((x) => x.word); }
    else { prompt = blank; opts = [w, ...others].map((x) => x.word); }
    const order = shuffle([0, 1, 2, 3]);
    qs.push({ kind, prompt, uz: kind === 'meaning' ? '' : w.uz, options: order.map((k) => opts[k]), answer: order.indexOf(0), word: w.word });
  });
  return qs;
}

async function newCode() {
  for (let i = 0; i < 20; i++) {
    const code = String(crypto.randomInt(100000, 1000000));
    if (!(await db.one('SELECT 1 AS x FROM game_rooms WHERE code = ?', [code]))) return code;
  }
  throw new Error('Could not create a room code');
}
const tokenUser = (req) => {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return null;
  try { return jwt.verify(h.slice(7), getSecret()); } catch { return null; }
};
const cleanName = (s) => String(s || '').replace(/[<>]/g, '').trim().slice(0, 18);

/** Games never run out of questions: when someone gets close to the end, 30 more are added from the room's words. */
async function ensureQuestions(room, need) {
  const qs = JSON.parse(room.questions);
  if (need < qs.length - 3) return room;
  const pool = parse(room.pool) || [];
  if (pool.length < 4) return room;
  const more = JSON.stringify(qs.concat(buildQuestions(pool, 30)));
  const r = await db.one('UPDATE game_rooms SET questions = ? WHERE code = ? AND questions = ? RETURNING *', [more, room.code, room.questions]);
  return r || (await db.one('SELECT * FROM game_rooms WHERE code = ?', [room.code]));
}

/** The game ends when the host ends it, the optional timer runs out, or a player / team reaches the goal score. */
async function finishIfDone(room) {
  if (room.status !== 'playing') return room;
  const timeUp = room.ends_at && new Date(room.ends_at) <= new Date();
  let goal = false;
  if (room.goal > 0) {
    const top = room.mode === 'team'
      ? await db.one('SELECT COALESCE(MAX(s), 0) AS top FROM (SELECT SUM(score) AS s FROM game_players WHERE code = ? GROUP BY team) x', [room.code])
      : await db.one('SELECT COALESCE(MAX(score), 0) AS top FROM game_players WHERE code = ?', [room.code]);
    goal = Number(top.top) >= room.goal;
  }
  if (timeUp || goal) {
    await db.run("UPDATE game_rooms SET status = 'finished', finished_at = now() WHERE code = ? AND status = 'playing'", [room.code]);
    return { ...room, status: 'finished' };
  }
  return room;
}

// ---------- bots: answer at a human pace, right about `bot_level` of the time ----------
const BOT_NAMES = ['Lexi', 'Wordy', 'Nova', 'Quill', 'Echo', 'Pixel', 'Sage', 'Zippy', 'Mochi', 'Rio', 'Juno', 'Kiwi', 'Taro', 'Blip'];
// accuracy and seconds per question (min + random spread)
export const BOT_LEVELS = {
  easy: { acc: 0.45, base: 6, spread: 5 },
  medium: { acc: 0.68, base: 4.5, spread: 3.5 },
  hard: { acc: 0.85, base: 3, spread: 2.5 },
  insane: { acc: 0.97, base: 1.6, spread: 1.4 },
};
export const ZONES = ['classic', 'race', 'space', 'ocean', 'jungle'];
const FREE_BOT = 'easy';
const rnd = (seed) => { const x = Math.sin(seed * 9301 + 49297) * 233280; return x - Math.floor(x); }; // stable 0..1
async function runBots(room) {
  if (room.status !== 'playing' || !room.started_at) return;
  const bots = await db.all('SELECT * FROM game_players WHERE code = ? AND is_bot', [room.code]);
  if (!bots.length) return;
  const elapsed = (Date.now() - new Date(room.started_at).getTime()) / 1000;
  for (const b of bots) {
    let t = 0; let target = 0;
    const L = BOT_LEVELS[Object.keys(BOT_LEVELS).find((k) => BOT_LEVELS[k].base === b.bot_speed) || 'medium'];
    for (let i = 0; i < 5000; i++) { t += L.base + rnd(b.id * 101 + i) * L.spread; if (t <= elapsed) target = i + 1; else break; }
    if (b.frozen_until && new Date(b.frozen_until) > new Date()) continue;
    let { answered, streak, score, correct, best_streak: best } = b;
    while (answered < target) {
      const ok = rnd(b.id * 7919 + answered * 31) < b.bot_level;
      streak = ok ? streak + 1 : 0;
      score += ok ? 100 + Math.min(streak - 1, 5) * 20 : 0;
      // bots open boxes too, but only the friendly ones (points and the odd Double)
      if (ok) { const r = rnd(b.id * 13 + answered * 17); score = r < 0.06 ? score * 2 : score + 50 + Math.floor(r * 100); }
      correct += ok ? 1 : 0; best = Math.max(best, streak); answered += 1;
    }
    if (answered !== b.answered) {
      await db.run('UPDATE game_players SET answered = ?, correct = ?, score = ?, streak = ?, best_streak = ?, seen_at = now() WHERE id = ? AND answered = ?',
        [answered, correct, score, streak, best, b.id, b.answered]);
    }
  }
}
async function addBot(room, avoid, level = 'medium') {
  const L = BOT_LEVELS[level] || BOT_LEVELS.medium;
  const taken = new Set((await db.all('SELECT name, avatar FROM game_players WHERE code = ?', [room.code])).flatMap((p) => [p.name, p.avatar]));
  const free = BOT_NAMES.filter((n) => !taken.has(`${n} (bot)`));
  const name = `${(free.length ? free : BOT_NAMES)[crypto.randomInt((free.length ? free : BOT_NAMES).length)]} (bot)`;
  const avatar = shuffle(CHARACTERS.filter((c) => c !== avoid && !taken.has(c)))[0] || CHARACTERS[0];
  let team = '';
  if (room.mode === 'team') {
    const ps = await db.all('SELECT team FROM game_players WHERE code = ?', [room.code]);
    team = ps.filter((p) => p.team === TEAMS[0]).length <= ps.filter((p) => p.team === TEAMS[1]).length ? TEAMS[0] : TEAMS[1];
  }
  await db.run('INSERT INTO game_players (code, token, name, avatar, team, is_bot, bot_level, bot_speed, pw) VALUES (?,?,?,?,?, true, ?, ?, ?)',
    [room.code, 'bot-' + crypto.randomBytes(12).toString('hex'), name, avatar, team, L.acc, L.base, genPw()]);
}
// no timer when minutes = 0 (the default): the host ends the game or the goal score does
const startRoom = (code) => db.run("UPDATE game_rooms SET status = 'playing', started_at = now(), ends_at = CASE WHEN minutes > 0 THEN now() + (minutes || ' minutes')::interval ELSE NULL END WHERE code = ? AND status = 'lobby'", [code]);

export function registerGame(app, { h, bad, accessFor }) {
  // VIP = an active subscription (the teacher always): themed zones and stronger bots
  const isVip = async (uid) => {
    if (!uid) return false;
    const u = await db.one('SELECT * FROM users WHERE id = ?', [uid]);
    return !!u && (u.role === 'master' || !!(await accessFor(u)).sub_active || !(await accessFor(u)).subscription_required);
  };
  const vipError = (res) => bad(res, 'Themed zones and Medium, Hard and Insane bots are part of the VIP plan', 402, { code: 'vip_required' });
  // quick duel: join someone who is waiting, or open a room and wait (a bot can join after a while)
  app.post('/api/game/quick', h(async (req, res) => {
    const me = tokenUser(req);
    if (!me) return bad(res, 'Please sign in to play a duel', 401);
    const name = cleanName(req.body?.name) || 'Player';
    let avatar = CHARACTERS.includes(req.body?.avatar) ? req.body.avatar : 'owl';
    if (VIP_CHARACTERS.has(avatar) && !(await isVip(me.id))) avatar = 'owl';
    const zone = ZONES.includes(req.body?.zone) ? req.body.zone : 'classic';
    if (zone !== 'classic' && !(await isVip(me.id))) return vipError(res);
    const vsBot = req.body?.opponent === 'bot';
    const level = BOT_LEVELS[req.body?.level] ? req.body.level : FREE_BOT;
    if (vsBot && level !== FREE_BOT && !(await isVip(me.id))) return vipError(res);
    await db.run("UPDATE game_rooms SET status = 'finished', finished_at = now() WHERE quick AND status = 'lobby' AND created_at < now() - interval '3 minutes'");
    const waiting = await db.all(`SELECT r.code FROM game_rooms r WHERE r.quick AND r.status = 'lobby' AND r.mode = 'duel' AND (r.host_user IS NULL OR r.host_user <> ?)
      AND (SELECT COUNT(*) FROM game_players p WHERE p.code = r.code) = 1
      AND (SELECT MAX(p.seen_at) FROM game_players p WHERE p.code = r.code) > now() - interval '8 seconds'
      ORDER BY r.created_at LIMIT 3`, [me.id]);
    for (const w of vsBot ? [] : waiting) {
      const token = crypto.randomBytes(18).toString('hex');
      const other = await db.one('SELECT name FROM game_players WHERE code = ?', [w.code]);
      const nick = other && other.name.toLowerCase() === name.toLowerCase() ? `${name} 2` : name;
      try {
        await db.run('INSERT INTO game_players (code, token, user_id, name, avatar) VALUES (?,?,?,?,?)', [w.code, token, me.id, nick, avatar]);
        const { n } = await db.one('SELECT COUNT(*) AS n FROM game_players WHERE code = ?', [w.code]);
        if (Number(n) !== 2) { await db.run('DELETE FROM game_players WHERE token = ?', [token]); continue; } // someone was faster
        await startRoom(w.code);
        return res.json({ code: w.code, token, matched: true });
      } catch { /* try the next room */ }
    }
    const setIds = (Array.isArray(req.body?.set_ids) ? req.body.set_ids : []).map(Number).filter(Boolean).slice(0, 20);
    const pool = await gameWords(setIds, 60);
    if (pool.length < 4) return bad(res, 'Not enough words for a duel yet');
    const code = await newCode();
    const host_token = crypto.randomBytes(18).toString('hex');
    const token = crypto.randomBytes(18).toString('hex');
    await db.run("INSERT INTO game_rooms (code, host_user, host_token, mode, minutes, questions, title, quick, zone, pool) VALUES (?,?,?, 'duel', 2, ?, 'Quick duel', true, ?, ?)",
      [code, me.id, host_token, JSON.stringify(buildQuestions(pool, 20)), zone, JSON.stringify(pool)]);
    await db.run('INSERT INTO game_players (code, token, user_id, name, avatar) VALUES (?,?,?,?,?)', [code, token, me.id, name, avatar]);
    if (vsBot) {
      // straight into a duel with the chosen bot
      await addBot(await db.one('SELECT * FROM game_rooms WHERE code = ?', [code]), avatar, level);
      await startRoom(code);
    }
    res.json({ code, token, host_token, matched: vsBot });
  }));

  // no opponent came: the host adds a bot and the duel starts
  app.post('/api/game/:code/bot', h(async (req, res) => {
    const room = await db.one('SELECT * FROM game_rooms WHERE code = ?', [String(req.params.code)]);
    if (!room || req.body?.host_token !== room.host_token) return bad(res, 'Only the host can call a bot', 403);
    if (room.status !== 'lobby') return bad(res, 'The game has already started', 409);
    const level = BOT_LEVELS[req.body?.level] ? req.body.level : FREE_BOT;
    if (level !== FREE_BOT && !(await isVip(room.host_user))) return vipError(res);
    const players = await db.all('SELECT avatar, is_bot FROM game_players WHERE code = ?', [room.code]);
    if (room.mode === 'duel' && players.length >= 2) return bad(res, 'This duel already has two players', 409);
    if (players.filter((p) => p.is_bot).length >= 8) return bad(res, 'Up to 8 bots per game');
    await addBot(room, players[0]?.avatar, level);
    if (room.mode === 'duel') await startRoom(room.code);
    res.json({ ok: true });
  }));

  // create a room (signed-in teacher or student)
  app.post('/api/game/rooms', h(async (req, res) => {
    const me = tokenUser(req);
    if (!me) return bad(res, 'Please sign in to host a game', 401);
    const mode = MODES.includes(req.body?.mode) ? req.body.mode : 'classic';
    const count = 30; // first batch; more are added while the game runs
    const minutes = Math.min(120, Math.max(0, Math.round(Number(req.body?.minutes)) || 0)); // 0 = no timer
    const goal = Math.min(1000000, Math.max(0, Math.round(Number(req.body?.goal)) || 0)); // 0 = no goal
    const setIds = (Array.isArray(req.body?.set_ids) ? req.body.set_ids : []).map(Number).filter(Boolean).slice(0, 20);
    const zone = ZONES.includes(req.body?.zone) ? req.body.zone : 'classic';
    const botLevel = BOT_LEVELS[req.body?.bot_level] ? req.body.bot_level : FREE_BOT;
    const bots = Math.min(mode === 'duel' ? 1 : 8, Math.max(0, Number(req.body?.bots) || 0));
    if ((zone !== 'classic' || (bots && botLevel !== FREE_BOT)) && !(await isVip(me.id))) return vipError(res);
    const pool = await gameWords(setIds, 400);
    if (pool.length < 4) return bad(res, 'Not enough words in the chosen sets');
    const questions = buildQuestions(pool, count);
    await db.run("DELETE FROM game_rooms WHERE created_at < now() - interval '2 days'");
    const code = await newCode();
    const host_token = crypto.randomBytes(18).toString('hex');
    await db.run('INSERT INTO game_rooms (code, host_user, host_token, mode, minutes, questions, title, zone, raid, goal, pool) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      [code, me.id, host_token, mode, minutes, JSON.stringify(questions), String(req.body?.title || '').slice(0, 60), zone, !!req.body?.raid, goal, JSON.stringify(pool)]);
    const room = await db.one('SELECT * FROM game_rooms WHERE code = ?', [code]);
    for (let i = 0; i < bots; i++) await addBot(room, null, botLevel);
    res.json({ code, host_token, mode, minutes, goal, raid: !!req.body?.raid });
  }));

  // join with a nickname and a character
  app.post('/api/game/:code/join', h(async (req, res) => {
    const room = await db.one('SELECT * FROM game_rooms WHERE code = ?', [String(req.params.code)]);
    if (!room) return bad(res, 'No game with this code', 404);
    if (room.status === 'finished') return bad(res, 'This game has already finished', 409);
    const name = cleanName(req.body?.name);
    if (name.length < 2) return bad(res, 'Choose a nickname (2+ letters)');
    let avatar = CHARACTERS.includes(req.body?.avatar) ? req.body.avatar : CHARACTERS[0];
    const players = await db.all('SELECT name, team FROM game_players WHERE code = ?', [room.code]);
    if (room.mode === 'duel' && players.length >= 2) return bad(res, 'This duel already has two players', 409);
    if (players.length >= 60) return bad(res, 'The room is full', 409);
    if (players.some((p) => p.name.toLowerCase() === name.toLowerCase())) return bad(res, 'This nickname is taken in this room', 409);
    let team = '';
    if (room.mode === 'team') { const a = players.filter((p) => p.team === TEAMS[0]).length; const b = players.filter((p) => p.team === TEAMS[1]).length; team = a <= b ? TEAMS[0] : TEAMS[1]; }
    const token = crypto.randomBytes(18).toString('hex');
    const me = tokenUser(req);
    if (VIP_CHARACTERS.has(avatar) && !(me && (await isVip(me.id)))) avatar = 'owl';
    const pw = String(req.body?.pw || '').replace(/[^a-z0-9-]/gi, '').slice(0, 24) || genPw();
    await db.run('INSERT INTO game_players (code, token, user_id, name, avatar, team, pw) VALUES (?,?,?,?,?,?,?)', [room.code, token, me?.id || null, name, avatar, team, pw]);
    res.json({ token, team });
  }));

  // room state for players, the host and projector screens
  app.get('/api/game/:code', h(async (req, res) => {
    let room = await db.one('SELECT * FROM game_rooms WHERE code = ?', [String(req.params.code)]);
    if (!room) return bad(res, 'No game with this code', 404);
    await runBots(room);
    room = await finishIfDone(room);
    const token = String(req.query.token || '');
    if (room.status === 'playing') {
      const most = await db.one('SELECT COALESCE(MAX(answered), 0) AS m FROM game_players WHERE code = ?', [room.code]);
      room = await ensureQuestions(room, Number(most.m) + 5);
    }
    const isHost = token && token === room.host_token;
    if (token && !isHost) await db.run('UPDATE game_players SET seen_at = now() WHERE token = ?', [token]);
    const players = await db.all('SELECT id, token, name, avatar, team, score, correct, answered, streak, best_streak, is_bot, hacks, hacked, stolen, pw, pending, hit_by, hit_amt, hit_seq, hit_kind, shield, frozen_until FROM game_players WHERE code = ? ORDER BY score DESC, correct DESC, joined_at', [room.code]);
    const questions = JSON.parse(room.questions);
    const me = players.find((p) => p.token === token);
    const teams = room.mode === 'team' ? TEAMS.map((t) => { const ps = players.filter((p) => p.team === t); return { name: t, score: ps.reduce((s, p) => s + p.score, 0), players: ps.length }; }) : [];
    res.json({
      code: room.code, mode: room.mode, raid: !!room.raid, quick: !!room.quick, zone: room.zone || 'classic', status: room.status, minutes: room.minutes, title: room.title, total: questions.length,
      goal: room.goal || 0, timer: room.minutes > 0,
      seconds_left: room.minutes > 0 ? (room.ends_at ? Math.max(0, Math.round((new Date(room.ends_at) - Date.now()) / 1000)) : room.minutes * 60) : null,
      host: isHost, players: players.map(({ token: _t, pw: _w, pending: _p, hit_by: _b, hit_amt: _a, hit_seq: _s, hit_kind: _k, frozen_until: fz, ...p }) => ({ ...p, frozen: !!fz && new Date(fz) > new Date(), me: p.id === me?.id })), teams,
      me: me ? { id: me.id, name: me.name, avatar: me.avatar, team: me.team, score: me.score, answered: me.answered, correct: me.correct, streak: me.streak, shield: me.shield,
        frozen_ms: me.frozen_until ? Math.max(0, new Date(me.frozen_until) - Date.now()) : 0, pw: room.raid ? me.pw : undefined, raid: raidView(me) } : null,
      // what happened in the game (host screen)
      feed: isHost ? (await db.all('SELECT id, text, at FROM game_events WHERE code = ? ORDER BY id DESC LIMIT 8', [room.code])) : undefined,
      // questions go to players only while the game runs; answers are never included
      questions: me && room.status === 'playing' ? questions.map((q) => ({ kind: q.kind, prompt: q.prompt, uz: q.uz, options: q.options })) : undefined,
      review: room.status === 'finished' ? questions.slice(0, Math.max(...players.map((x) => x.answered), 0)).map((q) => ({ kind: q.kind, prompt: q.prompt, answer: q.options[q.answer], word: q.word })) : undefined,
    });
  }));

  app.post('/api/game/:code/bot/remove', h(async (req, res) => {
    const room = await db.one('SELECT * FROM game_rooms WHERE code = ?', [String(req.params.code)]);
    if (!room || req.body?.host_token !== room.host_token) return bad(res, 'Only the host can remove bots', 403);
    await db.run("DELETE FROM game_players WHERE code = ? AND id = ? AND is_bot AND ? = 'lobby'", [room.code, Number(req.body?.id), room.status]);
    res.json({ ok: true });
  }));

  app.post('/api/game/:code/start', h(async (req, res) => {
    const room = await db.one('SELECT * FROM game_rooms WHERE code = ?', [String(req.params.code)]);
    if (!room || req.body?.host_token !== room.host_token) return bad(res, 'Only the host can start', 403);
    const { n } = await db.one('SELECT COUNT(*) AS n FROM game_players WHERE code = ?', [room.code]);
    if (Number(n) < (room.mode === 'classic' ? 1 : 2)) return bad(res, room.mode === 'duel' ? 'A duel needs two players' : 'Wait for at least two players');
    await startRoom(room.code);
    res.json({ ok: true });
  }));

  app.post('/api/game/:code/end', h(async (req, res) => {
    const room = await db.one('SELECT * FROM game_rooms WHERE code = ?', [String(req.params.code)]);
    if (!room || req.body?.host_token !== room.host_token) return bad(res, 'Only the host can end the game', 403);
    await db.run("UPDATE game_rooms SET status = 'finished', finished_at = now() WHERE code = ?", [room.code]);
    res.json({ ok: true });
  }));

  // answer the player's current question (questions go in order; each is answered once)
  app.post('/api/game/:code/answer', h(async (req, res) => {
    let room = await db.one('SELECT * FROM game_rooms WHERE code = ?', [String(req.params.code)]);
    if (!room) return bad(res, 'No game with this code', 404);
    await runBots(room);
    room = await finishIfDone(room);
    if (room.status !== 'playing') return bad(res, 'The game is not running', 409);
    const p = await db.one('SELECT * FROM game_players WHERE code = ? AND token = ?', [room.code, String(req.body?.token || '')]);
    if (!p) return bad(res, 'Join the game first', 403);
    if (p.frozen_until && new Date(p.frozen_until) > new Date()) return bad(res, 'You are frozen for a moment', 423, { code: 'frozen', ms: new Date(p.frozen_until) - Date.now() });
    room = await ensureQuestions(room, p.answered + 1);
    const questions = JSON.parse(room.questions);
    const qi = Number(req.body?.qi);
    if (qi !== p.answered || qi >= questions.length) return bad(res, 'This question was already answered', 409);
    const q = questions[qi];
    const correct = Number(req.body?.choice) === q.answer;
    const streak = correct ? p.streak + 1 : 0;
    const gain = correct ? 100 + Math.min(p.streak, 5) * 20 : 0;
    await db.run('UPDATE game_players SET answered = answered + 1, correct = correct + ?, score = score + ?, streak = ?, best_streak = GREATEST(best_streak, ?), seen_at = now() WHERE id = ? AND answered = ?',
      [correct ? 1 : 0, gain, streak, streak, p.id, qi]);
    // every right answer opens three mystery boxes (all modes)
    const boxes = correct ? rollBoxes(room.raid) : null;
    await db.run('UPDATE game_players SET pending = ? WHERE id = ?', [boxes ? JSON.stringify({ boxes }) : '', p.id]);
    await finishIfDone(room);
    res.json({ correct, answer: q.answer, gain, score: p.score + gain, streak, done: false, raid: boxes ? { stage: 'boxes' } : null });
  }));

  // Cipher Raid: five random passwords to pick from when joining
  app.get('/api/game/:code/passwords', h(async (req, res) => { res.json({ passwords: genPwList(5) }); }));

  // open one of the three boxes: credits, a jackpot or a hack
  app.post('/api/game/:code/box', h(async (req, res) => {
    const room = await db.one('SELECT * FROM game_rooms WHERE code = ?', [String(req.params.code)]);
    if (!room || room.status !== 'playing') return bad(res, 'The game is not running', 409);
    const p = await db.one('SELECT * FROM game_players WHERE code = ? AND token = ?', [room.code, String(req.body?.token || '')]);
    if (!p) return bad(res, 'Join the game first', 403);
    const pend = parse(p.pending);
    const box = pend?.boxes?.[Number(req.body?.i)];
    if (!box) return bad(res, 'No box to open', 409);
    const claim = await db.run("UPDATE game_players SET pending = '' WHERE id = ? AND pending = ?", [p.id, p.pending]);
    if (!claim.rowCount) return bad(res, 'Box already opened', 409);
    const others = await db.all('SELECT id, name, avatar, team, score, pw FROM game_players WHERE code = ? AND id <> ?', [room.code, p.id]);
    const opp = others.filter((o) => (room.mode === 'team' ? o.team !== p.team : true));
    const pool = opp.filter((o) => o.score > 0); // worth hacking or stealing from
    let kind = box.t;
    if (kind === 'hack' && !pool.length) kind = 'bonus';
    const targets = kind === 'steal' ? pool : opp;
    if (TARGETED.has(kind) && !targets.length) kind = 'bonus';
    const all = pend.boxes.map((b, i) => (i === Number(req.body.i) ? { ...b, t: kind, amt: kind === 'bonus' && !b.amt ? 100 : b.amt } : b));
    const view = all.map((b) => b.t);
    if (TARGETED.has(kind)) {
      // the player picks who: steal / swap / freeze
      await db.run('UPDATE game_players SET pending = ? WHERE id = ?', [JSON.stringify({ target: { kind, pct: box.pct || 15 } }), p.id]);
      return res.json({ kind, pct: box.pct || 15, boxes: view, targets: targets.map((o) => ({ id: o.id, name: o.name, avatar: o.avatar, score: o.score })) });
    }
    if (kind === 'double' || kind === 'triple') {
      const gain = p.score * (kind === 'double' ? 1 : 2);
      await db.run('UPDATE game_players SET score = score + ? WHERE id = ?', [gain, p.id]);
      if (gain >= 200) logEvent(room.code, `${p.name} got ${kind === 'double' ? 'DOUBLE' : 'TRIPLE'}: ${p.score} → ${p.score + gain}`);
      await finishIfDone(room);
      return res.json({ kind, amt: gain, score: p.score + gain, boxes: view });
    }
    if (kind === 'shield') {
      await db.run('UPDATE game_players SET shield = true WHERE id = ?', [p.id]);
      return res.json({ kind, amt: 0, score: p.score, boxes: view });
    }
    if (kind === 'hack') {
      const v = pool[crypto.randomInt(pool.length)];
      const options = pwOptions(v.pw || genPw());
      const hack = { victim_id: v.id, victim: { name: v.name, avatar: v.avatar }, options, hint: (v.pw || '?')[0], t: Date.now() };
      await db.run('UPDATE game_players SET pending = ? WHERE id = ?', [JSON.stringify({ hack }), p.id]);
      return res.json({ kind: 'hack', victim: hack.victim, options, hint: hack.hint, boxes: all.map((b) => b.t) });
    }
    const amt = box.t === 'hack' || TARGETED.has(box.t) ? 100 : box.amt || 100;
    await db.run('UPDATE game_players SET score = score + ? WHERE id = ?', [amt, p.id]);
    if (kind === 'jackpot') logEvent(room.code, `${p.name} hit the JACKPOT (+${amt})`);
    await finishIfDone(room);
    res.json({ kind, amt, score: p.score + amt, boxes: view });
  }));

  // steal / swap / freeze: the player picked who
  app.post('/api/game/:code/target', h(async (req, res) => {
    const room = await db.one('SELECT * FROM game_rooms WHERE code = ?', [String(req.params.code)]);
    if (!room || room.status !== 'playing') return bad(res, 'The game is not running', 409);
    const p = await db.one('SELECT * FROM game_players WHERE code = ? AND token = ?', [room.code, String(req.body?.token || '')]);
    if (!p) return bad(res, 'Join the game first', 403);
    const t = parse(p.pending)?.target;
    if (!t) return bad(res, 'Nothing to use', 409);
    const v = await db.one('SELECT * FROM game_players WHERE id = ? AND code = ? AND id <> ?', [Number(req.body?.id), room.code, p.id]);
    if (!v || (room.mode === 'team' && v.team === p.team)) return bad(res, 'Pick another player');
    const claim = await db.run("UPDATE game_players SET pending = '' WHERE id = ? AND pending = ?", [p.id, p.pending]);
    if (!claim.rowCount) return bad(res, 'Already done', 409);
    const victim = { name: v.name, avatar: v.avatar };
    const hit = (kind, amt) => db.run('UPDATE game_players SET hit_by = ?, hit_amt = ?, hit_kind = ?, hit_seq = hit_seq + 1 WHERE id = ?', [p.name, amt, kind, v.id]);
    // a shield blocks one attack
    const blocked = await db.one('UPDATE game_players SET shield = false WHERE id = ? AND shield RETURNING id', [v.id]);
    if (blocked) {
      await hit('blocked', 0);
      logEvent(room.code, `${v.name}'s shield blocked ${p.name}'s ${t.kind}`);
      return res.json({ kind: t.kind, blocked: true, victim, score: p.score });
    }
    if (t.kind === 'steal') {
      const amt = Math.min(v.score, Math.floor((v.score * t.pct) / 100));
      if (amt > 0) {
        await db.run('UPDATE game_players SET score = GREATEST(score - ?, 0), hacked = hacked + 1 WHERE id = ?', [amt, v.id]);
        await db.run('UPDATE game_players SET score = score + ?, stolen = stolen + ? WHERE id = ?', [amt, amt, p.id]);
        await hit('steal', amt);
        logEvent(room.code, `${p.name} stole ${amt} from ${v.name}`);
      }
      await finishIfDone(room);
      return res.json({ kind: 'steal', amt, pct: t.pct, victim, score: p.score + amt });
    }
    if (t.kind === 'swap') {
      await db.run('UPDATE game_players SET score = CASE WHEN id = ?::int THEN ?::int ELSE ?::int END WHERE id IN (?, ?)', [p.id, v.score, p.score, p.id, v.id]);
      await hit('swap', p.score);
      logEvent(room.code, `${p.name} swapped scores with ${v.name} (${p.score} ↔ ${v.score})`);
      await finishIfDone(room);
      return res.json({ kind: 'swap', amt: v.score - p.score, victim, score: v.score });
    }
    // freeze
    await db.run(`UPDATE game_players SET frozen_until = now() + interval '${FREEZE_MS / 1000} seconds' WHERE id = ?`, [v.id]);
    await hit('freeze', 0);
    logEvent(room.code, `${p.name} froze ${v.name}`);
    return res.json({ kind: 'freeze', victim, score: p.score, seconds: FREEZE_MS / 1000 });
  }));

  // guess the victim's real password; faster = a bigger share of their credits
  app.post('/api/game/:code/hack', h(async (req, res) => {
    const room = await db.one('SELECT * FROM game_rooms WHERE code = ?', [String(req.params.code)]);
    if (!room || !room.raid || room.status !== 'playing') return bad(res, 'The game is not running', 409);
    const p = await db.one('SELECT * FROM game_players WHERE code = ? AND token = ?', [room.code, String(req.body?.token || '')]);
    if (!p) return bad(res, 'Join the game first', 403);
    const hack = parse(p.pending)?.hack;
    if (!hack) return bad(res, 'No hack in progress', 409);
    const claim = await db.run("UPDATE game_players SET pending = '' WHERE id = ? AND pending = ?", [p.id, p.pending]);
    if (!claim.rowCount) return bad(res, 'Already done', 409);
    const v = await db.one('SELECT * FROM game_players WHERE id = ? AND code = ?', [hack.victim_id, room.code]);
    let found = !!v && hack.options[Number(req.body?.choice)] === v.pw;
    if (found && (await db.one('UPDATE game_players SET shield = false WHERE id = ? AND shield RETURNING id', [v.id]))) {
      await db.run("UPDATE game_players SET hit_by = ?, hit_amt = 0, hit_kind = 'blocked', hit_seq = hit_seq + 1 WHERE id = ?", [p.name, v.id]);
      logEvent(room.code, `${v.name}'s shield blocked ${p.name}'s hack`);
      return res.json({ found: true, blocked: true, amt: 0, pct: 0, seconds: Math.round(((Date.now() - hack.t) / 1000) * 10) / 10, victim: hack.victim, score: p.score });
    }
    const seconds = (Date.now() - hack.t) / 1000;
    let amt = 0; let pct = 0;
    if (found) {
      pct = hackShare(seconds);
      amt = Math.min(v.score, Math.floor(v.score * pct));
      if (amt > 0) {
        await db.run("UPDATE game_players SET score = GREATEST(score - ?, 0), hacked = hacked + 1, hit_by = ?, hit_amt = ?, hit_kind = 'hack', hit_seq = hit_seq + 1 WHERE id = ?", [amt, p.name, amt, v.id]);
        logEvent(room.code, `${p.name} hacked ${v.name} for ${amt}`);
        await db.run('UPDATE game_players SET score = score + ?, hacks = hacks + 1, stolen = stolen + ? WHERE id = ?', [amt, amt, p.id]);
      }
    }
    res.json({ found, amt, pct: Math.round(pct * 100), seconds: Math.round(seconds * 10) / 10, victim: hack.victim, score: p.score + amt });
  }));
}
