"""Phase 0: validate the inbox tab as returned by the Sheets connector's get_values (JSON).

Deterministic checks only; this is the shape of the ingest-side validation, not the ingest itself.
Usage: python3 validate_inbox_json.py inbox.json
Known items (words tab + Phase 0 CSV drops) are passed via KNOWN below.
"""
import json
import re
import sys
from collections import Counter, defaultdict

COLS = ("de article en pos tier domain family cloze_1 answer_1 hint_1 cloze_2 answer_2 listen_de "
        "listen_en wrong_1 wrong_2 capture_id start_stage source run_id status reason word_id").split()
DOMAINS = {"arbeit", "uni", "amt", "alltag", "smalltalk"}
# (de, pos, where): words tab and the path-B CSV files written earlier in Phase 0.
KNOWN = [("Besprechung", "noun", "words"), ("Das klingt gut.", "phrase", "words"), ("Vorlesung", "noun", "words"),
         ("Termin", "noun", "words"), ("sich beschweren", "verb", "words"),
         ("Verspätung", "noun", "csv"), ("Rückmeldung", "noun", "csv"), ("verschieben", "verb", "csv"),
         ("Aufgabe", "noun", "csv"), ("pünktlich", "adj", "csv"), ("Das klingt gut.", "phrase", "csv")]


def key(de, pos):
    s = " ".join(de.strip().lower().split())
    return re.sub(r"^(der|die|das) ", "", s) if pos == "noun" else s


def nwords(cloze, answer):
    return len(cloze.replace("___", answer or "X").split())


def main(path):
    data = json.load(open(path, encoding="utf-8"))
    rows = data["values"] if isinstance(data, dict) else data
    assert rows[0] == COLS, "header mismatch"
    known = {}
    for de, pos, where in KNOWN:
        known.setdefault(key(de, pos), where)
    seen = {}
    runs = defaultdict(Counter)
    issues = []
    for n, raw in enumerate(rows[1:], 2):
        r = dict(zip(COLS, raw + [""] * (len(COLS) - len(raw))))
        run = r["run_id"] or "?"
        p = []
        for c in ("de", "en", "pos", "domain", "cloze_1", "answer_1"):
            if not r[c].strip():
                p.append("missing " + c)
        if r["pos"] not in {"noun", "verb", "adj", "phrase"}: p.append("pos")
        if r["pos"] == "noun" and r["article"] not in {"der", "die", "das"}: p.append("noun article")
        if r["pos"] != "noun" and r["article"]: p.append("article on non-noun")
        if r["tier"] not in {"", "core", "chunk"}: p.append("tier")
        if r["tier"] == "chunk" and r["pos"] != "phrase": p.append("chunk not phrase")
        if r["domain"] not in DOMAINS: p.append("domain")
        for c, a in (("cloze_1", "answer_1"), ("cloze_2", "answer_2")):
            if r[c]:
                if r[c].count("___") != 1: p.append(c + " gaps")
                if not r[a]: p.append(a + " empty")
                if nwords(r[c], r[a]) > 14: p.append(c + " >14 words")
        if r["listen_de"] and len(r["listen_de"].split()) > 14: p.append("listen_de >14 words")
        if r["start_stage"] or r["status"] or r["reason"] or r["word_id"]: p.append("reserved column filled")
        if r["wrong_1"] and r["wrong_1"] == r["wrong_2"]: p.append("wrong_1 == wrong_2")
        k = key(r["de"], r["pos"])
        if k in seen:
            p.append(f"DUPLICATE of pending row {seen[k]}")
            runs[run]["dup_pending"] += 1
        elif k in known:
            tag = "reinforces existing word" if known[k] == "words" else "DUPLICATE of path-B CSV item"
            p.append(tag)
            runs[run]["dup_csv" if known[k] == "csv" else "reinforce"] += 1
        seen.setdefault(k, n)
        hard = [x for x in p if not x.startswith(("reinforces", "DUPLICATE"))]
        runs[run]["rows"] += 1
        runs[run]["valid"] += not hard
        runs[run][r["tier"] or "untiered"] += 1
        runs[run]["dom_" + r["domain"]] += 1
        runs[run]["no_cloze_2"] += not r["cloze_2"]
        runs[run]["no_listen"] += not r["listen_de"]
        if p:
            issues.append(f"row {n} {r['de']!r} [{run}]: " + "; ".join(p))
    print(f"rows={len(rows) - 1}")
    for run, c in runs.items():
        doms = " ".join(f"{d[4:]}={v}" for d, v in sorted(c.items()) if d.startswith("dom_"))
        print(f"RUN {run}: rows={c['rows']} schema_valid={c['valid']} core={c['core']} chunk={c['chunk']} "
              f"dup_pending={c['dup_pending']} dup_csv={c['dup_csv']} reinforce={c['reinforce']} "
              f"no_cloze_2={c['no_cloze_2']} no_listen={c['no_listen']} | {doms}")
    print("ISSUES" if issues else "ISSUES none")
    for i in issues:
        print(" ", i)
    print("ALL_ROWS (row|run|de|pos|tier|domain|cloze_1|cloze_2|listen_de)")
    for n, raw in enumerate(rows[1:], 2):
        r = dict(zip(COLS, raw + [""] * (len(COLS) - len(raw))))
        if r["run_id"].startswith("claude-batch") and n >= 26:
            print(f"  {n}|{r['de']}|{r['pos']}|{r['tier']}|{r['domain']}|{r['cloze_1']}|{r['cloze_2']}|{r['listen_de']}")


if __name__ == "__main__":
    main(sys.argv[1])
