/**
 * Digital SAT Reading & Writing score estimate (200–800), built the way the real test is scored:
 *
 *  1. Every question is an IRT item (3-parameter logistic model):
 *       P(correct | θ) = c + (1 − c) / (1 + e^(−a(θ − b)))
 *     a = discrimination, b = difficulty, c = guessing (4 choices → 0.25).
 *     We do not have College Board's item parameters, so each question gets typical values for its level
 *     (easy / medium / hard): harder questions count more, a lucky right answer on a hard one counts less.
 *  2. Ability θ is estimated from the whole answer pattern (expected a posteriori over a θ grid, N(0,1) prior),
 *     so two students with the same number right can get different scores.
 *  3. θ is converted to the 200–800 scale with an equating table anchored to published practice-test
 *     conversions (≈ 10/50 → 330, 20 → 450, 25 → 500, 30 → 560, 40 → 660, 45 → 735, 50 → 800).
 *  4. Adaptive routing: on a two-module test, Module 1 below 18/27 (≈ 65%) sends you to the easier Module 2,
 *     which caps the section at about 630.
 *
 * This is an estimate: the official algorithm, item parameters and equating tables are not public.
 */

const ITEM = {
  easy: { a: 1.0, b: -1.1 },
  medium: { a: 1.15, b: 0.0 },
  hard: { a: 1.3, b: 1.2 },
};
const GUESS = 0.25;
export const ROUTE_CUT = 18 / 27; // share of Module 1 needed for the harder Module 2
export const EASY_PATH_CAP = 630;

// θ → scaled score (piecewise linear; anchored to the raw→scaled points above)
const SCALE = [[-2.5, 200], [-1.77, 330], [-0.85, 450], [-0.4, 500], [0.06, 560], [0.62, 625], [1.0, 660], [1.62, 735], [2.18, 780], [2.6, 800]];
const toScale = (t) => {
  if (t <= SCALE[0][0]) return 200;
  for (let i = 1; i < SCALE.length; i++) {
    const [t1, s1] = SCALE[i]; const [t0, s0] = SCALE[i - 1];
    if (t <= t1) return s0 + ((t - t0) / (t1 - t0)) * (s1 - s0);
  }
  return 800;
};
const round10 = (x) => Math.max(200, Math.min(800, Math.round(x / 10) * 10));
const p3 = (t, { a, b }) => GUESS + (1 - GUESS) / (1 + Math.exp(-a * (t - b)));
const lv = (d) => ITEM[String(d || '').toLowerCase()] || ITEM.medium;

/** θ estimate (EAP) and its standard error from a list of { correct, difficulty }. */
export function ability(items) {
  let sw = 0, st = 0, st2 = 0;
  for (let t = -4; t <= 4.0001; t += 0.05) {
    let ll = -0.5 * t * t;
    for (const it of items) { const p = p3(t, lv(it.difficulty)); ll += Math.log(it.correct ? p : 1 - p); }
    const w = Math.exp(ll); sw += w; st += w * t; st2 += w * t * t;
  }
  const theta = st / sw;
  return { theta, se: Math.sqrt(Math.max(0, st2 / sw - theta * theta)) };
}

/**
 * Score a set of answers.
 * items: [{ correct: boolean, difficulty?: 'easy'|'medium'|'hard', module?: 1|2 }]
 * Returns { score, low, high, raw, total, theta, route } where route is 'hard', 'easy' or null (one module only).
 */
export function satScore(items) {
  const list = (items || []).filter(Boolean);
  if (!list.length) return null;
  const { theta, se } = ability(list);
  let score = toScale(theta);
  let route = null;
  const m1 = list.filter((x) => x.module === 1);
  if (m1.length && list.some((x) => x.module === 2)) {
    route = m1.filter((x) => x.correct).length / m1.length >= ROUTE_CUT ? 'hard' : 'easy';
    if (route === 'easy') score = Math.min(score, EASY_PATH_CAP);
  }
  const spread = Math.max(20, Math.min(90, (toScale(theta + se) - toScale(theta - se)) / 2));
  const raw = list.filter((x) => x.correct).length;
  return { score: round10(score), low: round10(score - spread), high: round10(Math.min(route === 'easy' ? EASY_PATH_CAP : 800, score + spread)), raw, total: list.length, theta: Math.round(theta * 100) / 100, route };
}

/** When only "x of n correct" is known (old results), assume a typical mix of easy, medium and hard questions. */
export function satScoreFromCount(correct, total) {
  if (!total) return null;
  const mix = ['easy', 'medium', 'medium', 'hard'];
  const items = Array.from({ length: total }, (_, i) => ({ difficulty: mix[i % 4] }));
  // give the right answers to the easiest questions first, the usual pattern
  const order = items.map((x, i) => i).sort((i, j) => ITEM[items[i].difficulty].b - ITEM[items[j].difficulty].b);
  order.slice(0, correct).forEach((i) => { items[i].correct = true; });
  return satScore(items);
}
