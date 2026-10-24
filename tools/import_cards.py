#!/usr/bin/env python3
"""Turn every CSV in data/ into cards.json for the flashcard app.

Run from anywhere:   python3 tools/import_cards.py

Input format (no header row, 3 columns):
    1. card text with Anki clozes, e.g.  Walch B2 glenoid = {{c1::biconcave}} erosion
    2. extra info: "💡 tip<br><small>Logged 9/6, 9/21</small>"
    3. tag, e.g.  OITE::Spine   (optional: see "topic from file name" below)

What it does
  * never touches the source CSVs, and never touches your study progress
    (progress lives in the browser, keyed by the card IDs made here);
  * gives each card a stable ID made from its text only, so re-tagging a card
    or moving it to another file keeps its progress;
  * merges rows with identical card text into one card (dates are combined,
    the tip from the most recently logged row wins);
  * maps tags to topics using topics.json; unknown tags go to "Unsorted";
  * if a file has no tag column (or the cell is empty) the topic is taken from
    the file name, e.g. spine_extra.csv -> Spine, foot_ankle.csv -> Foot/Ankle;
  * prints a summary (and saves it to import-summary.txt) and never silently
    drops a row: skipped rows are listed with the reason.

Only the Python standard library is used.
"""
import argparse
import csv
import hashlib
import html
import json
import re
import sys
import unicodedata
from collections import Counter
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FORMAT_VERSION = 1

# {{c1::answer}} or {{c1::answer::hint}}
CLOZE_RE = re.compile(r"\{\{c(\d+)::(.*?)(?:::(.*?))?\}\}", re.S)
# <small>Logged 9/6, 9/21</small>  (the <small> wrapper is optional)
LOGGED_SMALL_RE = re.compile(r"<small>\s*Logged\b(.*?)</small>", re.I | re.S)
LOGGED_PLAIN_RE = re.compile(r"\bLogged\s+((?:\d{1,2}/\d{1,2}(?:/\d{2,4})?[,;\s]*)+)", re.I)
DATE_RE = re.compile(r"(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?")
# Only these HTML tags are recognised (and stripped). Anything else, such as the
# "<4" in "Kids <4", is real text and is kept as-is. The app escapes all text.
BR_RE = re.compile(r"<br\s*/?>", re.I)
FORMAT_TAG_RE = re.compile(r"</?(?:small|b|i|u|em|strong|span|div|p)\b[^>]*>", re.I)
ENTITY_RE = re.compile(r"&(?:#\d+|#x[0-9a-fA-F]+|[A-Za-z][A-Za-z0-9]*);")


# ---------------------------------------------------------------- text helpers

def clean(s):
    """Plain text from a CSV cell: <br> -> newline, known tags removed,
    &entities; decoded, non-breaking spaces turned into spaces."""
    s = BR_RE.sub("\n", s)
    s = FORMAT_TAG_RE.sub("", s)
    s = ENTITY_RE.sub(lambda m: html.unescape(m.group(0)), s)
    s = s.replace("\xa0", " ")
    return unicodedata.normalize("NFC", s).strip()


def card_id(text):
    """Stable ID from the card text only (whitespace-normalised)."""
    norm = re.sub(r"\s+", " ", unicodedata.normalize("NFC", text)).strip()
    return "c" + hashlib.sha256(norm.encode("utf-8")).hexdigest()[:12]


def slug(s):
    return re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_")


def parse_parts(text):
    """Split card text into plain-text and cloze parts, e.g.
    [{"t":"text","v":"Walch B2 = "}, {"t":"cloze","n":1,"a":"biconcave","h":""}]"""
    parts, pos = [], 0
    for m in CLOZE_RE.finditer(text):
        if m.start() > pos:
            parts.append({"t": "text", "v": text[pos:m.start()]})
        parts.append({"t": "cloze", "n": int(m.group(1)),
                      "a": m.group(2), "h": m.group(3) or ""})
        pos = m.end()
    if pos < len(text):
        parts.append({"t": "text", "v": text[pos:]})
    return parts


# ------------------------------------------------------- column 2: tip + dates

def resolve_date(month, day, year, today):
    """Dates in the log have no year. Use the most recent year that is not in
    the future (so "9/6" imported in Oct 2026 is 2026-09-06)."""
    if year:
        y = int(year)
        return date(y + 2000 if y < 100 else y, month, day)
    d = date(today.year, month, day)
    if d > today:
        d = date(today.year - 1, month, day)
    return d


def parse_extra(extra, today, warn):
    """Split "💡 tip<br><small>Logged 9/6, 9/21</small>" into (tip, [ISO dates])."""
    m = LOGGED_SMALL_RE.search(extra) or LOGGED_PLAIN_RE.search(extra)
    dates = set()
    if m:
        for mo, d, y in DATE_RE.findall(m.group(1)):
            try:
                dates.add(resolve_date(int(mo), int(d), y, today).isoformat())
            except ValueError:
                warn("unreadable date '%s/%s' in the Logged list" % (mo, d))
        extra = extra[:m.start()] + extra[m.end():]
    tip = re.sub(r"^💡\s*", "", clean(extra))
    return tip, sorted(dates)


# ----------------------------------------------------------------- topic config

class Topics:
    def __init__(self, config):
        self.topics = config["topics"]
        self.unsorted = config["unsorted"]
        self.subtopic_labels = config.get("subtopicLabels", {})
        self.tag_to_topic = {}
        for t in self.topics:
            for tag in t["tags"]:
                key = tag.strip().lower()
                if key in self.tag_to_topic:
                    sys.exit("topics.json: tag %s is listed under two topics" % tag)
                self.tag_to_topic[key] = t["id"]
        # File-name aliases: topic id, topic label, or the part of a tag after "::".
        # alias -> (topic id, tag or None)
        self.aliases = {}
        for t in self.topics:
            self.aliases.setdefault(slug(t["id"]), (t["id"], None))
            self.aliases.setdefault(slug(t["label"]), (t["id"], None))
            for tag in t["tags"]:
                self.aliases[slug(tag.split("::")[-1])] = (t["id"], tag)

    def topic_for_tag(self, tag):
        return self.tag_to_topic.get(tag.strip().lower())

    def from_filename(self, stem):
        """spine_extra -> (SPINE, None); foot_ankle_2 -> (HFA, OITE::Foot_Ankle)."""
        stem = slug(stem)
        for alias in sorted(self.aliases, key=len, reverse=True):
            if stem == alias or stem.startswith(alias + "_"):
                return self.aliases[alias]
        return None

    def subtopic(self, tag):
        if not tag:
            return ""
        if tag in self.subtopic_labels:
            return self.subtopic_labels[tag]
        return tag.split("::")[-1].replace("_", " ")


# ------------------------------------------------------------------------ import

def read_csv(path):
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.reader(f))


def newest(dates):
    return max(dates) if dates else ""


def import_all(data_dir, topics, today):
    """Returns (cards, report). cards is an ordered list of card dicts."""
    cards = {}                 # id -> card
    rep = {"files": [], "rows": 0, "merged": 0, "skipped": [], "warnings": [],
           "unsorted_tags": Counter()}

    files = sorted(p for p in data_dir.glob("*.csv")
                   if p.name.lower() != "template.csv" and not p.name.startswith("."))
    for path in files:
        try:
            rows = read_csv(path)
        except (UnicodeDecodeError, csv.Error) as e:
            rep["skipped"].append("%s: whole file unreadable (%s)" % (path.name, e))
            continue
        rep["files"].append((path.name, len(rows)))
        file_topic = topics.from_filename(path.stem)

        def loc(n):
            return "%s row %d" % (path.name, n)

        for n, row in enumerate(rows, 1):
            rep["rows"] += 1
            if not any(c.strip() for c in row):
                rep["skipped"].append("%s: blank row" % loc(n))
                continue
            text = clean(row[0])
            if not CLOZE_RE.search(text):
                rep["skipped"].append("%s: no {{c1::...}} cloze marker (%s)"
                                      % (loc(n), text[:50] or "empty text"))
                continue
            warn = lambda msg, n=n: rep["warnings"].append("%s: %s" % (loc(n), msg))
            if "{{" in CLOZE_RE.sub("", text):
                warn("leftover '{{' - a cloze marker may be malformed")
            if len(row) > 3:
                warn("more than 3 columns; extra columns ignored")

            tip, dates = parse_extra(row[1] if len(row) > 1 else "", today, warn)
            if not dates:
                warn("no logged dates found, so 'times missed' will be 0")

            # Work out the topic: tag column first, then the file name.
            tag = clean(row[2]) if len(row) > 2 else ""
            topic_id = topics.topic_for_tag(tag) if tag else None
            if topic_id is None and not tag and file_topic:
                topic_id, tag = file_topic[0], file_topic[1] or ""
            if topic_id is None:
                topic_id = topics.unsorted["id"]
                rep["unsorted_tags"][tag or "(no tag, file name '%s' not recognised)" % path.name] += 1

            cid = card_id(text)
            if cid in cards:
                c = cards[cid]
                rep["merged"] += 1
                if path.name not in c["sources"]:
                    c["sources"].append(path.name)
                # keep the tip from whichever row was logged most recently
                if tip and (not c["tip"] or newest(dates) >= newest(c["dates"])):
                    c["tip"] = tip
                c["dates"] = sorted(set(c["dates"]) | set(dates))
                c["missed"] = len(c["dates"])
                if tag and not c["tag"]:
                    c["tag"], c["topic"] = tag, topic_id
                    c["subtopic"] = topics.subtopic(tag)
                elif tag and tag != c["tag"]:
                    warn("same card already tagged %s; keeping that tag" % c["tag"])
            else:
                cards[cid] = {
                    "id": cid, "topic": topic_id, "tag": tag,
                    "subtopic": topics.subtopic(tag),
                    "text": text, "parts": parse_parts(text), "tip": tip,
                    "dates": dates, "missed": len(dates), "sources": [path.name],
                }
    return list(cards.values()), rep


def summarise(cards, rep, old_ids, topics):
    lines = ["Import summary", "=============="]
    for name, n in rep["files"]:
        lines.append("File: %s (%d rows)" % (name, n))
    new = [c for c in cards if c["id"] not in old_ids]
    removed = old_ids - {c["id"] for c in cards}
    lines += ["",
              "Rows read:          %d" % rep["rows"],
              "Cards in cards.json: %d" % len(cards),
              "New cards added:    %d" % len(new),
              "Duplicates merged:  %d" % rep["merged"],
              "Rows skipped:       %d" % len(rep["skipped"]),
              "", "Cards per topic:"]
    per = Counter(c["topic"] for c in cards)
    for t in topics.topics + [topics.unsorted]:
        if per[t["id"]] or t is not topics.unsorted:
            lines.append("  %-20s %d" % (t["label"], per[t["id"]]))
    lines.append("")
    if rep["unsorted_tags"]:
        lines.append("Unsorted (tag not in topics.json):")
        lines += ["  %s  x%d" % (tag, n) for tag, n in rep["unsorted_tags"].items()]
    else:
        lines.append("Unsorted tags: none")
    if rep["skipped"]:
        lines += ["", "Skipped rows:"] + ["  " + s for s in rep["skipped"]]
    if rep["warnings"]:
        lines += ["", "Warnings:"] + ["  " + w for w in rep["warnings"]]
    if removed:
        lines += ["", "%d card(s) in the previous cards.json are no longer in any CSV "
                  "(their saved progress is kept in the browser but they won't show)."
                  % len(removed)]
    return "\n".join(lines) + "\n"


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--data", type=Path, default=ROOT / "data", help="folder with CSVs")
    ap.add_argument("--topics", type=Path, default=ROOT / "topics.json")
    ap.add_argument("--out", type=Path, default=ROOT / "cards.json")
    ap.add_argument("--today", help="override today's date (YYYY-MM-DD), for tests")
    args = ap.parse_args()

    today = date.fromisoformat(args.today) if args.today else date.today()
    topics = Topics(json.loads(args.topics.read_text(encoding="utf-8")))
    if not list(args.data.glob("*.csv")):
        sys.exit("No CSV files found in %s" % args.data)

    old = {}
    if args.out.exists():
        try:
            old = json.loads(args.out.read_text(encoding="utf-8"))
        except ValueError:
            pass
    old_ids = {c["id"] for c in old.get("cards", [])}

    cards, rep = import_all(args.data, topics, today)

    # Keep the old "generated" date when nothing changed, so re-running is a no-op.
    unchanged = old.get("version") == FORMAT_VERSION and old.get("cards") == cards
    generated = old["generated"] if unchanged else today.isoformat()

    # One card per line keeps git diffs readable.
    body = ",\n".join(json.dumps(c, ensure_ascii=False, separators=(",", ":")) for c in cards)
    args.out.write_text('{"version":%d,"generated":"%s","cards":[\n%s\n]}\n'
                        % (FORMAT_VERSION, generated, body), encoding="utf-8")

    summary = summarise(cards, rep, old_ids, topics)
    print(summary, end="")
    (args.out.parent / "import-summary.txt").write_text(summary, encoding="utf-8")


if __name__ == "__main__":
    main()
