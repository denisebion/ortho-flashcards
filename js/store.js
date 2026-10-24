// Saved progress, kept in the browser's localStorage and backed up as a JSON file.
//
// Stored shape:  { version: 1, cards: { <card id>: record }, settings: {...} }
// Records are keyed by the card IDs made by tools/import_cards.py, so adding CSVs later
// never touches existing progress. Records for cards no longer in cards.json are kept.

const KEY = 'ortho-flashcards-progress-v1';
const EXPORT_APP = 'ortho-flashcards';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const emptyData = () => ({ version: 1, cards: {}, settings: {} });

// Accept only well-formed records (an imported file may be hand-edited or from a newer app).
function cleanRecord(r) {
  if (!r || typeof r !== 'object') return null;
  const int = (v, max) => Number.isInteger(v) && v >= 0 && v <= max;
  if (typeof r.due !== 'string' || !DATE_RE.test(r.due)) return null;
  if (typeof r.last !== 'string' || Number.isNaN(Date.parse(r.last))) return null;
  if (typeof r.ease !== 'number' || r.ease < 1 || r.ease > 5) return null;
  if (!int(r.interval, 3650) || !int(r.streak, 1e6) || !int(r.again, 1e6) || !int(r.reps, 1e6)) return null;
  return { due: r.due, last: r.last, ease: r.ease, interval: r.interval, streak: r.streak, again: r.again, reps: r.reps };
}

export class ProgressStore {
  constructor() {
    this.data = emptyData();
    this.error = ''; // set when the browser won't let us read or save
  }

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.cards === 'object') {
          this.data = { ...emptyData(), ...parsed, settings: parsed.settings || {} };
        }
      }
    } catch (err) {
      this.error = 'Progress could not be read in this browser, so it will not be saved.';
    }
    return this;
  }

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
      this.error = '';
    } catch (err) {
      this.error = 'Progress could not be saved (private browsing or full storage?). Export a backup.';
    }
    return !this.error;
  }

  get cards() { return this.data.cards; }
  get settings() { return this.data.settings; }
  record(id) { return this.data.cards[id]; }
  setRecord(id, record) { this.data.cards[id] = record; }

  reset() {
    this.data = emptyData();
    return this.save();
  }

  // ---- backup file

  exportJson() {
    return JSON.stringify({
      app: EXPORT_APP, version: 1, exportedAt: new Date().toISOString(), cards: this.data.cards,
    }, null, 1);
  }

  // Merge a backup into current progress: for each card the most recently reviewed
  // record wins, so importing an old backup never overwrites newer reviews, and
  // progress from two devices can be combined. (To fully replace, Reset first.)
  importJson(text) {
    let file;
    try { file = JSON.parse(text); } catch (err) { throw new Error('That file is not valid JSON.'); }
    if (!file || file.app !== EXPORT_APP || typeof file.cards !== 'object' || !file.cards) {
      throw new Error('That does not look like a progress file from this app.');
    }
    const result = { added: 0, updated: 0, unchanged: 0, invalid: 0 };
    for (const [id, raw] of Object.entries(file.cards)) {
      const incoming = cleanRecord(raw);
      if (!incoming) { result.invalid++; continue; }
      const existing = this.data.cards[id];
      if (!existing) { this.data.cards[id] = incoming; result.added++; }
      else if (Date.parse(incoming.last) > Date.parse(existing.last)) { this.data.cards[id] = incoming; result.updated++; }
      else result.unchanged++;
    }
    this.save();
    return result;
  }
}
