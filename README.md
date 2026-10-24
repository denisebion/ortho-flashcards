# Ortho Flashcards

A personal flashcard app for the OITE questions I've missed. (Work in progress: the
import step is done; the study app comes next. See `FLASHCARD_APP_PLAN.md`.)

## Adding cards (no code changes needed)

1. Put a CSV in `data/` (any file name ending in `.csv`). Copy `data/TEMPLATE.csv` to start.
2. Run the import from the project folder:

   ```bash
   python3 tools/import_cards.py
   ```

3. Read the summary it prints (also saved to `import-summary.txt`). It lists new cards,
   merged duplicates, unsorted tags, and any skipped rows with the reason.

Re-running is always safe. Study progress is stored in the browser, keyed by a card ID
made from the card text, so adding files never resets existing progress. Your CSVs are
never modified.

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
`OITE::Foot_Ankle` their own topics), then re-run the import.
Tags not listed there appear under **Unsorted**.
