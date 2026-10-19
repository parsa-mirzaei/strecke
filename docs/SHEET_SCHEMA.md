# Sheet contract

How the learner's Google Sheet becomes words in the app. The sheet is the only content database: a new or edited row enters practice on the next sync, with its exercises generated from whatever columns it has, and keeps its learning history. Code: `core/src/sheet/contract.ts`, `core/src/sheet/ingest.ts`, `core/src/sheet/link.ts`, `core/src/sheet/tabs.ts`, `core/src/data/sheet.ts`. Tests: `core/test/sheet.test.ts`, `core/test/sheet-contract-r4.test.ts`, `core/test/stress.test.ts`, `core/test/template.test.ts`. A ready-made template and a migration guide for an existing list: [template/README.md](template/README.md).

**Schema version: 1.** This is one contract: the Round 3 columns plus the Round 4 additions (`level`, `source`, `added`, `verified`, a free-text `id`, the *Inbox* and *Meta* tabs). A sheet may say which version it follows in its *Meta* tab (`schema_version`); the app reads every version tolerantly and only says so when the number differs from its own.

## How the app reads the sheet

- **Read-only, no Apps Script needed:** in the sheet, *File › Share › Publish to web*, choose only the tab with the words and *Comma-separated values (.csv)*, copy the link, paste it in *Settings › Data*. The app turns a published web-page link (`pubhtml`) into its CSV form, keeps the tab's `gid`, and stores only `https://docs.google.com/spreadsheets/…/pub?…output=csv` links. The sheet's own address (`/spreadsheets/d/<id>/edit`) is refused with an explanation: reading it would need the whole file to be public.
- **One link per tab:** the optional *Inbox* and *Meta* tabs are published the same way and pasted under *Optional tabs*; each has its own `gid`.
- **Privacy trade-off:** anyone who has that link can read that one tab. Publish the word list only, never a tab with personal notes (the private `README` and `config` tabs stay unpublished).
- The link answers browser requests (CORS allowed, checked 2026-10-09: a 307 redirect from `docs.google.com` with `Access-Control-Allow-Origin` for the page, then `*.googleusercontent.com` with `Access-Control-Allow-Origin: *`). The production Content-Security-Policy allows exactly these two hosts for the sheet.
- **When:** in the background on every app open, on every return to the app (online, at most once a minute), and on *Read now*. Practice never waits for it. New words get one calm line on the end screen ("3 new words from your sheet.").
- **CSV file instead of a link:** if the link cannot be read on a phone, the learner downloads the *Words* tab as CSV and picks it (*Settings › Data › Or read a CSV file instead*). It goes through the same ingestion; a file is not re-read by itself.
- **Offline or broken link:** the last good copy on the device stays in use; the error is shown once, quietly, in *Data*.
- Writing answers back to the sheet (the D31 Apps Script `sync`) is not part of this contract; answers stay on the device and in the backup file. The app never writes to the sheet and creates nothing in anyone's Drive.

## Columns

Headers may be in any order, in German or English, in any capitalisation, with spaces or punctuation. A title row above the header is fine (the first of the top five rows that names a word column is the header). Only the word column is required as a header; a row also needs a meaning before it is practised.

| Column | Required | Accepted header names (case and spacing ignored) | Notes |
| --- | --- | --- | --- |
| `de` | yes | de, Wort, word, Lemma, Deutsch, German, Begriff, Ausdruck | the German word or phrase; `der Tisch` in this cell moves the article to `article` when that is empty |
| `en` | per row | en, English, Englisch, Bedeutung, meaning, translation, Übersetzung, Definition | the meaning; a second "Übersetzung"/"translation" column after it is the example's translation |
| `article` | for nouns | Artikel, article, Genus, gender | der/die/das, any case; also m/f/n, maskulin/feminin/neutrum |
| `plural` | no | Plural, Mehrzahl, Pl | the full form (*Haltestellen*) |
| `pos` | no | pos, Wortart, part of speech, Typ, class | noun/verb/adj/phrase, also Nomen, Substantiv, Verb, Adjektiv, Adverb, Ausdruck, Redewendung. Empty: guessed (see below) |
| `domain` | no | domain, Thema, topic, Tag(s), Situation, Bereich, Kategorie | arbeit, uni, amt, alltag, smalltalk, and German or English aliases (Arbeit, Beruf, Studium, Behörde, Alltag, Gespräche …); anything else is ignored |
| `example_de`, `example_en`, `example_form` | no | Beispiel, Beispielsatz, example, Satz / Übersetzung (after a meaning column), example translation / Form | the word must occur in the sentence (or `example_form` must). Up to 30 words |
| `example_2_de`, `example_2_en`, `example_2_form` | no | Beispiel 2, Beispielsatz 2, example 2 … | a second situation |
| `collocation` | no | Kollokation, Wortverbindung, collocation | must contain the word itself |
| `prep` | no | Präposition, preposition, prep | from the closed list |
| `note` | no | Notiz, Notizen, Hinweis, note(s), Kommentar | |
| `wrong_1`, `wrong_2` | no | wrong 1/2, falsch 1/2, distractor 1/2 | hand-picked wrong meanings |
| `word_id` | no | id, word_id, Wort-ID, key | any short unique text (up to 64 characters): it is then the identity. A `w_` + 8 letters/digits value is used as the word id itself |
| `level` | no | level, Niveau, Stufe, CEFR | free text (A2, "B1-ish"); never validated against a list; up to 40 characters, cell safety rules apply |
| `source` | no | source, Quelle, added by, Herkunft | `agent` (an AI assistant wrote the row) or `me`; also AI, KI, Claude, ChatGPT, ich |
| `added` | no | added, date added, Datum, hinzugefügt | a date, `YYYY-MM-DD` or `DD.MM.YYYY` |
| `verified` | no | verified, checked, geprüft | yes/no, ja/nein |
| `status` | no | status | rejected and pending rows are not practised |
| `tier`, `family`, `start_stage` | no | as named | |

- **Unknown columns** (for example the learner's own *Lernstand*) are ignored and listed in *Data*; they stay in the sheet untouched. A repeated column: the first one counts.
- **Two examples in one cell** (a line break or ` | ` between them) become example 1 and example 2 when the second slot is empty.

### Header row and "Fill my list"

The template's header row is `TEMPLATE_HEADERS` in `core/src/sheet/contract.ts` (a test keeps it equal to `docs/template/Words.csv`). Each sync stores the Words tab's header row exactly as written; *Settings › Fill my list* lists exactly those headers, in order, and explains each one through the same alias table, so rows an assistant appends read back as intended (R5-4). Columns the app does not know are listed as "leave empty".

## Optional tabs

| Tab | Columns | What the app does |
| --- | --- | --- |
| `Inbox` | `word` (required), `note`, `processed` (aliases: Wort, Notiz, erledigt, done) | shows "Inbox: N waiting, M done" in *Settings › Data*. Words wait there for the learner's AI assistant, which adds the full row to *Words* and writes a date into `processed`. The app never practises Inbox rows |
| `Meta` | key/value rows, or a header row with the value underneath | reads `schema_version`. Same as the app: nothing shown. Newer, older or unreadable: one plain sentence; the sheet is read anyway |

A missing, empty or unreadable optional tab never stops the words from syncing.

## Rows: validated one by one

Rows are partly written by scheduled ChatGPT or Claude jobs, so each row is checked on its own and one bad row never stops a sync.

- Cells are trimmed, inner spaces collapsed, Unicode normalised (NFC); umlauts and ß are kept.
- **Notes are codes**, worded by the interface in the learner's language and neutral in tone: "Row 12 · Schrank: article missing". Row numbers are the spreadsheet's own (blank rows count), so the learner finds the row at once. Codes: `missing_word`, `missing_meaning`, `article_missing`, `unknown_value`, `cell_dropped` (with a reason such as `url`, `too_long`, `form_not_in_example`), `translation_missing`, `unsafe_word`.
- **Skipped** (listed in *Data* as "Row 12 · …: not used"): no German word, no meaning, or a German word or meaning that breaks the safety rules (a formula, a link, control or invisible characters, characters the app cannot show such as emoji, text that addresses an AI).
- **Used, with a cell left out** (listed as "Row 18 · Feierabend: note: has characters the app cannot show, not used"): any other cell that breaks a rule. The paired cells go with it (an example loses its translation and form too). Nothing is repaired into something the learner did not write.
- **Noted, still used:** a noun without article ("article missing"), an example without translation, an unknown word class or topic value.
- **Word class guess** when `pos` is empty: an article → noun; several words or final punctuation → phrase; "sich …" or a lower-case word in -en/-ern/-eln → verb; another lower-case word → adjective; a capitalised single word → noun. It is a guess; the learner can set `pos` to correct it.
- Limits for the learner's own sheet are looser than for agent rows: sentences up to 30 words and cells up to 320 characters (the card scrolls).

## Identity: which row is which word

The event log (and with it the memory state) is attached to a word id, so the id must survive edits.

1. An `id` column, when present and filled, is the identity, even if the word changes: a `w_` id is used as is; any other text is hashed into a word id (`id:<text>`), so two devices agree.
2. Otherwise the identity is the **normalised word + article** (lower case, article stripped from the word, "sich" stripped from verbs, final punctuation dropped, umlauts kept), plus the **normalised meaning** to tell homonyms apart (*die Bank* = bank / bench are two words).
3. The id is derived from that key with a hash (`w_` + 8 characters), so a reinstalled app or a second device gets the same id without talking to anything.

| Change in the sheet | Result | Why |
| --- | --- | --- |
| New row | a new word, status new; introduced by *new cards per run*, oldest-added first, then in sheet order | — |
| Edited row (same word, other example, plural, note …) | same word, content replaced, history kept; exercises regenerate from the new columns | the learner fixed or extended a row |
| Meaning edited (same word and article) | same word, when it is the only candidate on both sides | a refined meaning is the same word |
| Headword typo fixed (at most two letters, same meaning, class and article, old spelling gone) | same word, history kept | a fixed typo is not a new word |
| Article filled in later (same word, class and meaning; the device's copy had none) | same word, history kept | the learner completed the row |
| Headword changed otherwise (no `id` column) | a new word; the old one is archived | there is no safe way to tell a replacement from a new word; a wrong merge would attach someone else's history |
| Row deleted | archived: not practised, history kept, counted in *Data*; restored with the same id if the row comes back | nothing learned is thrown away |
| Rows or columns reordered | no change | identity never depends on position |
| Exact duplicate row | used once, listed as "duplicate (like row N)" | — |
| Column added later (for example `plural`) | new exercise types appear for that word; memory state and ladder unchanged | exercises are derived, state is not |

Running the same sheet twice changes nothing (tested). The device keeps every word it has ever seen (`strecke.sheet.library.v1` in IndexedDB) with its content hash, first-seen time and status.

## Stress fixture

`core/src/data/stress-sheet.ts` is a committed, synthetic sheet with the cases above: 30+ letter compounds, long phrases, a 25-word example, umlauts and ß, missing example/article/plural, very long meanings, a homonym and an exact duplicate, a one-letter word, quotes, slashes and emoji, a row without meaning, an unknown column; plus `tinyTable()` (3 rows) and `bigTable(500)`. In development: `?sheet=stress`, `?sheet=stress3`, `?sheet=stress500`.
