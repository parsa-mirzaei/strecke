# Phase 0 agent test prompt

Paste everything between the two lines below as the task prompt in ChatGPT and in the Claude routine. Replace `<SHEET_ID>` with the test Sheet ID (the long part of its URL between `/d/` and `/edit`); the filled-in copy stays out of the repo.
Replace `<AGENT>` with `chatgpt` or `claude` before pasting. Same prompt for every run.

---

This is a scheduled test run for my German learning app "Strecke". Work without asking me questions; I am not at the computer. Use only your Google Drive / Google Sheets tools.

1. Open the Google Sheet "Strecke-test" (ID: <SHEET_ID>). Read the README tab completely and follow its rules.
2. Read the tabs words, word_state, captures and inbox.
3. Prepare inbox rows (source = <AGENT>, run_id = <AGENT>-<current date and time as YYYYMMDD-HHMM>):
   a. For each captures row with status "new": if that word is already in words (any status, compared as README says), skip it. Otherwise prepare one enriched row with capture_id copied.
   b. One row with a new cloze in a new situation for the word with the most lapses in word_state.
   c. Two new A2–B1 words for the domain "arbeit" that are not in words and not already in inbox.
4. Write the rows: append them to the bottom of the inbox tab. If you have no tool that can append rows to a Google Sheet, instead create a CSV file named inbox_<run_id>.csv in the Drive folder "Strecke-test" (the folder that contains this Sheet), as README describes.
5. Test only: in the config tab, put your run_id into the value cell of the row whose key is last_agent_run (overwrite it). If you cannot edit a cell, skip this.
6. Do not change anything else. Do not add tabs.
7. Reply with exactly one line:
   RESULT path=<A sheet-append | B csv-file | none> rows=<n> skipped=<words skipped as duplicates> cell_edit=<yes|no> confirmations=<number of times you needed a human to confirm> note=<anything that failed>

---
