# Ortho Flashcards

A personal flashcard app for studying the OITE questions I've missed: filter by topic, spaced
repetition, progress saved on the device, works offline, installable on an iPhone. No backend,
no login. (Spec: `FLASHCARD_APP_PLAN.md`.)

## Studying and progress

- Each session = cards **due** today + up to N **new** cards (choose 10 / 20 / 50 / All on the home
  screen). New cards you missed more than once on quizzes come first.
- Rate each card Again / Hard / Good / Easy (keys 1–4). The button shows when the card will come back.
  Again brings it back later in the same session.
- Keyboard: Space/Enter flip, 1–4 rate, Esc leaves the session, Enter on the home screen starts.
- Progress is saved in the browser after every rating. Use **Backup & reset** on the home screen to
  export a file, import one (merging; the most recent review of each card wins), or reset.
- Browser storage is per browser: Safari and the iPhone home-screen app keep **separate** progress,
  so export/import to move between them (or between devices).

## Deploy to GitHub Pages (one time)

The repo already contains a workflow (`.github/workflows/deploy.yml`) that rebuilds `cards.json`
from the CSVs and publishes the app on every push to `main`.

1. On github.com create a new **public** repository (e.g. `ortho-flashcards`). Leave it empty: no
   README, no .gitignore. (Free GitHub Pages needs a public repo, which means the cards, tips and
   logged dates are readable by anyone with the link.)
2. In this folder, connect and push:

   ```bash
   git remote add origin https://github.com/<your-username>/<repo-name>.git
   git push -u origin main
   ```

3. In the repo go to **Settings → Pages → Build and deployment → Source** and choose
   **GitHub Actions**.
4. Open the **Actions** tab. The "Build and deploy" run (re-run it with **Run workflow** if it
   started before step 3) finishes in about a minute, and the app is live at
   `https://<your-username>.github.io/<repo-name>/`.

### Put it on the iPhone

Open that address in **Safari**, tap **Share → Add to Home Screen**. It then opens full screen and
works offline: the first visit saves the app and all cards on the phone, and later visits use the
latest files when online. Study progress lives on the phone; export a backup now and then.

## Adding more cards

The app has the same instructions under **Add more cards** on the home screen.

**From github.com (works from any device, nothing to install):**

1. Make a CSV in the format below (start from `data/TEMPLATE.csv`).
2. In your repo open the `data` folder → **Add file → Upload files**, drag the CSV in, press
   **Commit changes**.
3. Wait a minute or two for the "Build and deploy" run to finish (Actions tab), then close and
   reopen the app while online. The home screen shows "cards updated <date>".
4. If something is missing, open that run: its summary lists new cards, merged duplicates, skipped
   rows, and tags that weren't recognised.

**From this computer:** put the CSV in `data/`, run the import to preview, then commit and push:

```bash
python3 tools/import_cards.py
git add data cards.json import-summary.txt && git commit -m "Add cards" && git push
```

Either way, study progress is never reset: it is keyed by a card ID made from the card text.
Your CSVs are never modified.

### CSV format

No header row. Three columns:

| Column | What it holds | Example |
|---|---|---|
| 1. Card text | The sentence with Anki clozes. Use `{{c1::answer}}` or `{{c1::answer::hint}}`. Several blanks are fine (`c1`, `c2`, ...). | `Walch B2 glenoid = {{c1::biconcave}}, {{c2::posterior}} erosion` |
| 2. Extra | A 💡 memory tip, then `<br><small>Logged 9/6</small>`. List several dates if you missed it more than once: `Logged 9/7, 9/21`. The number of dates is the "times missed" count. Dates have no year; the most recent year that isn't in the future is used. | `💡 Stable = drill; unstable = fix.<br><small>Logged 9/6</small>` |
| 3. Tag | `OITE::<Topic>`; must be listed in `topics.json`. | `OITE::Sports` |

Notes:
- Cells containing commas must be wrapped in double quotes (spreadsheet apps and the
  Anki export do this for you).
- **No tag column?** The topic comes from the file name: `spine_extra.csv` becomes Spine,
  `foot_ankle.csv` becomes Hand, Foot & Ankle (Foot/Ankle). A topic id, topic name, or the
  part of a tag after `::` (like `foot_ankle`) works, followed by anything after an underscore.
  If the name isn't recognised the cards go to **Unsorted** and the summary says so.
- **Duplicates:** rows with identical card text (across all files) become one card. Their
  dates are combined and the tip from the most recently logged row is kept.
- Rows with no `{{c1::...}}` cloze are skipped and listed in the summary.

### Topics

`topics.json` maps CSV tags to the 9 topics shown in the app. Edit it to rename a topic,
add a tag, or split one apart (for example, give `OITE::Hand_Wrist` and
`OITE::Foot_Ankle` their own topics), then push (or re-run the import locally).
Tags not listed there appear under **Unsorted**.

## Running the app locally

```bash
python3 tools/import_cards.py   # only after changing CSVs or topics.json
python3 -m http.server 8123
```

Then open http://localhost:8123. (Opening `index.html` directly won't work: the browser blocks
loading `cards.json` from a `file://` page.)
