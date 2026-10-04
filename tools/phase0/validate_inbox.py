"""Validate inbox CSV files against the Sheet README rules (Phase 0 evidence check).

Usage: python tools/phase0/validate_inbox.py FILE.csv [FILE.csv ...]
Checks header order, required fields, article/pos/tier/domain values, exactly one ___ per cloze,
sentence length <= 14 words, and duplicates against the test Sheet's sample words.
"""
import csv
import re
import sys

COLS = ("de article en pos tier domain family cloze_1 answer_1 hint_1 cloze_2 answer_2 listen_de "
        "listen_en wrong_1 wrong_2 capture_id start_stage source run_id status reason word_id").split()
REQUIRED = ["de", "en", "pos", "domain", "cloze_1", "answer_1"]
DOMAINS = {"arbeit", "uni", "amt", "alltag", "smalltalk"}
TEST_WORDS = {"besprechung", "das klingt gut.", "vorlesung", "termin", "sich beschweren"}


def key(de: str, pos: str) -> str:
    # Strip a leading article only for nouns: "Das klingt gut." is a chunk, not "klingt gut.".
    s = de.strip().lower()
    if pos == "noun":
        s = re.sub(r"^(der|die|das)\s+", "", s)
    return " ".join(s.split())


def words(s: str) -> int:
    return len(s.replace("___", "X").split())


def check(path: str) -> int:
    errors = 0
    with open(path, encoding="utf-8", newline="") as fh:
        rows = list(csv.reader(fh))
    if rows[0] != COLS:
        print(f"{path}: header mismatch"); return 1
    for n, raw in enumerate(rows[1:], 2):
        if len(raw) != len(COLS):
            print(f"{path}:{n} has {len(raw)} cells, expected {len(COLS)}"); errors += 1; continue
        r = dict(zip(COLS, raw))
        problems = [f"missing {c}" for c in REQUIRED if not r[c].strip()]
        if r["pos"] not in {"noun", "verb", "adj", "phrase"}: problems.append(f"pos={r['pos']}")
        if r["article"] and (r["pos"] != "noun" or r["article"] not in {"der", "die", "das"}): problems.append("article")
        if r["pos"] == "noun" and not r["article"]: problems.append("noun without article")
        if r["tier"] not in {"", "core", "chunk"}: problems.append(f"tier={r['tier']}")
        if r["domain"] not in DOMAINS: problems.append(f"domain={r['domain']}")
        for c, a in (("cloze_1", "answer_1"), ("cloze_2", "answer_2")):
            if r[c]:
                if r[c].count("___") != 1: problems.append(f"{c} gaps={r[c].count('___')}")
                if words(r[c]) > 14: problems.append(f"{c} {words(r[c])} words")
                if not r[a]: problems.append(f"{a} empty")
        if r["listen_de"] and words(r["listen_de"]) > 14: problems.append("listen_de too long")
        if r["start_stage"]: problems.append("start_stage set by agent")
        if any(r[c] for c in ("status", "reason", "word_id")): problems.append("normalizer columns filled")
        dup = key(r["de"], r["pos"]) in TEST_WORDS
        kind = "reinforce" if dup and not r["capture_id"] else ("DUPLICATE" if dup else "new")
        status = "ok" if not problems else "INVALID: " + "; ".join(problems)
        errors += bool(problems)
        print(f"{path.split('/')[-1]}:{n} {r['de']!r:24} {r['tier']:5} {r['domain']:9} {kind:9} {status}")
    return errors


if __name__ == "__main__":
    sys.exit(1 if sum(check(p) for p in sys.argv[1:]) else 0)
