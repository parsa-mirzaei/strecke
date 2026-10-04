# Phase 0 batch test prompt (20 items, minimal context)

Used for the last two Phase 0 scheduled runs. Replace `<SHEET_ID>` with the test Sheet ID; the filled-in copy lives only in the scheduler.

---

Scheduled batch run for the German learning app "Strecke". No human is present; do not ask questions. Use only the Google Sheets tools (Google Drive only for the fallback). Read only what is listed here.

READ (nothing else: no other tabs, no Drive files, no repository)
1. README!A1:A80 of the Google Sheet <SHEET_ID>. It holds the schema and rules. Follow it.
2. words!B2:B and words!E2:E (de and pos of existing items, any status).
3. inbox!A2:A and inbox!D2:D (de and pos of items still pending import).

GENERATE
4. Exactly 20 new items for A2–B1 learners. About 13 core, 7 chunk. Spread over the five domains; prefer everyday life, transport, shopping, appointments/forms, studying, general working life, normal conversation. Only useful, common items: no obscure words, no specialist or job-specific jargon, no filler.
5. Skip anything already in words or inbox. Compare lower-case with whitespace collapsed; strip a leading der/die/das only when the item is a noun ("Das klingt gut." stays "das klingt gut.").
6. Every row fills de, article (nouns only), en, pos, tier, domain, cloze_1, answer_1, hint_1, cloze_2, answer_2 (a different everyday situation), listen_de, listen_en, wrong_1, wrong_2, source = claude, run_id = claude-batch-<YYYYMMDD-HHMM UTC>. Leave family, capture_id, start_stage, status, reason, word_id empty.
7. Check every row before writing: exactly one ___ per cloze, every sentence at most 14 words, the answer fills the gap exactly. Fix or replace failing rows.

WRITE
8. Append all rows in ONE append call to inbox (range inbox!A1). Write nowhere else.
9. Only if appending fails: create inbox_<run_id>.csv in the Drive folder that contains the Sheet, header = inbox columns from README.

REPORT (your final message, exactly two lines)
RESULT path=<A|B|none> requested=20 generated=<n> written=<n> skipped_as_duplicate=<n> fixed_before_write=<n> confirmations=<n>
METRICS {"ranges_read":[...],"existing_items_examined":<n>,"pending_items_examined":<n>,"tool_calls":<n>,"connector_limitations":"...","notes":"..."}

---
