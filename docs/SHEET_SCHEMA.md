# Sheet schema (contract version 1)

The learner's Google Sheet is the content layer: the learner and their own AI assistant write it; the app only reads it, through a "Publish to web" CSV link (DECISIONS D49, D56). Code: [core/src/sheet/](../core/src/sheet). The optional template: [template/](template/README.md).

## Principles

- **Any sheet with a `word` column works.** Everything else is optional.
- Columns may be in **any order**, may have **English or German names** (aliases below), and may sit next to **extra columns**, which are ignored. **Empty cells** are fine.
- **Missing optional tabs never break anything.**
- A row is **practised** when it has a word and a meaning. Every further column adds exercises.
- A problem in an optional cell drops that cell, and the row is listed neutrally as needing attention ("Row 12 · Schrank: article missing"). Only a missing word or meaning, a repeated word, or an overlong word keeps a row out of practice.
- The level is **free text** and is never checked against a fixed range.
- The app shows all sheet text as plain text, never as HTML or links.

## Words tab

Header names are matched after normalisation: lower case; ä/ö/ü/ß spelled out; everything but letters and digits removed. So `Example (EN)`, `example_en` and `Example EN` are the same column. The first matching column wins; a repeat is ignored.

| Column | Also recognised as | Meaning | If missing or unreadable |
| --- | --- | --- | --- |
| `word` **(required)** | Wort, de, German, Deutsch, lemma, Vokabel, term, Begriff | German word or phrase. `der Tisch` in this cell moves the article to `article` | Row not practised (`word missing`) |
| `article` | Artikel, art, genus, gender | der/die/das; also m/f/n, masc/fem/neut, r/e/s | Noun still practised, without the article exercise. Noted only if the sheet has an article column or says `noun` |
| `plural` | Pl, Mehrzahl | Full plural form (shown on the Karte) | Not shown |
| `meaning` | en, English, Englisch, translation, Übersetzung, Bedeutung, definition | Short English meaning | Row not practised (`meaning missing`) |
| `pos` | part of speech, Wortart, type, word class | noun, verb, adj, phrase (Nomen, Verb, Adjektiv, Ausdruck, adverb → phrase, …) | Guessed: article → noun; spaces or end punctuation → phrase; capital letter → noun; -en/-ern/-eln → verb; else adj. Only distractor pools depend on it |
| `topic` | domain, Thema, Bereich, situation, category, tag | Any label; arbeit, uni, amt, alltag, smalltalk (and Work, Everyday, …) map to the built-in situations | Label strip shows WORD |
| `example` | example_de, sentence, Satz, Beispiel, Beispielsatz | One sentence containing the word (or `example_form`) exactly once | Dropped and noted if the word is not in it once |
| `example_translation` | example_en, example English, Beispiel Übersetzung | Its translation | Shown only when present |
| `example_form` | form, word form | The surface form in the example (`hole` for `abholen`) | The word itself is used |
| `example_2`, `example_2_translation`, `example_2_form` | example 2, second example, Beispiel 2, … | Second situation (*Zweiter Kontext*) | Dropped and noted without a first example or without the word |
| `collocation` | Kollokation, combination, Wendung | A common combination | — |
| `prep` | preposition, Präposition | Typical preposition (closed list: ab, an, auf, aus, bei, bis, durch, für, gegen, in, mit, nach, ohne, seit, über, um, unter, von, vor, zu, zwischen) | Dropped and noted when not on the list |
| `note` | notes, Notiz, Hinweis, comment, grammar | One short usage note | — |
| `wrong_1`, `wrong_2` | distractor 1/2 | Hand-picked wrong meanings | Distractors come from other rows |
| `level` | Niveau, Stufe, CEFR | Free text (A1…C2, "around my level", anything) | — |
| `source` | Quelle, added by, origin | `agent` (also AI, KI, Claude, ChatGPT) or `me` (also ich, manual) | Unknown. Rows with `agent` get a small AI tag and can be skipped on the device |
| `added` | date added, Datum, hinzugefügt, created | YYYY-MM-DD (also 11.10.2026, 10/11/2026) | Unknown. Used for "Last row added by your AI" |
| `verified` | checked, geprüft, ok | yes / no (ja/nein, x, true/false) | Unknown |
| `id` | word_id, key, Schlüssel | Optional stable identity (any short text) | Identity from the word (below) |

Limits: up to 5 000 rows and 3 MB per tab; a word up to 80 characters, other cells up to 300. Invisible characters are removed and noted.

## Optional tabs

| Tab | Columns | Read as |
| --- | --- | --- |
| `Inbox` | `word` (required), `note`, `processed` | Words the learner jots down for their AI assistant. A row with an empty `processed` is "waiting". The app shows "Inbox tab: N words waiting for your AI". |
| `Meta` | key/value rows, or a header row | `schema_version`. Same as the app's: nothing shown. Newer: "Your sheet says it uses layout version 2; this app reads version 1. Words are still read where the columns match. Reload the app…". Older: everything still read, with a note. Unreadable: ignored, with a note. Missing: nothing shown. |

Each tab is published separately (one CSV link per tab, with its own `gid`). The app accepts a `pubhtml` or `output=html` link and turns it into the CSV form. The sheet's own address (`/spreadsheets/d/<id>/edit`) is refused with an explanation. Its id is kept as the sheet reference for *Fill my list*.

## Row identity, edits, renames, deletions

The app never relies on ids existing.

- **Key:** `id:<id>` when the row has an `id`. Otherwise `w:<lemma>`: the word in lower case and NFC, with a leading der/die/das and final punctuation removed and typographic quotes folded. Umlauts stay distinct (`schön` ≠ `schon`).
  - Article and part of speech are deliberately **not** part of the key. So filling in a missing article later is an edit, not a new word.
- **Edit** any column except the word: same key; progress is kept, and the new content is used from the next sync.
- **Rename** the word: without an `id`, this is a new word and the old one leaves practice. Its answers stay in the device's log, and progress returns if the old spelling comes back. With an `id`, a rename is an edit and progress is kept.
- **Delete** a row: it leaves practice; its answers stay in the log on the device.
- **Reorder** rows: nothing changes.
- **Same word twice:** the first row counts; the later one is noted as "same word as row N" and not practised.

## Sync

- **When it runs:** on connect, on *Sync now*, and automatically when the learner comes back to the app (visibility, focus, back online). Automatic syncs happen at most once a minute, never while offline, and never block a card.
- **Unchanged text:** a CSV that is byte-for-byte the same is not parsed again.
- **Changed text:** the new copy replaces the old, and the difference (added, changed, removed keys) is computed by identity.
- **New rows:** if rows were added, one calm line appears: "2 new words from your sheet."
- **Failures:** a failed read (offline, timeout, unpublished tab, a header without `word`) keeps the last good copy and shows the reason in Settings › Data.
- **Optional tabs:** a failure on Inbox or Meta never fails the sync.
- **Fallback:** if a link cannot be read from the app (see "Open checks"), the learner can import the tab as a downloaded CSV file instead. A file does not update by itself.

## Open checks (cannot be verified from the build environment)

- **CORS.** The app reads the published CSV with `fetch` from another origin (GitHub Pages). This works only if Google's response allows cross-origin reads. Community reports disagree. It could not be tested here, because docs.google.com is unreachable from the build container. **Check on the phone with a real published tab.** If it fails, the app says so and offers the CSV-file import.
- **Refresh delay.** Google's help says changes reach the published version automatically, "might take a few minutes" ([support.google.com/docs/answer/183965](https://support.google.com/docs/answer/183965)). A row an AI assistant has just written may therefore arrive one sync later.
