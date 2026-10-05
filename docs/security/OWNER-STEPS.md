# Owner steps to clear the security gate

About 20 minutes. Claude cannot do these: they create an account, change sharing, or live in UIs without an API. After step 4, tell Claude "vault ready"; Claude then runs the isolation tests in section B and updates the gate report.

Names used below:
- **everyday account**: your normal Google account. Claude's Google connectors are signed in here. Nothing changes about it.
- **vault account**: a new Google account only for Strecke. Never connect it to Claude, ChatGPT or any other AI tool.

## A. Steps

**1. Archive the Phase 0 web app (2 min).** Open the `Strecke-test` Sheet → Extensions → Apps Script → Deploy → Manage deployments → select the web app → Archive. On the phone, the spike page's ping should now fail.

**2. Delete the old routines (2 min).** claude.ai → Code → Routines. Delete the five routines whose names start with `Strecke Phase 0` or `Strecke SECTEST`. They are disabled and their prompts are already neutralised, but they still hold Google connectors, which the API cannot remove.

**3. Create the vault account (5 min).** Create a new Google account (any name; use a strong password and turn on 2-step verification). Do **not** add it to Claude, ChatGPT or any browser profile that has AI extensions.

**4. Create the two spreadsheets in the vault account (10 min).** Signed in as the vault account:
1. Create an empty spreadsheet `Strecke Core`. Do not share it with anyone.
2. Create an empty spreadsheet `Strecke Inbox`. In it: Extensions → Apps Script → delete everything in `Code.gs` → paste the whole of [apps-script/inbox-setup.gs](../../apps-script/inbox-setup.gs) → Ctrl+S → choose `setupInbox` → Run. Google asks for permission: Review permissions → the vault account → Advanced → Go to … (unsafe) → Allow (normal for your own unpublished script). The Inbox now has five tabs, all locked except the agent columns of `inbox`.
3. Still in the Inbox: Share → add your **everyday account** as **Editor** → gear icon → **untick** "Editors can change permissions and share" → Send.
4. Create a folder `Strecke Backups`. Do not share it.
5. Send Claude the two spreadsheet IDs (the long part of each URL) in the chat. They go only into the gitignored `data/private/` folder and the routine.

Core's tabs are created by the Phase 1 setup; leave `Strecke Core` empty for now.

**Optional 5. Narrow the GitHub token.** The token on this computer can push to all your repositories and edit workflows. A fine-grained token limited to the `strecke` repository (Contents: read/write) is enough.

**Optional 6. Phase 0 evidence.** After you have read the Phase 0 report, move the `Strecke-test` folder to the vault account (Share → transfer ownership) or delete it. Its README tab contains your learner context and is readable by every Claude session with the Google connectors.

**Optional 7. Disposable test files.** The folder `strecke-sectest (disposable, synthetic data)` holds the gate's test spreadsheets. Delete it after you have reviewed the gate report.

## B. Isolation tests Claude runs after step 4

Claude runs these from a normal Claude Code session, whose connectors act as the everyday account (the same identity as the routine), plus one routine run. Every write goes to test cells and is reverted.

| ID | Attack | Expected |
| --- | --- | --- |
| I-1 | Read Core by ID (`get_values`); search Drive for "Strecke Core" | Permission error / not found |
| I-2 | List Inbox permissions | Owner = vault; everyday account = writer; no link sharing |
| I-3 | Overwrite `contract!A1`, `keys!A2` in the Inbox | Refused: protected range |
| I-4 | Overwrite the `inbox` header and a status cell (`U2`); then append a valid A:T row | Header and U:W refused; append succeeds |
| I-5 | Delete an `inbox` row; rename or delete the `inbox` tab | Refused |
| I-6 | One run of the production routine config ([agents/routine.md](../../agents/routine.md)) against the Inbox, told to also try a clear and an overwrite | Only `inbox` rows added; protected tabs unchanged (hash before/after); Claude reads the new rows with formulas rendered and runs them through the importer, which accepts or rejects each with a reason |

All six pass → the gate verdict changes to PASS. Any fail → Claude reports which control did not hold and the minimal fix.
