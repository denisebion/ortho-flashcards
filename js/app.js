// App shell: home screen (topic chips), study screen (flip + rate), end-of-session screen.
// State lives in the `state` object; each screen is redrawn from it by a render function.

import { loadData } from './data.js';
import { Session, GRADES } from './session.js';
import { h, tint, cardText, loggedLine } from './render.js';

const GRADE_LABELS = { again: 'Again', hard: 'Hard', good: 'Good', easy: 'Easy' };
const FALLBACK_TOPIC = { label: 'Unsorted', color: '#888888' };

const state = {
  data: null,
  selected: new Set(), // topic ids; empty set = "All"
  shuffle: true,
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
      renderHome();
    }),
    ...topics.map((t) => chip(t.label, count(t.id), t.color, state.selected.has(t.id), () => {
      if (!state.selected.delete(t.id)) state.selected.add(t.id);
      // picking every topic is the same as "All"
      if (state.selected.size === topics.length) state.selected.clear();
      renderHome();
    })),
  );

  const n = selectedCards().length;
  $('due').textContent = `${n} card${n === 1 ? '' : 's'} to study`;
  $('start').disabled = n === 0;
  $('shuffle').checked = state.shuffle;
}

function startSession(cards) {
  state.session = new Session(cards, { shuffle: state.shuffle });
  state.flipped = false;
  show('study');
  renderStudy();
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

  $('actions').replaceChildren(...(flipped
    ? GRADES.map((g, i) => h('button', { class: `rate ${g}`, type: 'button', onclick: () => rate(g) },
        GRADE_LABELS[g], h('kbd', null, String(i + 1))))
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
  $('total').textContent = `${state.data.cards.length} cards`;
  $('shuffle').addEventListener('change', (e) => { state.shuffle = e.target.checked; });
  $('start').addEventListener('click', () => startSession(selectedCards()));
  $('exit').addEventListener('click', () => { show('home'); renderHome(); });
  $('home-btn').addEventListener('click', () => { show('home'); renderHome(); });
  document.addEventListener('keydown', onKey);
  renderHome();
  show('home');
}

init();
