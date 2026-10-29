import bcrypt from 'bcryptjs';
import { db } from './db.js';
import { DEFAULT_PROMPT } from './parse.js';

const P_WORD = 'Which choice completes the text with the most logical and precise word or phrase?';
const P_TRANS = 'Which choice completes the text with the most logical transition?';
const P_LOGIC = 'Which choice most logically completes the text?';

// Original practice items written for this platform.
const BOUNDARY_TIPS = [
  'Cover the blank and ask: which part could stand alone as a sentence? That is the main clause.',
  'Extra information that opens with a comma must also close with one — commas come in pairs.',
  'Read both sides of the gap. Two complete sentences need a period, a semicolon, or a comma + FANBOYS.',
  'A colon needs a complete sentence before it. Try saying “namely” in its place.',
  'Cross out the “along with …” phrase — the verb must agree with what is left.',
  'In a list, every item should start the same way: to listen, ask, and protect.',
  'Count the owners first: one student → student’s, many students → students’.',
  '“Decided” is followed by “to + verb”: decided to go, decided to revise.',
];
const BOUNDARIES = [
  ['Although Marie Curie, a pioneering physicist and chemist, discovered ______ still faced significant skepticism from the male-dominated scientific community.',
    ['radium, she', 'radium; she', 'radium, despite she', 'radium, but she'], 'A',
    'The sentence opens with the subordinate clause "Although Marie Curie ... discovered radium". A subordinate clause is separated from the main clause by a comma, and the main clause "she still faced..." follows. "But" and "despite" are redundant with "Although", and a semicolon would leave a fragment before it.', 'Boundaries'],
  ["The museum's new exhibit, which opened last week ______ rare fossils from three continents.",
    [', features', 'features', '; features', ': features'], 'A',
    'The clause "which opened last week" is nonessential, so it must be enclosed by a pair of commas. The comma after "week" closes the pair before the main verb "features".', 'Boundaries'],
  ['Rivers carve valleys slowly over centuries ______ glaciers do the same work far more dramatically.',
    ['centuries, glaciers', 'centuries; glaciers', 'centuries glaciers', 'centuries, glaciers,'], 'B',
    'Both sides of the gap are independent clauses. A semicolon can join two independent clauses; a lone comma creates a comma splice and no punctuation creates a run-on.', 'Boundaries'],
  ['The chef needed one final ingredient to finish the sauce ______ saffron.',
    ['ingredient; saffron', 'ingredient saffron', 'ingredient, was saffron', 'ingredient: saffron'], 'D',
    'A colon can follow a complete independent clause to introduce a word or list that explains it. "Saffron" is the specific ingredient being named, so a colon fits.', 'Boundaries'],
  ['The collection of ancient manuscripts, along with several rare maps, ______ displayed on the third floor of the library.',
    ['are', 'is', 'were', 'have been'], 'B',
    'The subject is the singular noun "collection". The phrase "along with several rare maps" is a modifier and does not change the number of the subject, so the singular verb "is" is correct.', 'Form, Structure, and Sense'],
  ['The volunteer program trains participants to listen carefully, ask thoughtful questions, and ______ confidential information.',
    ['protecting', 'protect', 'protected', 'to protecting'], 'B',
    'The three items form a parallel series after "to": "to listen", "(to) ask", and "(to) protect". The base form "protect" keeps the structure parallel.', 'Form, Structure, and Sense'],
  ['The two ______ lockers were side by side near the gym entrance.',
    ['students', "student's", "students'", "students's"], 'C',
    'The lockers belong to two students, so we need the plural possessive "students\'". "Student\'s" would imply a single owner.', 'Form, Structure, and Sense'],
  ['Because the experiment failed twice, the researchers decided ______ the method before trying again.',
    ['revising', 'to revise', 'revised', 'to have revising'], 'B',
    'The verb "decided" is followed by an infinitive ("to revise") to express the intended action.', 'Form, Structure, and Sense'],
].map(([passage, o, c, e, t], i) => ({ passage, prompt: DEFAULT_PROMPT, o, c, e, t, tip: BOUNDARY_TIPS[i] }));


const NOTES = [
  'The Reading and Writing section has two modules of 27 questions each (32 minutes per module). Module 2 adapts to how you did in Module 1. Every question has one short passage and four options. Questions come grouped by type: Craft and Structure, Information and Ideas, Standard English Conventions, and Expression of Ideas.',
  'A complete sentence (independent clause) needs a subject and a verb and can stand alone. Join two independent clauses with a period, a semicolon, or a comma plus a FANBOYS conjunction (for, and, nor, but, or, yet, so). A comma alone between them is a comma splice. A dependent clause (starting with although, because, when, which…) attaches to a main clause with a comma or no punctuation.',
  'Semicolon = period (both sides complete). Colon: the left side must be complete; the right side explains or lists. A pair of commas or a pair of dashes encloses extra information — never mix them. No comma between a subject and its verb, or between a verb and its object.',
  'Find the true subject — cross out prepositional phrases ("of the paintings") and modifiers set off by commas. Keep verb tense consistent with the time words in the passage. Pronouns must match their noun in number. A modifier at the start of a sentence must be followed directly by the thing it describes.',
  'Decide the relationship between the two sentences BEFORE reading the options: same direction (furthermore, similarly), opposite (however, in contrast), cause → effect (therefore, as a result), example (for instance), or time order (subsequently, finally).',
  'Read the goal in the question first. The correct answer is the option that achieves exactly that goal using the notes — not the one with the most information. Eliminate options that are accurate but answer a different goal.',
  'Cover the options. Use the context clues around the blank to predict a simple word of your own, then choose the option closest in meaning. Watch for contrast words (although, but) that flip the meaning.',
  'Ask "what is this sentence doing?" rather than "what does it say?". Common functions: introduces a claim, gives an example, presents a counterargument, offers a conclusion. For purpose questions, describe the whole text in one short sentence first.',
  'Summarize each text in a few words. Then decide: do the authors agree, disagree, or does one add a qualification? The answer usually describes how Text 2 would respond to a specific claim in Text 1.',
  'Main idea: what the whole text is about, not one detail. Evidence: the right quote or data point supports the exact claim in the question. Inference: choose the option that MUST be true from the text — avoid answers that go further than the passage.',
  'Practise full modules with a timer (32 minutes). After each test, write every mistake in an error log with its type and the rule you missed. Re-do logged questions a week later. In Module 2, do not rush the hard questions — accuracy matters more than speed.',
];

const ROADMAP = [
  // title, subtitle, badge, color, from, to, focus, description, linkBoundaries
  ['Introduction & Question Types', 'Start here · How the Digital SAT works', '★', 'sun', 200, 300, 'Test format, Modules, Question types', 'Learn how the Reading & Writing section is built: two adaptive modules, 27 questions each, and the four content domains. Your placement test result is your starting point.'],
  ['Grammar 1: Clauses', 'Standard English Conventions', 'G1', 'signal', 300, 360, 'Boundaries, Independent vs dependent clauses, Run-ons', 'Spot complete sentences, fix run-ons and comma splices, and join clauses correctly.', true],
  ['Grammar 2: Punctuation', 'Standard English Conventions', 'G2', 'signal', 360, 420, 'Commas, Semicolons, Colons, Dashes, Apostrophes', 'Every punctuation mark the SAT tests and exactly when each one is allowed.'],
  ['Grammar 3: Form, Structure & Sense', 'Standard English Conventions', 'G3', 'signal', 420, 480, 'Subject-verb agreement, Verb tense, Pronouns, Modifiers', 'Agreement, tense, pronoun and modifier rules that decide the hardest grammar questions.'],
  ['Transitions', 'Expression of Ideas', 'Tr', 'sky', 480, 530, 'Contrast, Cause and effect, Addition, Example', 'Read the relationship between two sentences and choose the transition that fits it.'],
  ['Rhetorical Synthesis', 'Expression of Ideas', 'RS', 'sky', 530, 580, 'Student notes, Goal-based answers', 'Use only the notes that serve the stated goal — a fast-points question type once you know the method.'],
  ['Words in Context', 'Craft and Structure', 'W', 'night', 580, 630, 'Precise vocabulary, Context clues', 'Predict the word from context before reading the options.'],
  ['Text Structure & Purpose', 'Craft and Structure', 'TS', 'night', 630, 670, 'Function of a sentence, Author purpose', 'Describe what a text or one of its sentences is doing, not only what it says.'],
  ['Cross-Text Connections', 'Craft and Structure', 'CT', 'night', 670, 700, 'Paired texts, Agreement and disagreement', 'Compare two short texts and predict how one author would respond to the other.'],
  ['Main Idea, Evidence & Inference', 'Information and Ideas', 'II', 'white', 700, 750, 'Main idea, Command of Evidence, Inference, Graphs', 'Support claims with textual and quantitative evidence and complete the logic of a passage.'],
  ['Full-Length Mock Exams', 'Final stretch · 750 → 800', 'M', 'sun', 750, 800, 'Timed modules, Error log, Hard module strategy', 'Full timed practice under test conditions and a review routine for every mistake.'],
];

async function insertQuestions(t, quizId, list) {
  for (let i = 0; i < list.length; i++) {
    const q = list[i];
    await t.run(
      'INSERT INTO questions (quiz_id, position, passage, prompt, opt_a, opt_b, opt_c, opt_d, correct, explanation, tip, topic) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      [quizId, i, q.passage, q.prompt, q.o[0], q.o[1], q.o[2], q.o[3], q.c, q.e, q.tip || '', q.t]
    );
  }
}

export async function seed() {
  const { c } = await db.one('SELECT COUNT(*) AS c FROM users');
  if (c || (await db.one("SELECT 1 AS x FROM settings WHERE key = '_seeded'"))) return false;

  const masterLogin = process.env.MASTER_LOGIN || 'master';
  const masterPass = process.env.MASTER_PASSWORD || 'master123';

  await db.tx(async (t) => {
    // hosted without MASTER_PASSWORD: no default teacher — the MASTER_EMAIL owner signs up and becomes the teacher
    const master = (process.env.VERCEL && !process.env.MASTER_PASSWORD) ? null : (await t.run("INSERT INTO users (name, login, password_hash, role, provider) VALUES (?, ?, ?, 'master', 'teacher') RETURNING id",
      ['Teacher', masterLogin, bcrypt.hashSync(masterPass, 10)])).id;

    const g = (await t.run('INSERT INTO groups (name) VALUES (?) RETURNING id', ['Happy Smurfs | PRE-eng'])).id;
    const demo = !process.env.VERCEL; // hosted: no demo student account
    const subUntil = new Date(Date.now() + 60 * 86400e3).toISOString();
    const student = demo && (await t.run(
      "INSERT INTO users (name, login, password_hash, role, provider, group_id, target_english, target_math, exam_date, diagnostic_score, cefr, admitted, placement_at, sub_until, sub_plan) VALUES (?, ?, ?, 'student', 'teacher', ?, 750, 800, '2027-03-06', 520, 'B2', true, now(), ?, 'month') RETURNING id",
      ['Shukurullo Shokiraliyev', 'shukurullo', bcrypt.hashSync('student123', 10), g, subUntil]
    )).id;
    if (student) await t.run("INSERT INTO payments (user_id, provider, plan, days, amount, note, created_by) VALUES (?, 'manual', 'month', 60, 0, 'Demo account', ?)", [student, master]);

    const quiz = (await t.run("INSERT INTO quizzes (title, section, kind, is_public, duration_min, created_by) VALUES (?, 'english', 'practice', true, 12, ?) RETURNING id",
      ['Boundaries 1 Fast Quiz', master])).id;
    await t.run('INSERT INTO quiz_groups (quiz_id, group_id) VALUES (?, ?)', [quiz, g]);
    await insertQuestions(t, quiz, BOUNDARIES);


    for (let i = 0; i < ROADMAP.length; i++) {
      const [title, subtitle, badge, color, from, to, focus, description, link] = ROADMAP[i];
      const step = (await t.run(
        'INSERT INTO roadmap_steps (position, title, subtitle, badge, color, score_from, score_to, focus, description) VALUES (?,?,?,?,?,?,?,?,?) RETURNING id',
        [i, title, subtitle, badge, color, from, to, focus, description]
      )).id;
      const items = [['reading', 'Study notes', null, NOTES[i] || description]];
      if (link) items.push(['quiz', 'Level check: Boundaries', quiz, '']);
      for (let k = 0; k < items.length; k++) {
        const [kind, ititle, qid, body] = items[k];
        await t.run('INSERT INTO roadmap_items (step_id, position, kind, title, quiz_id, body) VALUES (?,?,?,?,?,?)', [step, k, kind, ititle, qid, body]);
      }
    }

    if (student) await t.run('INSERT INTO portfolio (user_id, title, category, description, date) VALUES (?,?,?,?,?)', [
      student, 'Goal: Carnegie Mellon Qatar', 'Goal', 'Target SAT 1550 (Math 800, English 750). Exam day: Mar 6, 2027.', '2026-10-01',
    ]);
  });
  await db.run("INSERT INTO settings (key, value) VALUES ('_seeded', '1') ON CONFLICT (key) DO NOTHING");
  return { masterLogin, masterPass };
}

if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  const { migrate } = await import('./db.js');
  await migrate();
  const r = await seed();
  console.log(r ? `Seeded. Teacher login: ${r.masterLogin} / ${r.masterPass}` : 'Database already has users; nothing to do.');
  process.exit(0);
}
