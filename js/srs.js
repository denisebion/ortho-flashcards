// Spaced repetition: a simplified SM-2. Pure functions, no DOM or storage.
//
// A card with no saved record is "new". Each record is:
//   { due: "2026-10-24", last: <ISO timestamp>, ease, interval (days), streak, again, reps }
//
// Rules (intervals are whole days):
//   Again  -> interval 0, due today, so the card comes back in this session. Counts as a lapse.
//   new / relearning card (interval 0):  Hard 1d, Good 1d, Easy 3d
//   review card:  Hard  = interval x 1.2 (at least +1 day), ease -0.15
//                 Good  = interval x ease (at least +1 day)
//                 Easy  = interval x ease x 1.3 (at least +2 days), ease +0.15
//   Rating Again on a review card also lowers its ease by 0.2.

export const START_EASE = 2.5;
export const MIN_EASE = 1.3;
export const MAX_INTERVAL = 365; // days; the exam is never that far away

const pad = (n) => String(n).padStart(2, '0');

// Local calendar date as "YYYY-MM-DD" (so "due today" follows my own midnight, not UTC)
export function todayStr(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return todayStr(new Date(y, m - 1, d + days));
}

// What interval (days) a rating would give. 0 means "again this session".
export function nextInterval(record, grade) {
  if (grade === 'again') return 0;
  const interval = record ? record.interval : 0;
  const ease = record ? record.ease : START_EASE;
  if (interval < 1) return grade === 'easy' ? 3 : 1;
  let days;
  if (grade === 'hard') days = Math.max(interval + 1, Math.round(interval * 1.2));
  else if (grade === 'good') days = Math.max(interval + 1, Math.round(interval * ease));
  else days = Math.max(interval + 2, Math.round(interval * ease * 1.3));
  return Math.min(days, MAX_INTERVAL);
}

// The record after rating a card. `record` is undefined for a new card.
export function schedule(record, grade, now = new Date()) {
  const r = record
    ? { ...record }
    : { ease: START_EASE, interval: 0, streak: 0, again: 0, reps: 0 };
  const today = todayStr(now);
  const wasReview = r.interval >= 1;

  r.last = now.toISOString();
  r.reps += 1;

  if (grade === 'again') {
    r.again += 1;
    r.streak = 0;
    if (wasReview) r.ease = Math.max(MIN_EASE, r.ease - 0.2);
    r.interval = 0;
    r.due = today;
    return r;
  }

  const days = nextInterval(record, grade);
  if (wasReview && grade === 'hard') r.ease = Math.max(MIN_EASE, r.ease - 0.15);
  if (wasReview && grade === 'easy') r.ease += 0.15;
  r.streak += 1;
  r.interval = days;
  r.due = addDays(today, days);
  return r;
}

// Label for under a rating button: "1d", "6d", "2mo"
export function formatInterval(days) {
  if (days < 1) return 'soon';
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return '1y';
}
