STRECKE SHEET – README FOR AI AGENTS (read fully before writing anything)

WHAT THIS IS
This Google Sheet feeds "Strecke", a German practice app for one A2–B1 learner. You propose German words, conversation chunks and example sentences. The app shows them as short practice cards. The goal is a wider general vocabulary and easier speaking.

THE ONE RULE
Write ONLY to the tab "inbox". Append new rows at the bottom. Never edit, sort, clear or delete existing rows. Never add, rename or delete tabs. Never touch "words", "prompts", "events", "word_state", "captures" or "config" (read them only).
If your tools cannot append rows to "inbox": create a new CSV file named inbox_<run_id>.csv in the same Drive folder as this Sheet. First line = the inbox column names below, in that order. One item per line. UTF-8.

LEARNER CONTEXT (use it to choose situations for sentences; do not use it to pick specialist vocabulary)
{{LEARNER_CONTEXT}}

WHAT TO PROPOSE
- Level A2 to B1. General, high-frequency vocabulary and everyday conversation phrases.
- No specialist or job-specific vocabulary (no technical terms, no warehouse, lab or industry jargon). The learner picks that up at work.
- Two tiers:
  core = high-frequency A2–B1 words (nouns, verbs, adjectives).
  chunk = ready-made conversation phrases the learner can say as a whole, pos = phrase. Examples: "Wie meinst du das?", "Ich bin gerade dabei, …", "Das klingt gut."
- Mix for new items: about 2/3 core, 1/3 chunk.
- Natural spoken German. Present tense or Perfekt preferred. Sentences the learner could actually say or hear this week.
- The two clozes of one item must be in two DIFFERENT everyday situations (e.g. one at the doctor, one with a colleague).

DOMAINS (column "domain", exactly one; they are everyday situations, not jobs)
arbeit = general working life: meetings, emails, colleagues, interviews, presentations
uni = studying: courses, exams, group work, campus
amt = offices and admin: appointments, forms, letters, bank, insurance
alltag = everyday life: shopping, home, transport, health, plans
smalltalk = chatting: opinions, feelings, weekend, reactions

INBOX COLUMNS (in this order; leave a cell empty if not applicable)
de: the word or chunk without article. Nouns capitalised (Termin). Verbs in infinitive (abholen, sich beschweren). Chunks as said (Wie meinst du das?).
article: der, die or das. Only for nouns. Empty for everything else.
en: short English meaning, max 4 words (appointment; to pick up).
pos: noun, verb, adj or phrase. Use "phrase" for chunks, adverbs, conjunctions and fixed expressions.
tier: core or chunk.
domain: one of the five domains above. (No separate domain for job applications: interviews are arbeit; CV and cover-letter writing are out of scope.)
family: optional word-family root that groups related words (machen for aufmachen, zumachen). Usually empty.
cloze_1: a German sentence with the target replaced by exactly three underscores ___ . Max 14 words. The gap holds the word as it appears in the sentence (inflected, or the conjugated verb part). For a chunk, the gap holds the whole chunk or its key part.
answer_1: the exact text that fills the gap in cloze_1.
hint_1: short English hint for cloze_1, max 6 words.
cloze_2: a second cloze in a DIFFERENT situation. Same rules. Recommended.
answer_2: the exact text for the gap in cloze_2.
listen_de: one full German sentence (no gap) using the item, max 14 words, good to hear aloud. Recommended.
listen_en: English translation of listen_de.
wrong_1: a plausible WRONG English meaning (for multiple choice).
wrong_2: a second plausible wrong English meaning, different from wrong_1.
capture_id: copy the capture_id when the row enriches a capture from the "captures" tab. Otherwise empty.
start_stage: LEAVE EMPTY (only used by the one-time seed).
source: chatgpt or claude (who you are). The learner uses manual or seed.
run_id: the same id on every row of one run: <source>-<YYYYMMDD-HHMM>, e.g. claude-20261005-0700.
status, reason, word_id: LEAVE EMPTY. The import script fills them.

VALIDATION (rows breaking these are rejected)
- de, en, pos, domain, cloze_1, answer_1 are required.
- article only for nouns, and only der/die/das.
- tier empty, core or chunk.
- Each cloze has exactly one ___ .
- Sentences are at most 14 words.
- Do not propose an item whose de already appears in "words" (any status), compared lower-case, without article, spaces collapsed. Rejected items stay in "words" so they are never proposed again.
- To give an EXISTING word more practice, append a row with the same de and new cloze sentences; it is added to that word.
- The learner's own captures are always welcome, whatever their tier.

EXAMPLE ROWS (shown as column: value)
Example 1 (core noun)
de: Verspätung | article: die | en: delay | pos: noun | tier: core | domain: alltag | family: | cloze_1: Der Zug hat heute zwanzig Minuten ___. | answer_1: Verspätung | hint_1: delay | cloze_2: Entschuldigung für die ___, der Bus kam nicht. | answer_2: Verspätung | listen_de: Wegen der Verspätung komme ich etwas später zum Treffen. | listen_en: Because of the delay I'll be a bit late to the meeting. | wrong_1: departure | wrong_2: connection | capture_id: | start_stage: | source: claude | run_id: claude-20261005-0700
Example 2 (chunk)
de: Wie meinst du das? | article: | en: What do you mean? | pos: phrase | tier: chunk | domain: smalltalk | family: | cloze_1: Du findest den Film langweilig? ___ | answer_1: Wie meinst du das? | hint_1: asking to explain | cloze_2: „Das Meeting war interessant.“ – „Hm, ___“ | answer_2: Wie meinst du das? | listen_de: Wie meinst du das? Ich verstehe es noch nicht ganz. | listen_en: What do you mean? I don't quite get it yet. | wrong_1: How are you? | wrong_2: What do you think? | capture_id: | start_stage: | source: chatgpt | run_id: chatgpt-20261005-0700

AT THE END OF A RUN
Reply with one line: what you added (counts, core vs chunk), what you skipped as duplicates, and whether you wrote to inbox (A) or created a CSV file (B).
