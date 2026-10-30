/**
 * Word Arena — a live vocabulary game (classic, team battle or 1-v-1 duel).
 * A host (teacher or student) opens a room with a 6-digit code; players join from any device with a
 * nickname and a character — no account needed. Everyone answers the same questions at their own pace;
 * correct answers score 100 + a streak bonus. Screens poll the room state every ~1.5 s (works on Vercel).
 */
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { db } from './db.js';
import { getSecret } from './auth.js';
import { gameWords } from './vocab.js';

const MODES = ['classic', 'team', 'duel'];
export const CHARACTERS = ['owl', 'fox', 'cat', 'bear', 'bunny', 'frog', 'penguin', 'robot', 'dragon', 'ghost', 'chick', 'octo'];
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
`);
}

const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const blankOut = (sentence, word) => {
  const stem = word.toLowerCase().replace(/(e|ed|ing|s|es|ly)$/, '');
  const re = new RegExp(`\\b(${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}|${stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\w*)\\b`, 'i');
  return re.test(sentence) && stem.length >= 3 ? sentence.replace(re, '______') : null;
};

/** Mixed question types from a word pool: word → meaning, meaning → word, fill the gap. */
function buildQuestions(pool, count) {
  const qs = [];
  const picks = shuffle([...pool]).slice(0, count);
  picks.forEach((w, i) => {
    const others = shuffle(pool.filter((x) => x.id !== w.id)).slice(0, 3);
    if (others.length < 3) return;
    const blank = w.example ? blankOut(w.example, w.word) : null;
    const kind = i % 3 === 2 && blank ? 'blank' : i % 2 ? 'word' : 'meaning';
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

async function finishIfDone(room) {
  if (room.status !== 'playing') return room;
  const total = JSON.parse(room.questions).length;
  const timeUp = room.ends_at && new Date(room.ends_at) <= new Date();
  const { left } = await db.one('SELECT COUNT(*) AS left FROM game_players WHERE code = ? AND answered < ?', [room.code, total]);
  if (timeUp || Number(left) === 0) {
    await db.run("UPDATE game_rooms SET status = 'finished', finished_at = now() WHERE code = ? AND status = 'playing'", [room.code]);
    return { ...room, status: 'finished' };
  }
  return room;
}

export function registerGame(app, { h, bad }) {
  // create a room (signed-in teacher or student)
  app.post('/api/game/rooms', h(async (req, res) => {
    const me = tokenUser(req);
    if (!me) return bad(res, 'Please sign in to host a game', 401);
    const mode = MODES.includes(req.body?.mode) ? req.body.mode : 'classic';
    const count = Math.min(30, Math.max(5, Number(req.body?.questions) || 15));
    const minutes = Math.min(15, Math.max(1, Number(req.body?.minutes) || 3));
    const setIds = (Array.isArray(req.body?.set_ids) ? req.body.set_ids : []).map(Number).filter(Boolean).slice(0, 20);
    const pool = await gameWords(setIds, Math.max(40, count * 3));
    if (pool.length < 4) return bad(res, 'Not enough words in the chosen sets');
    const questions = buildQuestions(pool, count);
    await db.run("DELETE FROM game_rooms WHERE created_at < now() - interval '2 days'");
    const code = await newCode();
    const host_token = crypto.randomBytes(18).toString('hex');
    await db.run('INSERT INTO game_rooms (code, host_user, host_token, mode, minutes, questions, title) VALUES (?,?,?,?,?,?,?)',
      [code, me.id, host_token, mode, minutes, JSON.stringify(questions), String(req.body?.title || '').slice(0, 60)]);
    res.json({ code, host_token, mode, questions: questions.length, minutes });
  }));

  // join with a nickname and a character
  app.post('/api/game/:code/join', h(async (req, res) => {
    const room = await db.one('SELECT * FROM game_rooms WHERE code = ?', [String(req.params.code)]);
    if (!room) return bad(res, 'No game with this code', 404);
    if (room.status === 'finished') return bad(res, 'This game has already finished', 409);
    const name = cleanName(req.body?.name);
    if (name.length < 2) return bad(res, 'Choose a nickname (2+ letters)');
    const avatar = CHARACTERS.includes(req.body?.avatar) ? req.body.avatar : CHARACTERS[0];
    const players = await db.all('SELECT name, team FROM game_players WHERE code = ?', [room.code]);
    if (room.mode === 'duel' && players.length >= 2) return bad(res, 'This duel already has two players', 409);
    if (players.length >= 60) return bad(res, 'The room is full', 409);
    if (players.some((p) => p.name.toLowerCase() === name.toLowerCase())) return bad(res, 'This nickname is taken in this room', 409);
    let team = '';
    if (room.mode === 'team') { const a = players.filter((p) => p.team === TEAMS[0]).length; const b = players.filter((p) => p.team === TEAMS[1]).length; team = a <= b ? TEAMS[0] : TEAMS[1]; }
    const token = crypto.randomBytes(18).toString('hex');
    const me = tokenUser(req);
    await db.run('INSERT INTO game_players (code, token, user_id, name, avatar, team) VALUES (?,?,?,?,?,?)', [room.code, token, me?.id || null, name, avatar, team]);
    res.json({ token, team });
  }));

  // room state for players, the host and projector screens
  app.get('/api/game/:code', h(async (req, res) => {
    let room = await db.one('SELECT * FROM game_rooms WHERE code = ?', [String(req.params.code)]);
    if (!room) return bad(res, 'No game with this code', 404);
    room = await finishIfDone(room);
    const token = String(req.query.token || '');
    const isHost = token && token === room.host_token;
    if (token && !isHost) await db.run('UPDATE game_players SET seen_at = now() WHERE token = ?', [token]);
    const players = await db.all('SELECT id, token, name, avatar, team, score, correct, answered, streak, best_streak FROM game_players WHERE code = ? ORDER BY score DESC, correct DESC, joined_at', [room.code]);
    const questions = JSON.parse(room.questions);
    const me = players.find((p) => p.token === token);
    const teams = room.mode === 'team' ? TEAMS.map((t) => { const ps = players.filter((p) => p.team === t); return { name: t, score: ps.reduce((s, p) => s + p.score, 0), players: ps.length }; }) : [];
    res.json({
      code: room.code, mode: room.mode, status: room.status, minutes: room.minutes, title: room.title, total: questions.length,
      seconds_left: room.ends_at ? Math.max(0, Math.round((new Date(room.ends_at) - Date.now()) / 1000)) : room.minutes * 60,
      host: isHost, players: players.map(({ token: _t, ...p }) => ({ ...p, me: p.id === me?.id })), teams,
      me: me ? { id: me.id, name: me.name, avatar: me.avatar, team: me.team, score: me.score, answered: me.answered, correct: me.correct, streak: me.streak } : null,
      // questions go to players only while the game runs; answers are never included
      questions: me && room.status === 'playing' ? questions.map((q) => ({ kind: q.kind, prompt: q.prompt, uz: q.uz, options: q.options })) : undefined,
      review: room.status === 'finished' ? questions.map((q) => ({ kind: q.kind, prompt: q.prompt, answer: q.options[q.answer], word: q.word })) : undefined,
    });
  }));

  app.post('/api/game/:code/start', h(async (req, res) => {
    const room = await db.one('SELECT * FROM game_rooms WHERE code = ?', [String(req.params.code)]);
    if (!room || req.body?.host_token !== room.host_token) return bad(res, 'Only the host can start', 403);
    const { n } = await db.one('SELECT COUNT(*) AS n FROM game_players WHERE code = ?', [room.code]);
    if (Number(n) < (room.mode === 'classic' ? 1 : 2)) return bad(res, room.mode === 'duel' ? 'A duel needs two players' : 'Wait for at least two players');
    await db.run("UPDATE game_rooms SET status = 'playing', started_at = now(), ends_at = now() + (minutes || ' minutes')::interval WHERE code = ? AND status = 'lobby'", [room.code]);
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
    room = await finishIfDone(room);
    if (room.status !== 'playing') return bad(res, 'The game is not running', 409);
    const p = await db.one('SELECT * FROM game_players WHERE code = ? AND token = ?', [room.code, String(req.body?.token || '')]);
    if (!p) return bad(res, 'Join the game first', 403);
    const questions = JSON.parse(room.questions);
    const qi = Number(req.body?.qi);
    if (qi !== p.answered || qi >= questions.length) return bad(res, 'This question was already answered', 409);
    const q = questions[qi];
    const correct = Number(req.body?.choice) === q.answer;
    const streak = correct ? p.streak + 1 : 0;
    const gain = correct ? 100 + Math.min(p.streak, 5) * 20 : 0;
    await db.run('UPDATE game_players SET answered = answered + 1, correct = correct + ?, score = score + ?, streak = ?, best_streak = GREATEST(best_streak, ?), seen_at = now() WHERE id = ? AND answered = ?',
      [correct ? 1 : 0, gain, streak, streak, p.id, qi]);
    res.json({ correct, answer: q.answer, gain, score: p.score + gain, streak, done: qi + 1 >= questions.length });
  }));
}
