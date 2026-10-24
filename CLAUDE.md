# Ortho Flashcard App

Personal flashcard web app for OITE questions I've missed. Full spec and build phases:
`FLASHCARD_APP_PLAN.md`. Work phase by phase and check in after each; ask before adding
dependencies or changing the tech approach; keep code simple and commented; commit after
each phase.

## Tech
- Static web app: vanilla HTML/CSS/JS (ES modules), no build step, no backend, no framework.
- Import script: Python 3 standard library only (`tools/import_cards.py`). Node is not installed.
- Local dev: `python3 -m http.server` in the project root (`cards.json` is fetched at runtime).
- Deploy: GitHub Pages from the repo root (Phase 6). No `gh` CLI; the user creates/pushes the repo.
- Use lowercase folder names (`data/`): GitHub Pages is case-sensitive.

## Layout
- `data/*.csv`: source CSVs (never modify). `data/TEMPLATE.csv` is an example, ignored by the import.
- `topics.json`: tag -> topic mapping, topic colors, subtopic labels. Edit this, not code.
- `tools/import_cards.py`: all CSVs -> `cards.json` (+ `import-summary.txt`). Idempotent.
- `cards.json`: generated; the app loads it. Don't hand-edit.
- Study progress lives in the browser (localStorage), keyed by card id; the import never touches it.

## App files
- `index.html`: three views (home, study, done), toggled by `hidden`.
- `css/style.css`: mobile-first styles; topic color comes in as `--accent` per chip/card.
- `js/app.js`: state + screens (home chips, study, end summary) + keyboard (Space/Enter flip, 1-4 rate).
- `js/session.js`: no DOM. `planSession` picks the queue: due reviews first, then new cards
  (those missed 2+ times on quizzes lead; capped by "new cards per session", default 20, 0 = all).
  `Session` runs the queue: "Again" re-queues after 4 cards; `onRate(card, grade)` hook; summary.
- `js/srs.js`: pure simplified SM-2 (rules in the file header). Day-granularity; "Again" = due today.
- `js/store.js`: `ProgressStore` over localStorage key `ortho-flashcards-progress-v1`
  (`{version, cards:{id:record}, settings}`), JSON export/import. Import merges: newest `last` wins per card.
- `js/render.js`: DOM helper `h()` (text only, never innerHTML) and cloze front/back rendering.
- `js/data.js`: loads `topics.json` + `cards.json`.
- Run locally: `python3 -m http.server 8123` then open http://localhost:8123 (`.claude/launch.json` has this).
- Progress record per card: `{due, last, ease, interval, streak, again, reps}`. Every rating is saved immediately.
  Settings saved with it: selected topics, shuffle, new-cards limit.
- `sw.js`: service worker, network-first with cache fallback (4s timeout), so online always gets the
  latest files and offline uses the last copy; no version number to bump. `PRECACHE` lists the app
  shell: **add new app files (js/css/icons) to that list**. Cache name `ortho-flashcards-v1`.
- `manifest.webmanifest` + `icons/` (made by `python3 tools/make_icons.py`): installable PWA. All paths in
  the app are relative so it also works from a GitHub Pages subpath (user.github.io/repo/).
- Keyboard: Space/Enter flip, 1-4 rate, Esc exit session, Enter on home = Start / on end screen = home.
- Status: Phases 1-5 done. Next: Phase 6 (deploy to GitHub Pages + README).
- Testing a service worker in the preview browser: unregister it and delete caches afterwards
  (`navigator.serviceWorker.getRegistrations()`, `caches.keys()`) so it doesn't confuse later checks.
- Browser storage is per origin and per install: the iPhone home-screen app and Safari tabs do NOT share
  progress, so use Export/Import to move between them.

## CSV format (no header, 3 columns)
1. card text with Anki clozes: `{{c1::answer}}` / `{{c1::answer::hint}}`, multiple allowed
2. `💡 tip<br><small>Logged 9/6, 9/21</small>`: dates have no year (most recent non-future year is used); number of dates = times missed
3. tag `OITE::<Topic>`; optional, topic can come from the file name (`spine_extra.csv`)

## cards.json
`{version, generated, cards:[{id, topic, tag, subtopic, text, parts, tip, dates, missed, sources}]}`
- `id`: `c` + first 12 hex of sha256 of whitespace-normalised card text (topic-independent, so
  re-tagging keeps progress; editing the text makes a new card).
- `parts`: `[{t:"text",v}, {t:"cloze",n,a,h}]`, so the app never parses cloze syntax.
- `tip`, `text`, answers are plain text with no HTML: the app must escape them (use `textContent`).
- `dates`: ISO strings; `missed` = number of dates.

## Topic mapping (topics.json)
HFA Hand, Foot & Ankle = Hand_Wrist + Foot_Ankle · SE Shoulder & Elbow · KS Knee & Sports = Sports ·
SPINE · BS Basic Science · PATH Pathology = Oncology · PEDS Pediatrics · TRAUMA · RECON.
Unknown tags -> UNSORTED. Counts now: HFA 42, SE 31, KS 39, SPINE 31, BS 6, PATH 29, PEDS 26, TRAUMA 21, RECON 21.

## Adding cards
Drop a CSV in `data/`, run `python3 tools/import_cards.py`, read the summary, commit `cards.json`.
