/**
 * Database layer — PostgreSQL everywhere.
 *  - DATABASE_URL set  → real Postgres (Supabase in production) via `pg`.
 *  - not set           → embedded PGlite (Postgres compiled to WASM) stored in DATA_DIR/pg.
 * Both speak the same SQL, so the app code is identical. Use `?` placeholders; they are
 * converted to $1, $2… automatically.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.DATA_DIR || (process.env.VERCEL ? '/tmp/sat-ustoz' : path.join(__dirname, '..', 'data'));
fs.mkdirSync(DATA_DIR, { recursive: true });

const toPg = (sql) => {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
};
const iso = (v) => (v == null ? v : new Date(v).toISOString());

let driver; // { query(sql, params) -> {rows, rowCount}, transaction(fn), exec(sql), close() }
export let DB_KIND = 'pglite';

// Vercel's Neon / Postgres integrations provide POSTGRES_URL as well
if (!process.env.DATABASE_URL && process.env.POSTGRES_URL) process.env.DATABASE_URL = process.env.POSTGRES_URL;
if (process.env.DATABASE_URL) {
  DB_KIND = 'postgres';
  const pg = (await import('pg')).default;
  pg.types.setTypeParser(20, (v) => parseInt(v, 10)); // int8 (COUNT)
  pg.types.setTypeParser(1700, (v) => parseFloat(v)); // numeric
  pg.types.setTypeParser(1184, iso); // timestamptz → ISO string
  pg.types.setTypeParser(1114, (v) => iso(v + 'Z')); // timestamp
  const url = process.env.DATABASE_URL;
  const local = /localhost|127\.0\.0\.1/.test(url);
  const pool = new pg.Pool({ connectionString: url, ssl: local ? false : { rejectUnauthorized: false }, max: process.env.VERCEL ? 3 : 10, idleTimeoutMillis: 10000 });
  driver = {
    query: (sql, params) => pool.query(sql, params),
    exec: (sql) => pool.query(sql),
    async transaction(fn) {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const r = await fn({ query: (s, p) => c.query(s, p) });
        await c.query('COMMIT');
        return r;
      } catch (e) {
        await c.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        c.release();
      }
    },
    close: () => pool.end(),
  };
} else {
  const { PGlite, types } = await import('@electric-sql/pglite');
  const parsers = {
    [types.INT8]: (v) => parseInt(v, 10),
    [types.NUMERIC]: (v) => parseFloat(v),
    [types.TIMESTAMPTZ]: iso,
    [types.TIMESTAMP]: (v) => iso(v + 'Z'),
  };
  const pgl = new PGlite(path.join(DATA_DIR, 'pg'), { parsers });
  await pgl.waitReady;
  const norm = (r) => ({ rows: r.rows, rowCount: r.affectedRows ?? r.rows.length });
  driver = {
    query: async (sql, params) => norm(await pgl.query(sql, params)),
    exec: (sql) => pgl.exec(sql),
    transaction: (fn) => pgl.transaction((t) => fn({ query: async (s, p) => norm(await t.query(s, p)) })),
    close: () => pgl.close(),
  };
}

const wrap = (q) => ({
  all: async (sql, params = []) => (await q(toPg(sql), params)).rows,
  one: async (sql, params = []) => (await q(toPg(sql), params)).rows[0],
  run: async (sql, params = []) => {
    const r = await q(toPg(sql), params);
    return { rowCount: r.rowCount, rows: r.rows, id: r.rows[0]?.id };
  },
});

/** db.all / db.one / db.run / db.tx(async (t) => { await t.run(...) }) */
export const db = {
  ...wrap((s, p) => driver.query(s, p)),
  tx: (fn) => driver.transaction((c) => fn(wrap((s, p) => c.query(s, p)))),
  exec: (sql) => driver.exec(sql),
  close: () => driver.close(),
};

const TABLES = ['settings', 'groups', 'users', 'quizzes', 'quiz_groups', 'questions', 'attempts', 'answers', 'saved', 'roadmap_steps', 'roadmap_items', 'roadmap_done', 'portfolio', 'payments'];

export async function migrate() {
  await db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS groups (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  login TEXT NOT NULL UNIQUE,
  email TEXT UNIQUE,
  password_hash TEXT,
  provider TEXT NOT NULL DEFAULT 'teacher',
  avatar_url TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL CHECK (role IN ('master','student')),
  group_id INTEGER REFERENCES groups(id) ON DELETE SET NULL,
  target_english INTEGER NOT NULL DEFAULT 750,
  target_math INTEGER NOT NULL DEFAULT 800,
  exam_date TEXT,
  diagnostic_score INTEGER,
  diagnostic_attempt_id INTEGER,
  sub_until TIMESTAMPTZ,
  sub_plan TEXT NOT NULL DEFAULT '',
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS quizzes (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  section TEXT NOT NULL DEFAULT 'english',
  kind TEXT NOT NULL DEFAULT 'practice' CHECK (kind IN ('practice','diagnostic','mock')),
  is_public BOOLEAN NOT NULL DEFAULT false,
  duration_min INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS quiz_groups (
  quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  PRIMARY KEY (quiz_id, group_id)
);
CREATE TABLE IF NOT EXISTS questions (
  id SERIAL PRIMARY KEY,
  quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  passage TEXT NOT NULL DEFAULT '',
  prompt TEXT NOT NULL DEFAULT '',
  opt_a TEXT NOT NULL DEFAULT '',
  opt_b TEXT NOT NULL DEFAULT '',
  opt_c TEXT NOT NULL DEFAULT '',
  opt_d TEXT NOT NULL DEFAULT '',
  correct TEXT NOT NULL,
  explanation TEXT NOT NULL DEFAULT '',
  topic TEXT NOT NULL DEFAULT 'General'
);
CREATE TABLE IF NOT EXISTS attempts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  score INTEGER,
  total INTEGER,
  progress TEXT NOT NULL DEFAULT '{}',
  current INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS answers (
  attempt_id INTEGER NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  choice TEXT,
  is_correct INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (attempt_id, question_id)
);
CREATE TABLE IF NOT EXISTS saved (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, question_id)
);
CREATE TABLE IF NOT EXISTS roadmap_steps (
  id SERIAL PRIMARY KEY,
  position INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  focus TEXT NOT NULL DEFAULT '',
  score_from INTEGER NOT NULL DEFAULT 200,
  score_to INTEGER NOT NULL DEFAULT 800,
  badge TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT 'signal',
  pass_pct INTEGER NOT NULL DEFAULT 70
);
CREATE TABLE IF NOT EXISTS roadmap_items (
  id SERIAL PRIMARY KEY,
  step_id INTEGER NOT NULL REFERENCES roadmap_steps(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL DEFAULT 'quiz' CHECK (kind IN ('video','quiz','reading')),
  title TEXT NOT NULL DEFAULT '',
  quiz_id INTEGER REFERENCES quizzes(id) ON DELETE CASCADE,
  url TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS roadmap_done (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES roadmap_items(id) ON DELETE CASCADE,
  done_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_id)
);
CREATE TABLE IF NOT EXISTS portfolio (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Achievement',
  description TEXT NOT NULL DEFAULT '',
  date TEXT,
  link TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'manual',
  plan TEXT NOT NULL DEFAULT '',
  days INTEGER NOT NULL DEFAULT 30,
  amount INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'UZS',
  status TEXT NOT NULL DEFAULT 'paid',
  external_id TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_attempts_user ON attempts(user_id, finished_at);
CREATE INDEX IF NOT EXISTS idx_attempts_quiz ON attempts(quiz_id);
CREATE INDEX IF NOT EXISTS idx_questions_quiz ON questions(quiz_id, position);
CREATE INDEX IF NOT EXISTS idx_answers_question ON answers(question_id);
CREATE INDEX IF NOT EXISTS idx_items_step ON roadmap_items(step_id, position);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
`);
  // Supabase exposes the public schema through its REST API with the anon key.
  // Row Level Security with no policies = nothing is reachable from there; only this server
  // (connecting as the database owner) can read or write.
  for (const t of TABLES) await db.exec(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`);
  // v4: course modules (lessons with notes, video slot and versioned level checks)
  await db.exec(`
ALTER TABLE roadmap_steps ADD COLUMN IF NOT EXISTS module_id TEXT NOT NULL DEFAULT '';
ALTER TABLE roadmap_steps ADD COLUMN IF NOT EXISTS module_src TEXT NOT NULL DEFAULT '';
ALTER TABLE roadmap_items ADD COLUMN IF NOT EXISTS content TEXT NOT NULL DEFAULT '';
ALTER TABLE roadmap_items ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ready';
ALTER TABLE roadmap_items DROP CONSTRAINT IF EXISTS roadmap_items_kind_check;
ALTER TABLE roadmap_items ADD CONSTRAINT roadmap_items_kind_check CHECK (kind IN ('video','quiz','reading','lesson'));
CREATE TABLE IF NOT EXISTS lesson_checks (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES roadmap_items(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  answers TEXT NOT NULL DEFAULT '{}',
  score INTEGER, total INTEGER, passed BOOLEAN NOT NULL DEFAULT false,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_lesson_checks ON lesson_checks(user_id, item_id);
ALTER TABLE lesson_checks ENABLE ROW LEVEL SECURITY;
`);
  // v6: question bank (original SAT R&W questions by domain and skill)
  await db.exec(`
CREATE TABLE IF NOT EXISTS qbank_questions (
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL, skill_id TEXT NOT NULL, skill TEXT NOT NULL,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy','medium','hard')),
  passage TEXT NOT NULL DEFAULT '', data_table TEXT NOT NULL DEFAULT '', prompt TEXT NOT NULL,
  options TEXT NOT NULL, answer INTEGER NOT NULL, explanation TEXT NOT NULL DEFAULT '', tip TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0, src TEXT NOT NULL DEFAULT 'bundled', active BOOLEAN NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_qbank_skill ON qbank_questions(skill_id, difficulty);
CREATE TABLE IF NOT EXISTS qbank_answers (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES qbank_questions(id) ON DELETE CASCADE,
  choice INTEGER, correct BOOLEAN NOT NULL DEFAULT false, first_correct BOOLEAN NOT NULL DEFAULT false,
  tries INTEGER NOT NULL DEFAULT 1, answered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, question_id)
);
ALTER TABLE qbank_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE qbank_answers ENABLE ROW LEVEL SECURITY;
`);
  // v5: rules sheets (PDF) attached to roadmap steps — bundled from content/handouts or uploaded by the teacher
  await db.exec(`
CREATE TABLE IF NOT EXISTS step_handouts (
  step_id INTEGER PRIMARY KEY REFERENCES roadmap_steps(id) ON DELETE CASCADE,
  name TEXT NOT NULL, title TEXT NOT NULL DEFAULT '', pages INTEGER, size INTEGER NOT NULL DEFAULT 0,
  src TEXT NOT NULL DEFAULT 'bundled', data BYTEA NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE step_handouts ENABLE ROW LEVEL SECURITY;
`);
  // v3: placement test
  await db.exec(`
CREATE TABLE IF NOT EXISTS placement_attempts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  test_id TEXT NOT NULL DEFAULT '',
  section TEXT NOT NULL DEFAULT '',
  section_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  answers TEXT NOT NULL DEFAULT '{}',
  current INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  grammar_points INTEGER, sat_points INTEGER, cefr TEXT, admitted BOOLEAN,
  midpoint INTEGER, result TEXT
);
CREATE INDEX IF NOT EXISTS idx_placement_user ON placement_attempts(user_id, finished_at);
ALTER TABLE placement_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ADD COLUMN IF NOT EXISTS cefr TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS admitted BOOLEAN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS placement_at TIMESTAMPTZ;
UPDATE users SET placement_at = created_at WHERE diagnostic_score IS NOT NULL AND placement_at IS NULL;
`);
  // v2: “Ustoz tip” on questions; brand step colours
  await db.exec(`ALTER TABLE questions ADD COLUMN IF NOT EXISTS tip TEXT NOT NULL DEFAULT ''`);
  await db.exec(`UPDATE roadmap_steps SET color = CASE color
      WHEN 'amber' THEN 'sun' WHEN 'orange' THEN 'sun' WHEN 'teal' THEN 'sky' WHEN 'emerald' THEN 'white'
      WHEN 'violet' THEN 'signal' WHEN 'indigo' THEN 'signal' WHEN 'rose' THEN 'night' WHEN 'pink' THEN 'sky' ELSE color END
    WHERE color NOT IN ('signal','sky','sun','night','white')`);
}

// ---------- settings ----------
const DEFAULT_SETTINGS = {
  require_subscription: 'true',
  price_month: '149000',
  price_quarter: '399000',
  currency: 'UZS',
  telegram_bot: process.env.TELEGRAM_BOT || '',
  pay_card: '',
  pay_holder: '',
};
export async function getSettings() {
  const rows = await db.all('SELECT key, value FROM settings');
  const out = { ...DEFAULT_SETTINGS };
  for (const r of rows) if (!r.key.startsWith('_')) out[r.key] = r.value; // '_' keys are internal (secret, content hash)
  return out;
}
export async function setSettings(obj) {
  for (const [k, v] of Object.entries(obj)) {
    if (!(k in DEFAULT_SETTINGS)) continue;
    await db.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value', [k, String(v ?? '')]);
  }
  return getSettings();
}
