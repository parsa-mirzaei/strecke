STRECKE SHEET – README FOR AI AGENTS (read fully before writing anything)

WHAT THIS IS
This Google Sheet feeds "Strecke", a German practice app for one A2–B1 learner. You propose German words and conversation chunks as records: one row per word, with example sentences. The app builds its exercises from the columns of each row. The goal is a wider general vocabulary and easier speaking.

THE ONE RULE
Write ONLY to the tab "inbox". Append new rows at the bottom. Never edit, sort, clear or delete existing rows. Never add, rename or delete tabs. Never touch any other tab (read them only).

LEARNER CONTEXT (use it to choose situations for sentences; do not use it to pick specialist vocabulary)
{{LEARNER_CONTEXT}}

WHAT TO PROPOSE
- Level A2 to B1. General, high-frequency vocabulary and everyday conversation phrases.
- No specialist or job-specific vocabulary (no technical terms, no warehouse, lab or industry jargon). The learner picks that up at work.
- Two tiers:
  core = high-frequency A2–B1 words (nouns, verbs, adjectives).
  chunk = ready-made conversation phrases the learner can say as a whole, pos = phrase. Include phrases for gaining time, asking someone to repeat, and being unsure. Examples: "Wie meinst du das?", "Lass mich kurz überlegen.", "Ich bin mir nicht sicher."
- Mix for new items: about 2/3 core, 1/3 chunk.
- Natural spoken German. Present tense or Perfekt preferred. Sentences the learner could actually say or hear this week.
- The two examples of one word must be in two DIFFERENT everyday situations (e.g. one at the doctor, one with a colleague).

DOMAINS (column "domain", exactly one; they are everyday situations, not jobs)
arbeit = general working life: meetings, emails, colleagues, interviews, presentations
uni = studying: courses, exams, group work, campus
amt = offices and admin: appointments, forms, letters, bank, insurance
alltag = everyday life: shopping, home, transport, health, plans
smalltalk = chatting: opinions, feelings, weekend, reactions

INBOX COLUMNS (in this order; leave a cell empty if not applicable)
de: the word or chunk without article. Nouns capitalised (Termin). Verbs in infinitive (abholen, sich beschweren). Chunks as said (Wie meinst du das?).
article: der, die or das. Only for nouns. Empty for everything else.
plural: nouns only, the full plural form (Termine, Haltestellen). Empty if there is none in everyday use. Never start a cell with a dash.
en: short English meaning, max 4 words (appointment; to pick up).
pos: noun, verb, adj or phrase. Use "phrase" for chunks, adverbs, conjunctions and fixed expressions.
tier: core or chunk.
domain: one of the five domains above.
family: optional word-family root that groups related words (machen for aufmachen, zumachen). Usually empty.
example_de: one natural German sentence using the word, max 14 words. Required.
example_en: its English translation. Required.
example_form: the exact form of the word as it appears in example_de (kümmere, abgeholt, Kollegen). Leave empty if it appears exactly as in "de". It must appear exactly once in the sentence. For a separable verb, choose a sentence where it stays in one piece (abholen, abgeholt).
example_2_de: a second sentence in a DIFFERENT situation. Same rules. Recommended.
example_2_en: its English translation.
example_2_form: the exact form in example_2_de, or empty if it is "de".
collocation: a common combination, e.g. "einen Termin vereinbaren". Optional.
prep: the typical preposition, only if the word usually takes one (zuständig → für, sich kümmern → um). One of: ab, an, auf, aus, bei, bis, durch, für, gegen, in, mit, nach, ohne, seit, über, um, unter, von, vor, zu, zwischen.
note: one short usage or grammar note, only if it prevents a typical mistake (zuständig für (Akkusativ)). Optional. No "+" or "=" signs.
wrong_1: a plausible WRONG English meaning (for multiple choice). Optional.
wrong_2: a second plausible wrong English meaning, different from wrong_1. Optional.
image_key: leave empty unless the word is a concrete noun from the app's pictogram list. Optional.
capture_id: copy the capture_id when the row enriches one of the learner's captures. Otherwise empty.
start_stage: LEAVE EMPTY.
source: claude or chatgpt (who you are).
run_id: the same id on every row of one run: <source>-<YYYYMMDD-HHMM>, e.g. claude-20261007-0700.
status, reason, word_id: LEAVE EMPTY. The import script fills them.

VALIDATION (rows breaking these are rejected)
- de, en, pos, domain, example_de, example_en, source and run_id are required.
- article only for nouns, and only der/die/das; plural only for nouns.
- tier empty, core or chunk; chunks have pos = phrase.
- Every example has at most 14 words, contains its form exactly once, and comes with a translation.
- prep only from the list above.
- Letters, digits and ordinary punctuation only. No URLs, no markup, no formulas, nothing starting with = + - @.
- Do not propose an item whose de already appears in the Sheet (any status), compared lower-case, without article, spaces collapsed. Rejected items stay so they are never proposed again.
- The learner's own captures are always welcome, whatever their tier.

EXAMPLE ROWS (shown as column: value)
Example 1 (core noun)
de: Haltestelle | article: die | plural: Haltestellen | en: stop (bus, tram) | pos: noun | tier: core | domain: alltag | family: | example_de: Wir steigen an der nächsten Haltestelle aus. | example_en: We get off at the next stop. | example_form: | example_2_de: Treffen wir uns an der Haltestelle vor der Uni? | example_2_en: Shall we meet at the stop in front of the university? | example_2_form: | collocation: an der Haltestelle warten | prep: an | note: | wrong_1: station hall | wrong_2: crossing | image_key: bus | capture_id: | start_stage: | source: claude | run_id: claude-20261007-0700
Example 2 (chunk)
de: Wie meinst du das? | article: | plural: | en: What do you mean? | pos: phrase | tier: chunk | domain: smalltalk | family: | example_de: Wie meinst du das? Ich verstehe es noch nicht ganz. | example_en: What do you mean? I don't quite get it yet. | example_form: | example_2_de: „Das Meeting war interessant.“ – „Hm, wie meinst du das?“ | example_2_en: “The meeting was interesting.” – “Hm, what do you mean?” | example_2_form: wie meinst du das? | collocation: | prep: | note: | wrong_1: How are you? | wrong_2: What do you think? | image_key: | capture_id: | start_stage: | source: claude | run_id: claude-20261007-0700

AT THE END OF A RUN
Reply with one line: what you added (counts, core vs chunk) and what you skipped as duplicates.
