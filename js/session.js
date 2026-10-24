// Study session logic: choosing and ordering the cards, "Again" re-queuing, and the
// end-of-session summary. No DOM in here.

export const GRADES = ['again', 'hard', 'good', 'easy']; // keys 1-4
const AGAIN_GAP = 4; // an "Again" card comes back after this many other cards

function shuffled(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const lastLogged = (c) => c.dates[c.dates.length - 1] || '';

// Most-missed-on-quizzes first, then most recently logged.
const byPriority = (a, b) => b.missed - a.missed || lastLogged(b).localeCompare(lastLogged(a));

// New cards: the ones I missed more than once on quizzes come first. With shuffle on,
// each group is shuffled but the "missed 2+" group still leads.
function orderNew(cards, shuffle) {
  if (!shuffle) return [...cards].sort(byPriority);
  const repeat = cards.filter((c) => c.missed > 1);
  const once = cards.filter((c) => c.missed <= 1);
  return [...shuffled(repeat), ...shuffled(once)];
}

// Decide what to study now.
//   cards:     the selected cards
//   getRecord: id -> saved progress record, or undefined for a new card
//   newLimit:  max new cards per session (0 = all)
// Returns { queue, dueCount, newCount, newWaiting, nextDue }. Due reviews come first,
// then new cards.
export function planSession(cards, getRecord, { today, shuffle, newLimit }) {
  const due = [];
  const fresh = [];
  let nextDue = null;
  for (const card of cards) {
    const record = getRecord(card.id);
    if (!record) fresh.push(card);
    else if (record.due <= today) due.push(card);
    else if (!nextDue || record.due < nextDue) nextDue = record.due;
  }

  const dueOrdered = shuffle
    ? shuffled(due)
    : due.sort((a, b) => getRecord(a.id).due.localeCompare(getRecord(b.id).due) || byPriority(a, b));
  const newOrdered = orderNew(fresh, shuffle);
  const newTaken = newLimit > 0 ? newOrdered.slice(0, newLimit) : newOrdered;

  return {
    queue: [...dueOrdered, ...newTaken],
    dueCount: due.length,
    newCount: newTaken.length,
    newWaiting: fresh.length - newTaken.length,
    nextDue,
  };
}

export class Session {
  // `cards` is already in the order to study. onRate(card, grade) is called for every
  // rating (the app uses it to schedule and save).
  constructor(cards, { onRate = null } = {}) {
    this.cards = cards;
    this.queue = [...cards];
    this.onRate = onRate;
    this.firstGrade = new Map(); // card id -> grade given the first time it was shown
    this.finished = new Set(); // card ids rated Hard/Good/Easy at least once
    this.againIds = new Set();
  }

  get total() { return this.cards.length; }
  get done() { return this.finished.size; }
  get current() { return this.queue[0] || null; }
  get isComplete() { return this.queue.length === 0; }

  rate(grade) {
    const card = this.queue.shift();
    if (!this.firstGrade.has(card.id)) this.firstGrade.set(card.id, grade);
    if (grade === 'again') {
      this.againIds.add(card.id);
      this.queue.splice(Math.min(AGAIN_GAP, this.queue.length), 0, card);
    } else {
      this.finished.add(card.id);
    }
    if (this.onRate) this.onRate(card, grade);
  }

  summary() {
    const grades = [...this.firstGrade.values()];
    const goodEasy = grades.filter((g) => g === 'good' || g === 'easy').length;
    return {
      reviewed: grades.length,
      goodEasyPct: grades.length ? Math.round((100 * goodEasy) / grades.length) : 0,
      againCards: this.cards.filter((c) => this.againIds.has(c.id)),
    };
  }
}
