// App shell: home screen (topic chips, options, backup), study screen (flip + rate),
// end-of-session screen. State lives in the `state` object; each screen is redrawn
// from it by a render function.

import { loadData } from './data.js';
import { Session, GRADES, planSession } from './session.js';
import { ProgressStore } from './store.js';
import { schedule, nextInterval, formatInterval, todayStr } from './srs.js';
import { h, tint, cardText, loggedLine, shortDate } from './render.js';

const GRADE_LABELS = { again: 'Again', hard: 'Hard', good: 'Good', easy: 'Easy' };
const FALLBACK_TOPIC = { label: 'Unsorted', color: '#888888' };
const NEW_LIMITS = [10, 20, 50, 0]; // 0 = all
const DEFAULT_NEW_LIMIT = 20;

const store = new ProgressStore().load();

const state = {
  data: null,
  selected: new Set(), // topic ids; empty set = "All"
  shuffle: store.settings.shuffle !== false,
  newLimit: NEW_LIMITS.includes(store.settings.newLimit) ? store.settings.newLimit : DEFAULT_NEW_LIMIT,
  session: null,
  flipped: false,
};

const $ = (id) => document.getElementById(id);
const views = { home: $('home'), study: $('study'), done: $('done') };

function show(name) {
  for (const [key, el] of Object.entries(views)) el.hidden = key !== name;
  window.scrollTo(0, 0);
}

const topicOf = (card) => state.data.topicById[card.topic] || FALLBACK_TOPIC;
const selectedCards = () => state.selected.size
  ? state.data.cards.filter((c) => state.selected.has(c.topic))
  : state.data.cards;

// Remember topic selection, shuffle and new-card limit between visits.
function saveSettings() {
  Object.assign(store.settings, {
    selected: [...state.selected], shuffle: state.shuffle, newLimit: state.newLimit,
  });
  store.save();
  renderWarning();
}

function renderWarning() {
  $('storage-warning').textContent = store.error;
  $('storage-warning').hidden = !store.error;
}

// ------------------------------------------------------------------ home

function renderHome() {
  const { topics, cards } = state.data;
  const count = (id) => cards.filter((c) => c.topic === id).length;

  const chip = (label, n, color, pressed, onclick) => h('button', {
    class: 'chip', type: 'button', 'aria-pressed': String(pressed), onclick,
    style: color ? `--accent:${color}; --accent-soft:${tint(color, 0.16)}` : null,
  }, color && h('span', { class: 'dot' }), label, h('span', { class: 'count' }, n));

  $('chips').replaceChildren(
    chip('All', cards.length, null, state.selected.size === 0, () => {
      state.selected.clear();
      saveSettings();
      renderHome();
    }),
    ...topics.map((t) => chip(t.label, count(t.id), t.color, state.selected.has(t.id), () => {
      if (!state.selected.delete(t.id)) state.selected.add(t.id);
      // picking every topic is the same as "All"
      if (state.selected.size === topics.length) state.selected.clear();
      saveSettings();
      renderHome();
    })),
  );

  const reviewed = cards.filter((c) => store.record(c.id)).length;
  $('total').textContent = `${cards.length} cards · ${reviewed} reviewed`;
  $('shuffle').checked = state.shuffle;
  $('new-limit').value = String(state.newLimit);

  const plan = currentPlan(false);
  const n = plan.queue.length;
  $('due').textContent = n ? `${n} card${n === 1 ? '' : 's'} to study` : 'All caught up';
  $('due-detail').textContent = n
    ? [`${plan.dueCount} due`, `${plan.newCount} new`, plan.newWaiting && `${plan.newWaiting} more new waiting`]
        .filter(Boolean).join(' · ')
    : plan.nextDue ? `Next card due ${shortDate(plan.nextDue)}` : 'Nothing selected';
  $('start').disabled = n === 0;
  renderWarning();
}

function currentPlan(shuffle) {
  return planSession(selectedCards(), (id) => store.record(id),
    { today: todayStr(), shuffle, newLimit: state.newLimit });
}

function startSession(cards) {
  state.session = new Session(cards, { onRate: saveRating });
  state.flipped = false;
  show('study');
  renderStudy();
}

// Every rating is scheduled and saved straight away, so closing the app mid-session loses nothing.
function saveRating(card, grade) {
  store.setRecord(card.id, schedule(store.record(card.id), grade));
  store.save();
  renderWarning();
}

// ------------------------------------------------------------------ study

function renderStudy() {
  const session = state.session;
  if (session.isComplete) return renderDone();

  const card = session.current;
  const topic = topicOf(card);
  const flipped = state.flipped;

  $('progress-text').textContent = `${session.done} / ${session.total}`;
  $('progress-bar').style.width = `${(100 * session.done) / session.total}%`;

  // Hand, Foot & Ankle · Foot/Ankle   (subtopic only when it adds information)
  const subtopic = card.subtopic && card.subtopic !== topic.label ? ` · ${card.subtopic}` : '';
  const face = h('article', {
    class: 'card' + (flipped ? ' flipped' : ''),
    style: `--accent:${topic.color}; --accent-soft:${tint(topic.color, 0.2)}`,
    onclick: flipped ? null : flip,
  },
    h('div', { class: 'card-meta' },
      h('span', { class: 'topic-tag' }, topic.label + subtopic),
      card.missed > 1 && h('span', { class: 'missed' }, `Missed ${card.missed}×`)),
    cardText(card, flipped ? 'back' : 'front'),
    flipped && card.tip && h('div', { class: 'tip' }, h('span', { class: 'bulb', 'aria-hidden': 'true' }, '💡'), card.tip),
    flipped && loggedLine(card) && h('p', { class: 'logged' }, loggedLine(card)),
  );
  $('card-area').replaceChildren(face);
  $('card-area').scrollTop = 0;

  const record = store.record(card.id);
  $('actions').replaceChildren(...(flipped
    ? GRADES.map((g, i) => h('button', { class: `rate ${g}`, type: 'button', onclick: () => rate(g) },
        h('span', null, GRADE_LABELS[g], h('kbd', null, String(i + 1))),
        h('span', { class: 'next' }, formatInterval(nextInterval(record, g)))))
    : [h('button', { class: 'reveal', type: 'button', onclick: flip }, 'Show answer', h('kbd', null, 'Space'))]));
}

function flip() {
  if (state.flipped || !state.session || state.session.isComplete) return;
  state.flipped = true;
  renderStudy();
  document.activeElement.blur();
}

function rate(grade) {
  if (!state.flipped) return;
  state.session.rate(grade);
  state.flipped = false;
  renderStudy();
  document.activeElement.blur();
}

// ------------------------------------------------------------------ end of session

function renderDone() {
  const { reviewed, goodEasyPct, againCards } = state.session.summary();
  $('done-stats').replaceChildren(
    h('div', { class: 'stat' }, h('strong', null, String(reviewed)), 'cards reviewed'),
    h('div', { class: 'stat' }, h('strong', null, `${goodEasyPct}%`), 'Good or Easy first try'),
  );

  const list = $('again-list');
  list.replaceChildren(...againCards.map((c) => h('li', null, plainText(c))));
  $('again-section').hidden = againCards.length === 0;
  $('study-again').onclick = () => startSession(againCards);
  show('done');
}

// Full sentence with answers filled in, as plain text
const plainText = (card) => card.parts.map((p) => (p.t === 'text' ? p.v : p.a)).join('');

// ------------------------------------------------------------------ backup / import / reset

function toolsMessage(text) {
  $('tools-msg').textContent = text;
}

function exportProgress() {
  const blob = new Blob([store.exportJson()], { type: 'application/json' });
  const link = h('a', { href: URL.createObjectURL(blob), download: `ortho-flashcards-progress-${todayStr()}.json` });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  toolsMessage(`Exported progress for ${Object.keys(store.cards).length} cards.`);
}

async function importProgress(file) {
  try {
    const r = await store.importJson(await file.text());
    toolsMessage(`Imported: ${r.added} new, ${r.updated} updated, ${r.unchanged} already up to date`
      + (r.invalid ? `, ${r.invalid} skipped (invalid).` : '.'));
    renderHome();
  } catch (err) {
    toolsMessage(err.message);
  }
}

function resetProgress() {
  if (!confirm('Erase all study progress on this device? Export a backup first if you might want it back.')) return;
  store.reset();
  toolsMessage('Progress erased.');
  renderHome();
}

// ------------------------------------------------------------------ wiring

function onKey(e) {
  if (views.study.hidden || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault(); // also stops a focused button from being "clicked" by the key
    flip();
  } else if (e.key >= '1' && e.key <= '4') {
    rate(GRADES[Number(e.key) - 1]);
  }
}

async function init() {
  try {
    state.data = await loadData();
  } catch (err) {
    $('home').replaceChildren(h('p', { class: 'error' }, `${err.message}. Run the app from a web server (see README).`));
    return;
  }

  // restore the saved topic selection (ignoring topics that no longer exist)
  const known = new Set(state.data.topics.map((t) => t.id));
  for (const id of store.settings.selected || []) if (known.has(id)) state.selected.add(id);

  $('shuffle').addEventListener('change', (e) => { state.shuffle = e.target.checked; saveSettings(); });
  $('new-limit').addEventListener('change', (e) => { state.newLimit = Number(e.target.value); saveSettings(); renderHome(); });
  $('start').addEventListener('click', () => startSession(currentPlan(state.shuffle).queue));
  $('exit').addEventListener('click', () => { show('home'); renderHome(); });
  $('home-btn').addEventListener('click', () => { show('home'); renderHome(); });
  $('export').addEventListener('click', exportProgress);
  $('import').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', (e) => {
    const [file] = e.target.files;
    e.target.value = ''; // so choosing the same file again still fires
    if (file) importProgress(file);
  });
  $('reset').addEventListener('click', resetProgress);
  document.addEventListener('keydown', onKey);
  renderHome();
  show('home');
}

init();
