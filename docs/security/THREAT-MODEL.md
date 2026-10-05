# Strecke: attack surface and threat model

Status 2026-10-05, after Phase 0 and before any real learner data. Companion docs: [ARCHITECTURE.md](ARCHITECTURE.md) (the design that answers these threats) and [GATE-REPORT.md](GATE-REPORT.md) (what was tested).

## 1. Attack surface inventory (as found, before changes)

| Surface | What exists | Authority it carries | Exposure |
| --- | --- | --- | --- |
| **Public endpoint** | Phase 0 Apps Script web app, "execute as owner, access Anyone", no token. Code: [spike/apps-script/Code.template.gs](../../spike/apps-script/Code.template.gs) | Runs as the learner's Google account; code only reads one row count | Anyone with the URL. URL lives only on the test phone, not in the repo (audited) |
| **Static site** | GitHub Pages serves `spike/web` (test page). Stores the pasted endpoint URL in the phone's `localStorage` | None | Public; no secrets in the bundle |
| **Google accounts** | One: the learner's main account. It owns the test Sheet and the Drive folder, and it is the account the Claude Google Sheets and Google Drive connectors are signed in as | Full Drive and Sheets of that account | Every Claude session with those connectors (cloud routines, desktop/web chats, Claude Code) |
| **Spreadsheets** | `Strecke-test` (README with learner context, inbox with 44 AI rows, words, word_state, captures, config). Owner-only, not shared | — | Readable and writable by every connector session above |
| **Sheet protections** | Warning-only on words, word_state, captures, config | None against the owner: the connector *is* the owner | — |
| **Drive files** | Two Phase 0 CSV artifacts in the test folder | — | Same as spreadsheets |
| **AI write surfaces** | Sheets connector: `append_values`, `update_values`, `batch_clear_values`, `copy_sheet_to_another_spreadsheet`, `update_spreadsheet`, `insert_dimension`, `update_formulas`. Drive connector: `create_file`, `update_file`, `copy_file`, `share_file`, `trash_file` | Any spreadsheet or file the account can open, by ID; Drive search finds them by name | All connector sessions |
| **Browser write surfaces** | None yet (no app). Planned: the PWA writes events, captures, word state | — | — |
| **Scheduled jobs** | Four Phase 0 cloud routines, all disabled after firing once. Each had both Google connectors with `permitted_tools: []` (= all tools) and Bash. One downloaded and executed a script from the public repo's `main` branch | Full connector access + shell | Re-enable or "Run now" in the routines UI |
| **Destructive tools exposed to agents** | Clear, overwrite, copy-out (Sheets); share, trash, overwrite, copy (Drive). No permanent delete | — | — |
| **Credentials / tokens** | No `APP_TOKEN` was ever created. No `.env`, no `.clasprc.json`. GitHub CLI token in the OS keyring with `repo` + `workflow` scope on all of the owner's repos. claude.ai connector OAuth grants (held by Anthropic, not on disk) | Push to the public repo and edit its deploy workflow | Local processes on the dev machine |
| **Client-side secrets** | None (no app yet; spike has none) | — | — |
| **Config that could leak authority** | Routine prompts contain the test Sheet ID (stored in the routines service, not the repo). `data/private/` holds the learner context and the filled-in runbook (gitignored) | An ID is enough to read/write a sheet for any session of the account | Local disk, routines service |
| **Backup / recovery** | Google version history only. No snapshots, no audit beyond `run_id` on inbox rows | — | — |
| **Logs / audit** | Routine run logs (claude.ai), Drive activity, Sheets version history | — | — |
| **Repo / supply chain** | Public repo; deploy workflow uses tag-pinned actions; npm devDependencies (vitest, typescript) with install scripts blocked | — | — |

## 2. What Phase 0 and this gate proved about the platform

- Warning-only protection is not a control (Phase 0, test 13).
- **Strict protection is not a control either when the agent signs in as the owner**: the API reports `requestingUserCanEdit: true`, and a routine overwrote a strictly protected tab (gate test L-3).
- **The routine `permitted_tools` field is not enforced**: with it set to `get_values, append_values`, a routine listed all nine Sheets tools and successfully ran `update_values`, `batch_clear_values` and `copy_sheet_to_another_spreadsheet` (L-4..L-6).
- **The routine built-in tool deny list is enforced**: Bash, PushNotification, Agent, CronCreate, SendMessage and others were absent when denied (L-7).
- **An empty `allowed_tools` means the full default preset**, not "none" (L-8).
- **Connector writes are interpreted**: a cell written as `=HYPERLINK(…)` becomes a live formula, and plain reads return the computed text (L-9).
- A model sometimes refuses an obviously hostile instruction (run 1) and sometimes follows the same actions phrased as maintenance (run 2). Refusal is behaviour, not a boundary.

**Conclusion:** the only structural control available for connector-driven agents is *which Google identity they act as* and *what that identity can open*. Everything else (prompts, protections on the owner's own files, tool allow-lists) failed or is unenforced.

## 3. Threat model

Likelihood and impact: L/M/H, for a single-user personal MVP. "Current" = the state found above. "Required" = what [ARCHITECTURE.md](ARCHITECTURE.md) puts in place. Test IDs refer to [GATE-REPORT.md](GATE-REPORT.md).

| # | Threat | Asset at risk | Likely cause | Lik. | Imp. | Current mitigation | Required mitigation | Test |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Agent writes to the wrong tab | Core content | Confused run, schema drift | M | H | Prompt rule only | Agent identity cannot open Core at all; in Inbox, every tab except the agent columns of `inbox` is protected against the agent identity | L-3, I-3, I-4 |
| 2 | Agent deletes or clears data | Corpus, history | Mistake or injection | M | H | None (Phase 0 cleared/overwrote freely) | Same identity boundary; Inbox rows cannot be deleted (row spans protected columns); every imported row already copied to Core `inbox_log`; backups | L-5, I-5, R-* |
| 3 | Agent copies private data elsewhere | Progress, captures, learner context | Injection, over-eager run | L | M | None (copy-out succeeded) | Agent identity sees only Inbox, which holds dedupe keys, counts and filtered open captures: no history, no progress, no context | L-6, I-1, U-agentView |
| 4 | Agent follows malicious content stored in a Sheet | Everything the agent can reach | Text in a cell read as instructions | M | M | Prompt rule | Agent reads only Inbox tabs; published text is short and filtered; agent's reach is the Inbox only, so a hijacked run's worst case is Inbox damage | U-agentView, I-* |
| 5 | Prompt injection via captured or imported text | Agent behaviour, app display | Learner pastes text from a web page; agent writes instructions into fields | M | M | None | Validator rejects instruction-like text, URLs, markup, control/invisible characters, formulas; captures that look like instructions are not published to the agent; app renders text only (no HTML) | U-inj-* |
| 6 | Public endpoint abuse | Owner's Google authority | URL leaks, scanning | L | M | Spike endpoint does almost nothing | No web endpoint in production: no `doGet`/`doPost` deployed; spike deployment archived | O-1 (owner step) |
| 7 | Client-side secret extraction | Core | Secret bundled in the PWA | — | H | No app yet | No shared secret: the PWA uses the learner's own Google sign-in (OAuth, short-lived token, vault account only) | Phase 1 step 1 |
| 8 | Overbroad Google permissions | Unrelated Drive data, Core | Connectors are account-wide | H | H | None | Core lives in a dedicated vault account that no AI connector is ever authorized as; the connector account gets Editor on one file | I-1, I-2 |
| 9 | Cross-project connector risk | Core | A chat in another project ("tidy my Drive") reaches Core | M | H | None | Same as 8: Core is invisible to every connector session | I-1, I-2 |
| 10 | Accidental overwrite of Core data | Corpus | Bug in app or importer | M | H | None | Core writer: closed op list, no delete/clear verbs, per-actor permissions, immutable IDs, all-or-nothing batches, audit | U-writer-* |
| 11 | Duplicate / corrupt imports | Corpus quality | Agent re-appends, importer re-runs | H | M | Agent-side dedupe only | Content fingerprints in Core `inbox_log`, dedupe key unique across all statuses, per-run and per-pass caps | U-replay-*, U-dup-* |
| 12 | Malformed data bypassing validation | App stability, corpus | Clever agent output, formulas | M | M | Phase 0 script, advisory | Deterministic validator + writer re-checks; header tamper fails closed; formulas read as text and rejected; fuzzing | U-*, fuzz, L-9 |
| 13 | Loss of data after a bad deploy or sync | History | Buggy sync wipes rows | M | H | Version history | Daily snapshot with SHA-256 manifest and audit head; phone keeps its own event copy; recovery merges by ID | R-1..R-4, L-10 |
| 14 | Scheduled routine doing more than intended | Everything reachable | Over-capable tools | M | M | Prompt | Routine: Sheets connector only, signed in as the connector account; full built-in deny list (enforced); no repo, no shell | L-7, I-6 |
| 15 | Unauthorized read of private progress/history | Events, word state, captures | Connector sessions, sharing | M | M | None | Core in vault account, never shared; Inbox carries no progress | I-1, U-agentView |
| 16 | Accidental sharing of private spreadsheets | Core | Owner or agent clicks share | L | H | None | Vault account shares nothing except Inbox; Inbox editors cannot reshare; quarterly sharing check in the runbook | I-2, I-5 |
| 17 | Replay / idempotency problems | History, corpus | Offline sync retries, re-imports | H | M | Spec only | Writer: identical re-append is a no-op, conflicting re-append is refused; importer fingerprints | U-replay-* |
| 18 | Destructive or irreversible migrations | Corpus, history | Schema change script | L | H | None | Writer has no column/tab operations; migrations run only on a restored copy first; snapshot before every migration | R-4 |

Additional threats found during the work:

| # | Threat | Finding | Mitigation | Test |
| --- | --- | --- | --- | --- |
| 19 | One hostile row blocks every import (denial of service) | **Found by fuzzing:** `run_id = "-1"` made the writer refuse the whole batch; an identical row twice in one sheet did the same | Importer stores only well-formed labels; dry-runs each row through the writer and logs refusals per row; tracks fingerprints within a batch | U-dos-1, U-dos-2, fuzz |
| 20 | Live formulas in Inbox cells | Connector writes are user-entered: formulas execute, reads return computed text | Importer must read with formulas rendered (`FORMULA`) and rejects any leading `=`/`+`/`-`/`@` | L-9, U-inj-formula |
| 21 | Remote code from the repo executed by a routine | Phase 0 validator routine ran `curl …/main/…py \| python` | No Bash for routines; deterministic code runs in Apps Script/PWA from reviewed builds | L-7 |
| 22 | Broad GitHub token on the dev machine | `repo` + `workflow` on all repos | Recommend a fine-grained token limited to this repo (owner step, optional) | — |
