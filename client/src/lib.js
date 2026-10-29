export const estimateLabel = (correct, total) => {
  if (!total) return '—';
  return Math.max(200, Math.min(800, Math.round((200 + (correct / total) * 600) / 10) * 10));
};

/** How ready a student is for an SAT-level course, from the readiness-check score. */
export function readiness(score) {
  if (score == null) return null;
  if (score >= 650) return { level: 4, title: 'Advanced', text: 'You are ready for the hardest material. Focus on timed modules and the 700–800 steps of the roadmap.' };
  if (score >= 520) return { level: 3, title: 'SAT-ready', text: 'Your English is at SAT level. Follow the roadmap step by step and keep an error log.' };
  if (score >= 400) return { level: 2, title: 'Ready with support', text: 'You can start the course. Begin with the grammar steps and build accuracy before speed.' };
  return { level: 1, title: 'Build foundations first', text: 'This course is designed for SAT-level English. Start with the first steps and keep strengthening general English (B1–B2) alongside them.' };
}

/** The four SAT Reading & Writing content domains (College Board), from a question's topic/skill. */
export const DOMAINS = ['Information and Ideas', 'Craft and Structure', 'Expression of Ideas', 'Standard English Conventions'];
export function domainOf(topic = '') {
  const t = topic.toLowerCase();
  if (/(boundar|punctuat|form|structure, and sense|structure and sense|grammar|agreement|tense|pronoun|modifier|convention|clause)/.test(t)) return 'Standard English Conventions';
  if (/(transition|rhetorical|synthesis)/.test(t)) return 'Expression of Ideas';
  if (/(words in context|vocab|text structure|purpose|cross[- ]text|craft)/.test(t)) return 'Craft and Structure';
  if (/(main idea|central|detail|evidence|inference|quantitative|information)/.test(t)) return 'Information and Ideas';
  return null;
}

/** Renders SAT blanks (“______”) as a styled gap. Returns an array of strings / elements for React. */
export function withBlanks(text, Blank) {
  return String(text || '').split(/(_{3,})/).map((part, i) => (/^_{3,}$/.test(part) ? Blank(i) : part));
}
