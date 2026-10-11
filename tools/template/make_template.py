"""Build the optional sheet template in docs/template/ (Round 4, D56).

Writes strecke-template.xlsx (tabs: Read me, Words, Inbox, Meta; header notes; dropdowns where
Google Sheets keeps them on import) and one CSV per tab. The column list must match
core/src/sheet/contract.ts; tools/template/check_template.ts verifies that.

    python3 tools/template/make_template.py

Content is synthetic and general (one example row). No learner data.
"""
import csv
import datetime
import pathlib

from openpyxl import Workbook
from openpyxl.comments import Comment
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.worksheet.datavalidation import DataValidation

OUT = pathlib.Path(__file__).resolve().parents[2] / "docs" / "template"
SCHEMA_VERSION = 1

WORDS = [
    ("word", "Required. The German word or phrase, without der/die/das (those go in article)."),
    ("article", "der, die or das. Nouns only."),
    ("plural", "The full plural form, for example Haltestellen."),
    ("meaning", "A short English meaning. Needed before a row is practised."),
    ("pos", "noun, verb, adj or phrase. Empty: the app guesses."),
    ("topic", "Any label. arbeit, uni, amt, alltag and smalltalk are built-in situations."),
    ("example", "One natural German sentence that contains the word exactly once (at most 14 words)."),
    ("example_translation", "English translation of the example."),
    ("example_form", "Only when the word appears in another form in the example, for example hole for abholen."),
    ("example_2", "A second example, in a different everyday situation."),
    ("example_2_translation", "English translation of the second example."),
    ("example_2_form", "Like example_form, for the second example."),
    ("collocation", "A common combination, for example einen Termin vereinbaren."),
    ("prep", "The typical preposition: für, mit, an, auf, …"),
    ("note", "One short usage note, only if it prevents a typical mistake."),
    ("wrong_1", "Optional: a plausible wrong English meaning for multiple choice."),
    ("wrong_2", "Optional: a second wrong meaning."),
    ("level", "Free text, for example A2, B1 or around my level. Never checked against a list."),
    ("source", "agent if your AI assistant wrote the row, me if you did."),
    ("added", "The date the row was added, as YYYY-MM-DD."),
    ("verified", "yes once you have checked the row; no if unsure."),
    ("id", "Optional. Any short unique text. Keeps your progress if you later rename the word."),
]

EXAMPLE = {
    "word": "Haltestelle", "article": "die", "plural": "Haltestellen", "meaning": "stop (bus, tram)", "pos": "noun",
    "topic": "alltag", "example": "Wir steigen an der nächsten Haltestelle aus.",
    "example_translation": "We get off at the next stop.", "example_form": "",
    "example_2": "Treffen wir uns an der Haltestelle vor dem Kino?",
    "example_2_translation": "Shall we meet at the stop in front of the cinema?", "example_2_form": "",
    "collocation": "an der Haltestelle warten", "prep": "an", "note": "", "wrong_1": "station", "wrong_2": "ticket",
    "level": "A2", "source": "me", "added": "2026-10-11", "verified": "yes", "id": "",
}

INBOX = [
    ("word", "A German word or phrase you want to learn. Your AI assistant adds the full row to Words."),
    ("note", "Optional: where you heard it, or what you think it means."),
    ("processed", "Your AI assistant writes the date here once the word is in Words."),
]

README = [
    "Strecke word list",
    "",
    "This sheet holds the words you practise in the Strecke app. The app only reads it; it never changes it.",
    "Words tab: one row per word. Only the word column is required, and a meaning is needed before a row is practised. Every other column is optional and adds exercises.",
    "Columns can be in any order, extra columns are ignored, and English or German header names both work (word/Wort, meaning/Bedeutung).",
    "Inbox tab (optional): write a word you want to learn. Your AI assistant adds the full row to Words and writes the date into processed.",
    "Meta tab (optional): schema_version tells the app which layout this sheet follows.",
    "To connect: File > Share > Publish to web > choose only the Words tab > Comma-separated values (.csv) > Publish. Paste the link in Strecke > Settings > Data.",
    "Privacy: anyone with a published link can read that tab. Keep private notes out of it.",
    "",
    "Example row (also in the Words tab):",
]

HEAD_FILL = PatternFill("solid", fgColor="F2A900")
BOLD = Font(bold=True)


def words_sheet(ws):
    ws.title = "Words"
    for col, (name, note) in enumerate(WORDS, start=1):
        c = ws.cell(row=1, column=col, value=name)
        c.font = BOLD
        c.fill = HEAD_FILL
        c.comment = Comment(note, "Strecke")
        ws.column_dimensions[c.column_letter].width = max(12, min(40, len(name) + 4))
        ws.cell(row=2, column=col, value=EXAMPLE[name])
    ws.freeze_panes = "A2"
    for name, values in (("article", "der,die,das"), ("pos", "noun,verb,adj,phrase"), ("source", "agent,me"), ("verified", "yes,no")):
        col = [n for n, _ in WORDS].index(name) + 1
        letter = ws.cell(row=1, column=col).column_letter
        dv = DataValidation(type="list", formula1=f'"{values}"', allow_blank=True, showErrorMessage=False)
        dv.add(f"{letter}2:{letter}2000")
        ws.add_data_validation(dv)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    wb = Workbook()
    readme = wb.active
    readme.title = "Read me"
    for i, line in enumerate(README, start=1):
        readme.cell(row=i, column=1, value=line).alignment = Alignment(wrap_text=True, vertical="top")
    readme.cell(row=1, column=1).font = Font(bold=True, size=14)
    start = len(README) + 1
    for col, (name, _) in enumerate(WORDS, start=1):
        readme.cell(row=start, column=col, value=name).font = BOLD
        readme.cell(row=start + 1, column=col, value=EXAMPLE[name])
    readme.column_dimensions["A"].width = 100

    words_sheet(wb.create_sheet())

    inbox = wb.create_sheet("Inbox")
    for col, (name, note) in enumerate(INBOX, start=1):
        c = inbox.cell(row=1, column=col, value=name)
        c.font = BOLD
        c.fill = HEAD_FILL
        c.comment = Comment(note, "Strecke")
        inbox.column_dimensions[c.column_letter].width = 30
    inbox.freeze_panes = "A2"

    meta = wb.create_sheet("Meta")
    meta.append(["key", "value"])
    meta.append(["schema_version", SCHEMA_VERSION])
    meta["A1"].font = meta["B1"].font = BOLD
    meta.column_dimensions["A"].width = 20

    # Fixed timestamps so the file is byte-identical on every run.
    when = datetime.datetime(2026, 10, 11)
    wb.properties.created = wb.properties.modified = when
    wb.properties.creator = wb.properties.lastModifiedBy = "Strecke"
    wb.save(OUT / "strecke-template.xlsx")

    def write_csv(name, rows):
        with open(OUT / name, "w", newline="", encoding="utf-8") as f:
            csv.writer(f, lineterminator="\n").writerows(rows)

    write_csv("Words.csv", [[n for n, _ in WORDS], [EXAMPLE[n] for n, _ in WORDS]])
    write_csv("Inbox.csv", [[n for n, _ in INBOX]])
    write_csv("Meta.csv", [["key", "value"], ["schema_version", str(SCHEMA_VERSION)]])
    write_csv("Read-me.csv", [[line] for line in README])
    print("template written to", OUT)


if __name__ == "__main__":
    main()
