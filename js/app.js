// App shell: home screen (topic chips, options, backup), study screen (flip + rate),
// end-of-session screen. State lives in the `state` object; each screen is redrawn
// from it by a render function.

import { loadData } from './data.js';
import { Session, GRADES, planSession } from './session.js';
import { ProgressStore } from './store.js';
import { schedule, nextInterval, formatInterval, todayStr, addDays } from './srs.js';
import { h, tint, cardText, loggedLine, shortDate } from './render.js';
import { repoFromLocation, repoLinks } from './help.js';

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
  $('total').textContent = `${cards.length} cards · ${reviewed} reviewed`
    + (state.data.generated ? ` · cards updated ${shortDate(state.data.generated)}` : '');
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
  const { reviewed, goodEasyPct, counts, againCards } = state.session.summary();
  $('done-stats').replaceChildren(
    h('div', { class: 'stat' }, h('strong', null, String(reviewed)), 'cards reviewed'),
    h('div', { class: 'stat' }, h('strong', null, `${goodEasyPct}%`), 'Good or Easy first try'),
  );
  $('done-breakdown').replaceChildren(...GRADES.map((g) =>
    h('span', { class: `pill ${g}` }, `${GRADE_LABELS[g]} ${counts[g]}`)));

  // what's waiting tomorrow: reviews due by then (anything left over from today counts too)
  const tomorrow = addDays(todayStr(), 1);
  const soon = selectedCards().filter((c) => { const r = store.record(c.id); return r && r.due <= tomorrow; }).length;
  $('done-next').textContent = soon
    ? `${soon} card${soon === 1 ? '' : 's'} will be due by tomorrow.`
    : 'Nothing due tomorrow.';

  const list = $('again-list');
  list.replaceChildren(...againCards.map((c) => h('li', { style: `--accent:${topicOf(c).color}` },
    h('span', { class: 'dot', title: topicOf(c).label }), plainText(c))));
  $('again-section').hidden = againCards.length === 0;
  $('study-again').onclick = () => startSession(againCards);
  show('done');
}

// Full sentence with answers filled in, as plain text
const plainText = (card) => card.parts.map((p) => (p.t === 'text' ? p.v : p.a)).join('');

// ------------------------------------------------------------------ "Add more cards" guide

// How to add cards: upload a CSV to the repo's data/ folder on github.com; the GitHub
// Action in .github/workflows rebuilds cards.json and republishes the app.
function renderAddCards() {
  const code = (text) => h('code', null, text);
  const tags = state.data.topics.flatMap((t) => t.tags || []);
  const repo = repoFromLocation(location.hostname, location.pathname);
  const links = repo && repoLinks(repo);
  const ext = (href, text, cls) => h('a', { href, target: '_blank', rel: 'noopener', class: cls }, text);

  $('add-cards-body').replaceChildren(
    h('p', { class: 'muted' },
      'New cards are added by uploading a CSV file to GitHub. The app then rebuilds itself in a minute or two. Your study progress is kept.'),
    h('ol', { class: 'steps' },
      h('li', null,
        h('strong', null, 'Make a CSV file. '),
        'Start from the ', h('a', { href: 'data/TEMPLATE.csv', download: 'TEMPLATE.csv' }, 'template'),
        ' (no header row, three columns, saved as UTF-8):',
        h('ul', null,
          h('li', null, h('b', null, 'Card text'), ' with the answer in a cloze: ', code('Walch B2 glenoid = {{c1::biconcave}} erosion')),
          h('li', null, h('b', null, 'Extra'), ': ', code('💡 your tip<br><small>Logged 9/6</small>'),
            ' (missed more than once? ', code('Logged 9/6, 9/21'), ')'),
          h('li', null, h('b', null, 'Tag'), ': one of ', tags.flatMap((t) => [code(t), ' ']),
            'or leave it empty and name the file after the topic, like ', code('spine_extra.csv'), '.'))),
      h('li', null,
        h('strong', null, 'Upload it to GitHub. '),
        links
          ? [ext(links.upload, 'Open the upload page', 'link-btn'),
             ' Sign in if asked, drag your CSV in, then press ', h('b', null, 'Commit changes'), '.']
          : 'On github.com open this app\'s repository, go to the data folder, choose Add file → Upload files, drag your CSV in and press Commit changes.',
        ' Any file name ending in .csv works. Cards you already have are merged, not duplicated.'),
      h('li', null,
        h('strong', null, 'Wait a minute or two, '),
        'then close and reopen this app while online. The line at the top of this screen shows when the cards were last updated, and new cards show up in the "new" count.'),
      h('li', null,
        h('strong', null, 'Something missing? '),
        links
          ? ['Open the latest run on the ', ext(links.actions, 'Actions page'), ' and read its summary.']
          : 'Open the latest run under the repository\'s Actions tab and read its summary.',
        ' It lists any skipped rows and tags that weren\'t recognised.')),
  );
}

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

// Keyboard (laptop):
//   study:  Space/Enter flip, 1-4 rate, Esc back to home (progress is already saved)
//   home / end screen:  Enter = Start / Back to home (unless a control has focus)
function onKey(e) {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (!views.study.hidden) {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault(); // also stops a focused button from being "clicked" by the key
      flip();
    } else if (e.key >= '1' && e.key <= '4') {
      rate(GRADES[Number(e.key) - 1]);
    } else if (e.key === 'Escape') {
      goHome();
    }
  } else if (e.key === 'Enter' && !(e.target instanceof Element && e.target.closest('button, select, summary, input, a'))) {
    if (!views.home.hidden && !$('start').disabled) $('start').click();
    else if (!views.done.hidden) goHome();
  }
}

function goHome() {
  show('home');
  renderHome();
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

  renderAddCards();
  $('shuffle').addEventListener('change', (e) => { state.shuffle = e.target.checked; saveSettings(); });
  $('new-limit').addEventListener('change', (e) => { state.newLimit = Number(e.target.value); saveSettings(); renderHome(); });
  $('start').addEventListener('click', () => startSession(currentPlan(state.shuffle).queue));
  $('exit').addEventListener('click', goHome);
  $('home-btn').addEventListener('click', goHome);
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

// Offline support + ask the browser not to evict saved progress when storage runs low.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
