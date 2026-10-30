# SAT Ustoz — SAT Reading & Writing platform

React (Vite) + Node.js (Express) + PostgreSQL (Supabase in production, embedded PGlite locally).

## Brand (SAT Ustoz v1.0)

| Token | Hex | Use |
|---|---|---|
| Night Ink | `#161B3D` | text, “SAT” |
| Sky | `#3B82F6` | brand, fills, progress of a set |
| Signal Blue | `#2A55E5` | buttons, links |
| Sun | `#FFCB3D` | “Ustoz” badge, rewards, XP, current roadmap step |
| Mint | `#3CCB9A` | correct answers, completed progress — feedback only |
| Coral | `#F28B6E` | mistakes only |
| Cloud | `#F5F7F8` | page ground |

Tints: Sky 50 `#E7EFFE`, Sun 50 `#FFF4D1`, Mint 50 `#E2F8F0`, Coral 50 `#FDEDE8`, Line `#D9DEE5`.
Fonts (self-hosted, no Google request): **Unbounded** for headings and the logo only, **Manrope** for body — passages and explanations at 17/29.
All tokens live at the top of `client/src/styles.css`; the logo and app icon are `Logo` / `AppIcon` in `client/src/components/icons.jsx`.

## What is inside

**Students**
- Sign up with email + password or **Sign in with Google** (Google Identity Services — only a public `GOOGLE_CLIENT_ID` is needed). New accounts appear in the teacher panel automatically — no approval needed.
- **Placement test** right after sign-up, built from `server/src/placement/placement_test.json`:
  Part 1 Grammar (40 items A1→C1, multiple choice + written, 25 min) and Part 2 SAT (10 items, 12 min), separate timers, autosave and resume.
  Result: CEFR level (course needs B2), current SAT R&W estimate range, projected range after the course, weak grammar skills and SAT question types with course links, Uzbek “Ustoz maslahati” tip, full answer review.
  Answers never reach the browser before the test is finished; late answers after a part's timer are ignored. The teacher can download/upload/reset the JSON in Settings.
- **Roadmap map**: a winding 200 → 800 path. Steps unlock one by one. Each step holds lessons: video, study notes and quizzes.
- **Course modules** (`server/src/content/*.json`, first one: `grammar1.json` → **Writing Part 1: Clauses**, Standard English Conventions): one roadmap step per module, one lesson per section.
  A lesson = video (link added by the teacher later) + written notes + a level check. Level checks have versions A → B → C → A (15 questions); 80% passes and opens the next lesson.
  After the 8 lessons: **Vocabulary** (25 SAT words as flip cards with meaning, Uzbek translation and example; the student marks the set as learned) and the **Session check** — 30 questions (20 grammar + 10 vocabulary), 35-minute timer enforced on the server, versions A/B/C, 80% completes the part. It opens only after every lesson's level check is passed.
  Sections without content show as “Coming soon”. Free lessons are set per module with `free_lessons`. Content markup: `**bold**`, `*italic*`, `~~strike~~`, `[[underline]]`, `______` blanks.
  New/updated modules: put the JSON in `server/src/content/` (synced on start) or use **Roadmap → Import module (JSON)** in the teacher panel. Progress and video links are kept when content is updated.
- **Writing Part 3: Form, Structure, and Sense** (`content/grammar3.json`): 6 lessons (level checks of 10 questions, 8 in lesson 1), 30 SAT words, a 30-question session check. It sits after Writing Part 2. Lesson notes show their sources; the check review shows where each question comes from.
- **Rules sheets (PDF)**: `content/handouts/` + `handouts.json` attach a PDF to a module's step (Writing Part 1 → 4 pages, Writing Part 3 → 3 pages). Students open or download it from the roadmap step and from every lesson. The teacher can upload, replace or remove a sheet for any step in Roadmap → edit step. A removed bundled sheet comes back on the next restart; an uploaded one is never overwritten.
- Free lessons: only Writing Part 1 lessons 1–2 are open without a subscription (`free_lessons` in a module JSON; default 0).
- **Question Bank** (`server/src/content/qbank/*.json`): 150 original SAT-style Reading and Writing questions written for SAT Ustoz — the 4 official domains and 10 skills, 15 per skill (5 easy, 5 medium, 5 hard), each with an explanation and an Ustoz tip. Data questions include tables; Rhetorical Synthesis shows student notes; Cross-Text shows Text 1 and Text 2.
  Students choose a domain or skill, difficulty, and New / My mistakes / All, then practise one question at a time (Check answer → explanation). Progress per skill and mistakes are saved. Easy questions are free; medium and hard need a subscription.
  Teacher: Question Bank → browse with answers and class results (% right first time), hide questions, import more from JSON in the same format (ids must not clash with built-in ones).
- **Practice mode** (practice quizzes): one question at a time → *Check answer* → instant feedback (“Not quite — almost!”), explanation, **Ustoz tip** and XP (+10 correct, +5 for trying). Checked answers are locked on the server.
- **Exam mode** (mocks, readiness check): the real Bluebook layout (passage left, options right, mark for review, timer, autosave); answers are revealed at the end.
- Result analysis with explanations and tips, SAT domain labels, saved questions, analytics, portfolio.
- **Subscription**: quizzes, lessons and mocks need an active subscription (can be switched off in Settings). Telegram-bot payments are the next stage; until then the teacher activates access by hand.

**Website (no sign-in)**
- Visitors land on a product home page (menu with dropdowns, “Start free trial”, “Log in”), not on the login form.
- **Free practice tests** (`/practice`): 27 questions, 32 minutes, score estimate, skill breakdown and full review with explanations. Questions come from the Question Bank (read only — the bank is never changed). Every visit opens a new random 40% of the bank; students filter by domain, skill and level. Settings: Website → Practice tests.
- **Website editor** (teacher → Website): home page texts, menu sections and pages (guides, courses, news…), student wins, FAQ — create, edit, hide, delete. Server code: `server/src/site.js`, client: `client/src/pages/public/`.

**Teacher (admin)**
- Overview: students, new sign-ups, subscribers, recent attempts, hardest topics.
- Students: filters (subscribed / not / new this week), readiness score, activate/extend/cancel subscription, payment history, reset password, create accounts manually.
- Quizzes: upload from Excel/CSV/PDF/TXT (columns: passage, question, A–D, correct, explanation, **tip**, topic), type (practice / mock / readiness check), visible to all students or to groups.
- **Roadmap editor**: add, edit, delete and reorder steps; add video / quiz / notes lessons to each step; live map preview.
- Settings: subscription on/off, prices, Telegram bot username.

## Run on Ubuntu

```bash
# 1. Node.js 22 (once)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs unzip

# 2. Project
unzip sat-ustoz.zip -d ~ && cd ~/sat-ustoz      # updating? keep server/data — see below
npm run install:all
npm run build
npm start                     # → http://localhost:4000
```

Logins: teacher `master` / `master123` · demo student `shukurullo` / `student123`.

Development with hot reload: `npm run dev` → http://localhost:5173

**Your data** (users, results, progress) lives in `server/data/`. When you update to a new zip, move that folder out first and put it back after unzipping.

## Configuration — `server/.env`

| Variable | Meaning |
|---|---|
| `GOOGLE_CLIENT_ID` | Enables “Sign in with Google”. Public OAuth Web client ID (origins: http://localhost:4000, http://localhost:5173). |
| `DATABASE_URL` | Supabase Postgres (session pooler). Leave commented to use the built-in local database in `server/data/pg`. |
| `PORT` | Default 4000 |
| `MASTER_LOGIN`, `MASTER_PASSWORD` | First teacher account (used only when the database is empty) |
| `JWT_SECRET` | Optional; generated automatically |
| `TELEGRAM_BOT` | Payment bot username (next stage) |

Tables are created automatically on start. Row Level Security is enabled on every table, so nothing is readable through Supabase’s public REST API — only this server can access the data.

### Turning on Google sign-in (one-time)
1. Google Cloud Console → Google Auth Platform → finish *Branding* (app name, support email, External).
2. *Clients* → **Create client** → Web application. Authorized JavaScript origins: `http://localhost:4000` and `http://localhost:5173` (add your real domain later).
3. Copy the Client ID into `server/.env` → `GOOGLE_CLIENT_ID=…` and restart `npm start`. No client secret is used.
4. *Audience* → **Publish app**, so any Google account can sign in (email/profile scopes need no verification).

## Project layout

```
server/src/  index.js (REST API) · db.js (Postgres/PGlite + schema) · auth.js · seed.js · parse.js · analytics.js
             placement/ (placement test engine + JSON) · course/ (modules, lessons, level checks) · content/ (module JSONs)
client/src/  pages/student · pages/master · pages/quiz · pages/placement · pages/lesson · components/RoadmapMap.jsx · components/Rich.jsx
```

## Next stage
- Telegram bot payments → writes to the `payments` table and extends `users.sub_until` (same as the teacher’s “Activate”).
- Video lessons uploaded to Supabase Storage (the roadmap already plays YouTube and direct video links).
- Mock exams (two adaptive modules) and the AI assistant for Reading & Writing.
