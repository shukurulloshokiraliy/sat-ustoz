/**
 * Official SAT Weekend test dates (College Board, satsuite.collegeboard.org/sat/dates-deadlines, checked Nov 2026).
 * The same dates apply to U.S. and international students, including Uzbekistan.
 * `confirmed: false` = anticipated by College Board, registration not open yet.
 * Update this list when College Board publishes new dates.
 */
export const SAT_DATES = [
  { date: '2026-10-03', reg: '2026-09-18', late: '2026-09-22', confirmed: true },
  { date: '2026-11-07', reg: '2026-10-23', late: '2026-10-27', confirmed: true },
  { date: '2026-12-05', reg: '2026-11-20', late: '2026-11-24', confirmed: true },
  { date: '2027-03-06', reg: '2027-02-19', late: '2027-02-23', confirmed: true },
  { date: '2027-05-01', reg: '2027-04-16', late: '2027-04-20', confirmed: true },
  { date: '2027-06-05', reg: '2027-05-21', late: '2027-05-25', confirmed: true },
  { date: '2027-08-28', reg: null, late: null, confirmed: false },
  { date: '2027-09-18', reg: null, late: null, confirmed: false },
  { date: '2027-10-09', reg: null, late: null, confirmed: false },
  { date: '2027-11-06', reg: null, late: null, confirmed: false },
  { date: '2027-12-04', reg: null, late: null, confirmed: false },
];

/** Test centres in Uzbekistan start around 8:00 local time (UTC+5). */
export const examStart = (date) => new Date(`${date}T08:00:00+05:00`);
const today = () => new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
export const upcomingSatDates = () => SAT_DATES.filter((d) => d.date >= today());
export const isSatDate = (d) => SAT_DATES.some((x) => x.date === d);
