# Phase 0 runbook – what the product owner does

About 25 minutes in total, spread over one evening. Claude Code does the Claude agent runs, reads the Sheet and fills the checklist. You do four things: **A** GitHub login, **B** Apps Script paste, **C** three ChatGPT runs, **D** phone test.

Links (the filled-in copy of this runbook, with real links, is `data/private/RUNBOOK.local.md`, gitignored)
- Test Sheet: `<SHEET_URL>`
- Drive folder: `<FOLDER_URL>`
- Claude routine: `<ROUTINE_URL>` (you don't need to touch it)

---

## A · GitHub login (2 min, once)

1. Open the Terminal panel in this app and run:

   ```bash
   "/c/Program Files/GitHub CLI/gh.exe" auth login --web --git-protocol https
   ```
2. Copy the one-time code it shows, press Enter, sign in to GitHub in the browser, paste the code.
3. Tell Claude "gh done". Claude creates the public repo `strecke`, pushes, and turns on GitHub Pages.

## B · Apps Script (5 min, once)

1. Open the **Test Sheet** link above (on the computer).
2. Menu **Extensions → Apps Script**.
3. In `Code.gs`, select all and delete. Paste the full contents of `build/spike/Code.gs` (generated locally by `python tools/phase0/build_spike.py`; gitignored because it contains your private context). Press **Ctrl+S**.
4. In the toolbar, choose the function **setupTestSheet**, click **Run**.
   Google asks for permission: **Review permissions** → your account → **Advanced** → **Go to … (unsafe)** → **Allow**. This is normal for your own unpublished script.
5. Back in the Sheet you should now see the tabs README, inbox, words, word_state, captures, config.
6. **Deploy → New deployment** → gear icon → **Web app**. Execute as: **Me**. Who has access: **Anyone**. **Deploy** → copy the **Web app URL** (ends in `/exec`).
7. Send that URL to your phone (for example in a note to yourself). Don't post it anywhere public.
8. Tell Claude "sheet ready". Claude then runs the Claude tests.

## C · ChatGPT runs (3 runs, about 10 min of your time)

Before run 1: in ChatGPT go to **Settings → Apps / Connectors** and make sure **Google Drive** (and **Google Sheets**, if listed) is connected with the same Google account. The menu names change often; any connector that opens Google files counts.

The prompt (same text for all three runs) is in the box below. Copy it exactly.

```text
This is a scheduled test run for my German learning app "Strecke". Work without asking me questions; I am not at the computer. Use only your Google Drive / Google Sheets tools.

1. Open the Google Sheet "Strecke-test" (ID: <SHEET_ID>). Read the README tab completely and follow its rules.
2. Read the tabs words, word_state, captures and inbox.
3. Prepare inbox rows (source = chatgpt, run_id = chatgpt-<current date and time as YYYYMMDD-HHMM>):
   a. For each captures row with status "new": if that word is already in words (any status, compared as README says), skip it. Otherwise prepare one enriched row with capture_id copied.
   b. One row with a new cloze in a new situation for the word with the most lapses in word_state.
   c. Two new A2–B1 words for the domain "arbeit" that are not in words and not already in inbox.
4. Write the rows: append them to the bottom of the inbox tab. If you have no tool that can append rows to a Google Sheet, instead create a CSV file named inbox_<run_id>.csv in the Drive folder "Strecke-test" (the folder that contains this Sheet), as README describes.
5. Test only: in the config tab, put your run_id into the value cell of the row whose key is last_agent_run (overwrite it). If you cannot edit a cell, skip this.
6. Do not change anything else. Do not add tabs.
7. Reply with exactly one line:
   RESULT path=<A sheet-append | B csv-file | none> rows=<n> skipped=<words skipped as duplicates> cell_edit=<yes|no> confirmations=<number of times you needed a human to confirm> note=<anything that failed>
```

**Run C1, interactive.** New chat, turn on the Google Drive connector for the chat, paste the prompt, send. If ChatGPT asks you to confirm anything, confirm, and **count how many times**. Copy its RESULT line.

**Run C2, scheduled 5 minutes ahead.** New chat. Type `Schedule a one-time task for <time 5 minutes from now> today with exactly this prompt:` then paste the prompt. Check that the task shows up in ChatGPT's **Tasks** list. Don't touch the computer until it has run. Open the task's result and copy its RESULT line.

**Run C3, while you're away.** Same as C2, but schedule it 30–60 minutes ahead, then close the laptop or leave. Later, open the result and copy the RESULT line.

If ChatGPT refuses to create a task with connectors, or the task runs but says it has no access to Google: that is a result, not a mistake. Copy what it says.

Send Claude the three RESULT lines (or what ChatGPT said instead) and the number of confirmations in C1.

## D · Phone test (5 min, Android + Chrome)

1. On the phone, in **Chrome**, open `https://<github-user>.github.io/strecke/` (Claude sends you the exact link after step A).
2. Chrome menu **⋮ → Add to home screen → Install**. Open **Strecke·0** from the home screen (not from Chrome).
3. Paste the Web app URL from B7 into the field. Tap **Ping 6×**. Wait for the six lines.
4. Turn Wi-Fi off (mobile data on) and tap **Ping 6×** again.
5. Tap **Sprechen**, then **Satz 2**. Did you hear German? Does it sound acceptable to listen to every day (1 = robotic, 5 = natural)?
   - No sound or "NO GERMAN VOICE": Android **Settings → search "Text-to-speech" → Preferred engine: Speech Services by Google → settings → Install voice data → Deutsch (Deutschland)**, then retry.
6. Tap **Copy results** and paste them to Claude together with your 1–5 rating.
7. Airplane mode on. Close the app completely (swipe it away) and open it from the home screen again. Does the page appear? (yes/no). Airplane mode off.

That's all. Claude fills the checklist below and writes the decision into `docs/DECISIONS.md`.

---

## Checklist (filled by Claude from the Sheet, the run logs and your RESULT lines)

Cells: yes / no / unverified (only when tested and the result was ambiguous).

| Capability | ChatGPT scheduled task | Claude cloud routine |
| --- | --- | --- |
| Finds the Strecke Sheet by ID or name in a scheduled run | | |
| Reads rows from `README`, `words`, `word_state`, `captures` | | |
| Appends rows to `inbox` (path A) | | |
| Creates a CSV file in the Sheet's Drive folder (path B) | | |
| Updates an existing cell (`config.last_agent_run`) | | |
| Runs with no manual confirmation per write | | |
| Hits the same Sheet on 3 consecutive runs | | |
| Puts values in the right columns per `README`, adds no tabs | | |
| Skips words already in `words` (the capture that duplicates a word) | | |
| Works while the learner is away from the computer | | |

| Phone check (Android, Chrome) | Result |
| --- | --- |
| Installs to home screen, opens standalone | |
| Round-trip, Wi-Fi: first / warm median | |
| Round-trip, mobile data: first / warm median | |
| German voice available (name, local/network) | |
| Voice quality 1–5 | |
| Opens offline from home screen | |
