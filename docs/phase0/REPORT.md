# Phase 0 report

Risk spike, 2–4 Oct 2026. Question: can the three risky parts work before any product is built?
1. An installable offline PWA with German speech, on the test phone (Android, Chrome).
2. A Google Sheet plus Apps Script as the backend.
3. Scheduled AI agents adding vocabulary through a subscription connector, with no paid API.

Evidence comes from routine run logs, the test Sheet itself, and the product owner's phone test. Logs and Sheet IDs stay out of this public repo; the private copy is in `data/phase0/`.

## 1. Test matrix

| # | Test | Result | Evidence | Implication |
| --- | --- | --- | --- | --- |
| 1 | Static hosting on GitHub Pages | PASS | Deploy workflow green; live page loaded; manifest and icons served (HTTP 200) | Hosting settled |
| 2 | PWA install on the test phone | PASS | Product owner: installed from Chrome, opens standalone | Home-screen app without a store |
| 3 | Offline open | PASS | Product owner: opens in airplane mode | Offline-first shell works |
| 4 | Load speed on the phone | PASS (qualitative) | Product owner: "fast". No millisecond figures recorded | Re-measure cold open < 2 s on the real feed |
| 5 | German TTS in the installed PWA | PASS (qualitative) | Product owner: German speech works. Voice name and quality rating not recorded | Browser TTS is enough; no audio files needed |
| 6 | Apps Script web app reachable from the phone | PARTIAL | Spike deployed, setup function ran, phone test reported working. Round-trip times not recorded | Not needed if production drops the public endpoint (section 6) |
| 7 | Test Sheet built by script | PASS | `setupTestSheet` created 6 tabs, headers, warning protections | Script-built Sheets work |
| 8 | Claude reads the Sheet, interactive | PASS | Run 1 read every tab via the Drive connector | — |
| 9 | Claude writes rows, Drive connector only | FAIL | Drive connector has no row or cell tools | Drive alone forces the CSV path (B) |
| 10 | CSV fallback (path B), interactive | PASS | Run 1 created a 4-row CSV in the folder; all rows valid | B works, but needs an import step |
| 11 | Scheduled cloud routine, path B | PASS | Run 2: unattended, 0 confirmations, 187 s, 4 valid rows | Scheduled runs work with the PC off |
| 12 | Scheduled cloud routine writes rows directly (path A) | PASS | Sheets connector: `append_values` added 4 rows, 80 s, 0 confirmations | Direct write possible |
| 13 | Agent edits an existing cell | PASS (security risk) | Path A test overwrote `config!B6`, a tab with warning-only protection | The agent can change any cell; protection does not stop it |
| 14 | 20-item batch, path A | PASS ×2 | Batch 3: 20/20, 221 s, 6 tool calls. Batch 4: 20/20, 143 s, 7 tool calls | 20 items per run works |
| 15 | Batch output passes deterministic validation | PASS | Validator script over all 44 inbox rows: 44/44 schema-valid (one gap per cloze, ≤14 words, valid enums, reserved columns empty) | Agent output quality is high, but still has to be checked by code |
| 16 | Agent skips words already in `words` | PASS | *der Termin* skipped (runs 1, 2, A); no batch item matched `words` | — |
| 17 | Agent skips items already pending in `inbox` | PASS | Batch 4 read 24 pending items: 0 overlaps (validator confirms) | Later runs must read pending rows; they did |
| 18 | Agent skips items only in CSV files (path B) | FAIL (expected) | The path A test proposed *Verspätung*, already in a CSV; the agent never sees CSV files | Dedupe by the agent covers only what it reads; the import step must dedupe against everything |
| 19 | Chunk normalisation | PASS after fix | First validator turned *Das klingt gut.* into *klingt gut.*; now articles are stripped only from nouns | Same rule in the production validator |
| 20 | Same Sheet on consecutive runs | PASS | 4 scheduled runs in a row (2, A test, 3, 4) all hit the right Sheet | — |
| 21 | Stays within the instructed scope | PARTIAL | Batch 4 read one extra range (inbox header). Batch 4 and the validator sent push notifications nobody asked for | Prompts don't fully bind agents; restrict tools technically |
| 22 | Writes only to `inbox` | PASS (by behaviour) | Batch runs changed no other tab (`words`, `config` unchanged afterwards) | Behaviour, not enforcement (see 13) |
| 23 | ChatGPT scheduled task | NOT TESTED | Runs C1–C3 not done | Claude is enough for v0.1; decide whether to drop ChatGPT |
| 24 | Scheduler timing | PASS | One-time runs fired 20–70 s after the set time, every time | Fine for a weekly or on-demand batch |

## 2. Automation verdict

- **Interactive Claude can read the Sheet:** yes (Drive connector reads the whole workbook as text; Sheets connector reads exact ranges).
- **A scheduled routine can read it:** yes. Five unattended cloud runs, the computer not involved, 0 confirmations.
- **Claude can write directly to `inbox`:** yes, with the Google Sheets connector, one `append_values` call per batch. With the Drive connector alone, no.
- **20-item batches work:** yes, twice. 40/40 rows schema-valid (validator). Batch 3: 13 core / 7 chunk, 4 per domain (validator). Batch 4: 13 / 7, all five domains (agent's own report; the validator's line for it was cut off in the log). 2.5–3.5 min each. The German of batch 4 has not been read by a person yet.
- **Later runs deduplicate against pending rows:** yes, when the prompt tells them to read pending `inbox` keys. They cannot see what they don't read (CSV files), so the import step must deduplicate again.
- **The CSV fallback works:** as an artifact, yes (8/8 rows valid). The import from CSV is not built. It is slower and needs the Drive connector, which has wider powers (share, move, trash any file).
- **Still unproven:**
  - ChatGPT.
  - Restricting a routine's connector to specific tools (the routine API shows a `permitted_tools` field; untested).
  - A dedicated Google account for the agent.
  - Direct phone-to-Sheets access via OAuth (section 6 of the proposal).
  - Round-trip times and voice quality as numbers.

## 3. Token efficiency

Exact token counts are not exposed by the platform. Footprints below are judged from what each run loaded.

| Run | What it read | Footprint |
| --- | --- | --- |
| 2 (Drive connector, path B) | Loaded a Google Workspace skill and its ~40 KB Sheets reference, then the whole workbook as text (~40 KB) | LARGE |
| Path A test (first prompt) | All six tabs, full ranges | MEDIUM |
| Batch 3 and 4 | README A1:A80 (~6.4 KB) + `words` de/pos + `inbox` de/pos (one column each) | SMALL |
| Validator | `inbox` A1:W100 (~15 KB), then copied it into a file | MEDIUM (avoidable: see below) |

- **Smallest reliable context:** a short rule sheet plus one column of existing keys plus one column of pending keys. Nothing else was needed for valid, deduplicated 20-item batches.
- **Can be excluded:** repository, spec, source code, `word_state`, `events`, `captures` (unless enriching captures), `config`, Drive files, and skills (run 2 loaded a 40 KB skill on its own; prompts must forbid it).
- **Full repo or spec reads:** unnecessary. No routine had a repository attached, and none needed one.
- **Batching:** clearly better. Every run pays a fixed start-up cost (sandbox, tool discovery, rule sheet) of about 1–1.5 min; generation scales with items. A 4-item run took 80–187 s, a 20-item run 143–221 s. So 20 items cost roughly 1.5× the time of 4 for 5× the output.
- **The rule sheet is the biggest fixed input** (6.4 KB, mostly examples and prose). A 1.5–2 KB contract would do. The dedupe list grows by about 15 bytes per word, so 1,000 words is still SMALL.
- **Recommended cadence:** event-driven batches of about 20, triggered by need rather than by the clock (section 7 of the proposal).
- **Quota risks:**
  - Each routine run starts a full cloud session that counts against the Claude Pro plan.
  - Clock-driven runs with nothing to do waste a session.
  - The Drive-only path reads whole workbooks.
  - Agents can load skills on their own.
  - Validation done by an agent (re-typing 15 KB of JSON) is wasteful; deterministic validation belongs in app or script code, not in a model.

## 4. Security findings

**Acceptable for the Phase 0 spike only:**
- Apps Script web app deployed as "Execute as me, access Anyone", with no token. It reads one number and returns it; it stores no personal data. The URL never entered the repo (audited).
- A throwaway test Sheet and a test Drive folder; one-time routines that disable themselves.

**Unacceptable in production:**
1. **Public, unauthenticated Apps Script endpoint.** Anyone with the URL can call it, and it runs with the owner's Google permissions. Production must not reuse this deployment; archive it now.
2. **Warning-only Sheet protection is not a control.** The Sheets connector wrote straight through it (`config!B6`). Prompt rules ("write only to inbox") are behaviour, not enforcement.
3. **Connectors are account-wide and include destructive tools.**
   - Sheets connector: `update_values`, `batch_clear_values`, `copy_sheet_to_another_spreadsheet` on every spreadsheet the account can open.
   - Drive connector: share, move, trash and copy any file.
   - A confused or prompt-injected run could wipe the corpus or copy it elsewhere.
4. **Agents take unrequested actions.** Two runs sent push notifications nobody asked for; one read an extra range. Tool access must be limited by configuration, not by wording.
5. **Personal context in the Sheet README** is readable by every connector-enabled session on the account. Keep it minimal.
6. **Recovery.** Google version history exists, but there is no snapshot or audit trail of what an agent changed beyond `run_id` on inbox rows.

Production needs least-privilege write paths enforced by Google permissions and tool allow-lists, deterministic validation before anything reaches the corpus, append-only logs, and automatic snapshots.

## 5. Phase 0 exit verdict

Claude path A (direct inbox append) and path B (CSV) are both proven, including unattended 20-item batches with minimal context. Mobile shell, offline, install and TTS pass on the test phone. The open items do not block design:
- ChatGPT is untested; Claude alone is enough.
- Latency and voice-quality numbers will be re-measured on the real feed.
- Tool restriction and a separate agent account are design choices to verify in the first build step.

PHASE 0 READY FOR PHASE 1 DESIGN
