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
