// Study session logic: the queue, "Again" re-queuing, and the end-of-session summary.
// No DOM in here, so it is easy to reason about (and to hook scheduling into in Phase 4
// through the onRate callback).

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

// Without shuffle: the cards I missed most often on quizzes come first, then the
// most recently logged.
function byPriority(cards) {
  const last = (c) => c.dates[c.dates.length - 1] || '';
  return [...cards].sort((a, b) => b.missed - a.missed || last(b).localeCompare(last(a)));
}

export class Session {
  constructor(cards, { shuffle = true, onRate = null } = {}) {
    this.cards = cards;
    this.queue = shuffle ? shuffled(cards) : byPriority(cards);
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
