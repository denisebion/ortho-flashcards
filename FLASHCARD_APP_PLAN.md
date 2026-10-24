# Ortho Flashcard App — Work Plan for Claude Code

> **How to use this file:** Create an empty project folder. Put this file in it, and put `ortho-progress log.csv` in a `data/` subfolder. Open Claude Code in that folder, start in **plan mode**, and say:
> *"Read FLASHCARD_APP_PLAN.md and data/ortho-progress log.csv. Confirm the data format and topic mapping with me, then propose your implementation plan before writing code."*

---

## 1. Goal

Build a personal flashcard app for studying the OITE quiz questions I've gotten wrong, from my progress log. I want to filter by topic, study efficiently, and have the app remember my progress.

The app must be easy to extend: **later I'll add more cards to any topic by dropping in a new CSV file** in the same format, without changing any code and without losing progress.

## 2. Topics

The app shows these 9 topics (use these exact labels in the UI):

| Topic | Short code | Tags in my CSV that map to it |
|---|---|---|
| Hand, Foot & Ankle | HFA | `OITE::Hand_Wrist`, `OITE::Foot_Ankle` |
| Shoulder & Elbow | SE | `OITE::Shoulder_Elbow` |
| Knee & Sports | KS | `OITE::Sports` |
| Spine | SPINE | `OITE::Spine` |
| Basic Science | BS | `OITE::Basic_Science` |
| Pathology | PATH | `OITE::Oncology` |
| Pediatrics | PEDS | `OITE::Peds` |
| Trauma | TRAUMA | `OITE::Trauma` |
| Recon | RECON | `OITE::Recon` |

- Keep this mapping in **one config file** (e.g., `topics.json`) so I can rename topics, add new tags, or split Hand/Wrist and Foot/Ankle apart later.
- Store the **original tag** on each card too, so a subtopic label (e.g., "Hand/Wrist" vs "Foot/Ankle") can be shown on the card.
- If a row has a tag that isn't in the config, put it under an "Unsorted" topic and list it in the import summary. Never silently drop rows.

## 3. Source data

### 3a. Progress log — `data/ortho-progress log.csv`

This is an **Anki-style cloze export**. Key facts (verified on the current file):

- **No header row.** 3 columns, 246 rows.
- **Column 1 — card text** with Anki cloze markers, e.g.
  `Unstable knee OCD lesion → {{c1::arthroscopic fixation}}`
  - Every row has at least one cloze. 37 rows have more than one (`c1`, `c2`, up to `c3`), e.g.
    `Walch B2 glenoid = {{c1::biconcave}}, {{c2::posterior}} erosion`
  - Treat `{{c1::answer::hint}}` (cloze with a hint) as valid too, even though none exist yet.
- **Column 2 — extra info:** a 💡 memory tip, then `<br><small>Logged 9/6</small>`. Some rows have several dates (`Logged 9/7, 9/21`), meaning I missed it more than once.
- **Column 3 — tag:** `OITE::<Topic>` (see mapping in section 2).
- Cells may be wrapped in quotes and contain commas — use a real CSV parser.
- Counts per tag right now: Sports 39, Shoulder_Elbow 31, Spine 31, Oncology 29, Hand_Wrist 26, Peds 26, Recon 21, Trauma 21, Foot_Ankle 16, Basic_Science 6.

### 3b. How each row becomes a card

- **Front:** column 1 with each cloze replaced by a blank, e.g. `Walch B2 glenoid = [ … ], [ … ] erosion`. If a cloze has a hint, show the hint inside the blank.
- **Back:** the full sentence with the answers **highlighted** in place, then the 💡 tip, then the logged date(s) in small muted text.
- **Multi-cloze rows (default):** one card per row, all blanks hidden at once, all revealed on flip.
  - Make this a setting so I can later switch to **Anki-style**, one card per cloze number (c1 card, c2 card…). Don't build that mode in v1 unless it's trivial.
- Parse the **logged dates** into a list and a **"times missed"** count (number of dates). Show "Missed 2×" on cards missed more than once.
- Column 2 contains a little HTML (`<br>`, `<small>`). Render only safe formatting tags; strip or escape anything else.

### 3c. Adding more cards later (design for this now)

- Any CSV I drop into `/data` is picked up on the next import, as long as it uses the **same 3-column format** (text with clozes, extra, tag).
- Create **`data/TEMPLATE.csv`** with 2–3 example rows in exactly this format (including one multi-cloze row and one with multiple logged dates), plus a short note in the README explaining each column.
- If a new file has no tag column, allow the topic to come from the file name (e.g., `spine_extra.csv` → Spine). Ask me if a file is ambiguous.
- Rows with identical card text across files become **one card** (merge their logged dates and keep the newer tip).

### Data handling rules

- Write a small import script that converts all CSVs in `/data` into a single `cards.json` the app loads. Re-running it must **never wipe my study progress**.
- Give every card a **stable ID** based on its card text (not the topic, so re-tagging a card doesn't reset its progress).
- Report a summary after each import: cards per topic, new cards added, duplicates merged, unsorted tags, and any rows skipped and why.
- Never modify the original CSVs.

## 4. Core features (v1 — must have)

1. **Home screen**
   - Topic chips for the 9 topics (multi-select) plus "All", each showing its card count.
   - Number of cards due for the current selection.
   - Start button.

2. **Study session**
   - Shows the front with blanks; tap/click or press **Space** to flip.
   - After flipping, rate: **Again / Hard / Good / Easy** (keys 1–4).
   - Progress bar (e.g., "12 / 40"), topic tag, and "Missed 2×" badge when relevant.
   - Shuffle by default.

3. **Spaced repetition**
   - Simple, well-known algorithm (SM-2 or a simplified variant). "Again" brings the card back later in the same session.
   - New cards that I've missed multiple times on quizzes should come up first.
   - Track per card: last reviewed, next due date, ease, streak, and times I rated "Again".

4. **Progress saved locally**
   - Store progress in the browser (localStorage/IndexedDB).
   - **Export/Import progress** as a JSON file for backup or moving between devices.

5. **End-of-session summary**
   - Cards reviewed, % Good/Easy, and a list of cards I hit "Again" on.

## 5. Nice-to-have (v2 — only after v1 works)

- **Weak spots mode:** cards with the most misses (quiz misses + "Again" ratings).
- **Anki-style multi-cloze mode** (one card per cloze).
- **Stats page:** accuracy and cards mastered per topic over time.
- **Mark as mastered / suspend** a card.
- **Search** across all cards.
- **Cram mode:** ignore due dates and review everything in the selection.
- **Recently logged:** study only cards logged in the last 7/30 days.
- Dark mode.

## 6. Tech approach

- **Web app** (HTML/CSS/JavaScript, or Vite + a lightweight framework if warranted). No backend, no login.
- **Mobile-friendly** and installable to my iPhone home screen (PWA), working offline.
- **Deploy with GitHub Pages.**
- No native iOS for v1.

## 7. Design

- Clean, minimal, readable. Large text on cards; comfortable one-handed on a phone.
- Blanks clearly visible on the front; answers clearly highlighted on the back.
- 💡 tip visually set apart (e.g., a soft callout box).
- Subtle color accent per topic.
- Rating buttons large and thumb-reachable on mobile.

## 8. Build phases (work in this order, check in with me after each)

1. **Inspect data** — confirm the format above against the file, confirm the topic mapping, and show me 3 sample cards (one single-cloze, one multi-cloze, one with multiple logged dates) as they'd appear front and back. *Wait for my confirmation.*
2. **Import script + template** — all CSVs → `cards.json` with stable IDs, duplicate merging, import summary, `topics.json`, and `TEMPLATE.csv`.
3. **Study loop** — home screen, topic selection, flip, rate.
4. **Spaced repetition + saved progress** — scheduling, local storage, export/import.
5. **Polish** — mobile layout, keyboard shortcuts, session summary, PWA/offline.
6. **Deploy** — GitHub Pages, plus a README covering: how to add a new CSV, run the import, and redeploy.
7. **v2 features** — only if I ask.

## 9. Acceptance criteria (how I'll know v1 is done)

- [ ] All 246 rows in my progress log appear as cards (or are listed as skipped with a reason).
- [ ] Cloze blanks and answers display correctly, including multi-cloze rows.
- [ ] The 💡 tip and logged dates appear on the back; HTML tags don't show as raw text.
- [ ] I can study any combination of the 9 topics, and Hand/Wrist + Foot/Ankle both appear under Hand, Foot & Ankle.
- [ ] Cards flip and rate with taps on iPhone and with keyboard on laptop.
- [ ] Closing and reopening the app keeps my progress.
- [ ] Adding a new CSV in the same format and re-importing adds cards without resetting progress on existing ones.
- [ ] `TEMPLATE.csv` and the README make adding cards possible without touching code.
- [ ] I can export my progress to a file and import it back.
- [ ] The app is live on a URL and installable to my iPhone home screen.

## 10. Working rules for Claude Code

- Start in plan mode; don't write code until I approve the plan.
- Ask before adding dependencies or changing the tech approach.
- Keep the code simple and commented so I can understand and maintain it.
- Commit to git after each phase with a clear message.
- Create a `CLAUDE.md` summarizing project structure, the CSV format, the topic mapping, and how to add cards.
