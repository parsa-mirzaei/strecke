# Strecke security architecture

**AI proposes. Deterministic code validates. Core is authoritative.**

> **Update 2026-10-07 (DECISIONS D45):** the app path changed. The PWA reaches Core through an Apps Script web app with a per-copy token (D31), not through OAuth. The vault design below is now the optional **hardened mode**, which the owner uses for their own data. See [§8](#8-deployment-modes-d45). The agent-side identity boundary, validator, importer, writer, audit and backups are unchanged.

This document fixes *who can touch what* before any real learner data exists. It answers the threats in [THREAT-MODEL.md](THREAT-MODEL.md); test evidence is in [GATE-REPORT.md](GATE-REPORT.md).

## 1. The design rule that follows from the tests

The gate tests showed that for an AI agent using the Claude Google connectors, prompts, sheet protections on the owner's own files, and the routine tool allow-list (`permitted_tools`) do not stop writes. The one control that holds is **Google's own access control: which identity the agent acts as, and which files that identity can open.**

So the architecture is built on identities, not instructions.

## 2. Options considered

| Option | What it means | Verdict |
| --- | --- | --- |
| A. Separate Core and Inbox spreadsheets, same account | Agent gets only the Inbox ID | **Not enough on its own.** Same identity: Drive search finds Core, and any connector session (including chats in unrelated projects) can clear or copy it. Tested: owner identity overrides even strict protection. Kept as part of the final design |
| B1. Separate Google account *for the agent* | Re-sign the Claude connectors into a fresh account with Editor on Inbox only | Strong. Downside: every Claude project then loses the learner's normal Drive; and the boundary fails the day any AI tool (Claude, ChatGPT, …) is connected to the main account again, which is likely over time |
| **B2. Separate Google account *for Core* ("vault")** | Core, backups and the backend script live in a dedicated account that no AI connector is ever signed into. Connectors stay on the learner's everyday account, which gets Editor on the Inbox only | **Chosen.** Same isolation as B1, but the boundary depends on one easy rule ("never connect an AI tool to the vault account") instead of a hard one ("never connect an AI tool to your everyday account"). No change to the learner's existing Claude setup |
| C. Restricted service account | Agent as a Google Cloud service account | Not available: Claude's connectors sign in as a user; no way to hand them a service account |
| D. Direct app-to-Google access with OAuth | The PWA calls the Sheets API with the learner's own short-lived token | **Chosen for the app path.** No endpoint, no shared secret. Token is held by the phone of the person who owns the vault account |
| E. Controlled server-side bridge | A server between app/agents and Sheets | Excluded by the constraints (no server to operate, no paid services) |
| F. Apps Script with real identity checks | Web app "only myself" / execute-as-user | Not workable from a GitHub Pages PWA (cross-origin cookie auth). A token-gated "Anyone" web app is the rejected Phase 0 pattern. Apps Script stays, **without a web endpoint**, as a trigger-driven importer and backup job inside the vault |
| G. Core only on the phone | Sheet only as inbox/outbox | Loses "fix a typo in the Sheet", single-device risk. Rejected; the phone keeps a full copy as a recovery source instead |

## 3. The chosen architecture

```
 Learner's everyday Google account ("connector account")           Dedicated vault Google account
 ── the only identity any AI connector is signed into ──           ── never connected to any AI tool ──

  Claude cloud routine (weekly)                                     ┌───────────────────────────────────┐
  Sheets connector only, no Drive,                                  │ Strecke Core (spreadsheet)        │
  no shell, built-in tools denied                                   │  words · prompts · events         │
        │  get_values / append_values                               │  word_state · captures · config   │
        ▼                                                           │  inbox_log · audit                │
  ┌──────────────────────────────────┐   Editor (resharing off)     │                                   │
  │ Strecke Inbox (spreadsheet,      │◄─────────────────────────────│ Bound Apps Script, triggers only, │
  │ OWNED by the vault account)      │                              │ NO web app:                       │
  │  contract   (protected)          │   reads inbox (formulas as   │  · importer (hourly): Inbox →     │
  │  keys       (protected)          │   text), writes status cols, │    validator → Core writer        │
  │  status     (protected)          │   publishes keys/status/     │  · publisher: agent view → Inbox  │
  │  captures_open (protected)       │   captures_open              │  · backup (daily): snapshot +     │
  │  inbox      agent cols A:T open, │─────────────────────────────►│    manifest + audit head          │
  │             header + U:W locked  │                              └───────────────▲───────────────────┘
  └──────────────────────────────────┘                                              │
                                                     Sheets API, OAuth token of the │ vault account
                                                     (short-lived, no shared secret)│ (drive.file scope)
                                                                    ┌───────────────┴───────────────────┐
                                                                    │ PWA on the phone (GitHub Pages)   │
                                                                    │ IndexedDB copy of Core + event    │
                                                                    │ queue; same Core writer code      │
                                                                    └───────────────────────────────────┘
                                                                    Backups folder (vault): daily JSON snapshots
```

### Two streams, kept distinguishable by code

| Stream | Path | Who decides it is this stream | Lands in Core as |
| --- | --- | --- | --- |
| **Personal capture** | Learner types a word in the app → Core `captures` (`new`) → published to Inbox `captures_open` (only if it passes the content checks) → agent enriches it, copying `capture_id` → importer | The importer: `capture_id` must name an **open** capture in Core, unused in this pass, and the row's word must match the capture text | `words.source = capture`, `status = active`; capture → `processed` |
| **Scheduled expansion** | Weekly routine → appends rows to Inbox `inbox` → importer | The importer: no `capture_id` | `words.source = claude/chatgpt/manual`, `status = pending` → shown as a *Vorschlag* card; only the learner's tap makes it `active` |

An agent cannot move an item from one stream to the other: claiming `source = seed` or `capture` is rejected, a forged or unrelated `capture_id` is rejected, and the importer may only append AI words as `pending` (enforced again in the writer).

## 4. Security boundaries

| Boundary | Where | Enforced by |
| --- | --- | --- |
| **AI-readable data** | Inbox: `contract`, `keys` (dedupe keys only), `status` (3 counts/labels), `captures_open` (id, text, domain of open captures that pass content checks), `inbox` | Google ACL: the connector account can open only the Inbox. Content of the published tabs is produced by `agentView()` ([core/src/importer.ts](../../core/src/importer.ts)) |
| **AI-writable data** | Inbox `inbox`, agent columns A:T, rows 2+ | Sheet protection on everything else in Inbox; this is a real control here because the agent is an *editor*, not the owner |
| **App-readable data** | All of Core | Learner's own OAuth token for the vault account |
| **App-writable data** | Core `events`, `captures` (append); `words` status and edits; `word_state`; `config` (four keys) | Core writer, actor `app` ([core/src/writer.ts](../../core/src/writer.ts)) |
| **Core-only data** | `events`, `word_state`, `config`, `inbox_log`, `audit`, capture context, learner context | Never published; `agentView()` is the only exporter and is tested for leaks |
| **Validation boundary** | Every Inbox row, before anything is written to Core | [core/src/validate.ts](../../core/src/validate.ts): schema, enums, caps, charset, formulas, URLs, invisible characters, instruction-like text |
| **Import boundary** | Inbox → Core | [core/src/importer.ts](../../core/src/importer.ts): header check (fail closed), fingerprints, dedupe, stream rules, per-run and per-pass caps, IDs minted here, per-row dry-run through the writer |
| **Audit boundary** | Every Core write | Hash-chained `audit` tab ([core/src/audit.ts](../../core/src/audit.ts)); each backup stores the chain head |
| **Backup boundary** | Vault Backups folder | Daily snapshot with per-tab SHA-256 manifest ([core/src/backup.ts](../../core/src/backup.ts)); restore refuses a snapshot whose hashes or chain do not verify |

### What the Core writer allows (code-level allow-list)

| Actor | May do | May never do |
| --- | --- | --- |
| `importer` (handles AI output) | append `words` (only `pending`, or `active` when `source = capture`), append `prompts`, append `inbox_log`, close an open capture | touch `events`, `word_state`, `config`; change any existing row; activate a word |
| `app` (learner) | append `events`, `captures`; change word status along allowed transitions; edit `de`/`article`/`en`/`domain`; upsert `word_state`; set four config keys | append words directly; change IDs, `source` or `status` via edit; set unknown config keys |
| `setup` | set config keys | anything else |
| `restore` | nothing through ops; restore is a separate, verified path | — |
| anyone | — | delete, clear, drop or rename anything (these operations do not exist) |

The writer is a guard against *bugs and bad batches*, not against someone holding the vault account's token: that person is the learner. Against that case the defences are the audit chain and backups.

## 5. Permission matrix

| Store / tab | Owner | Readers | Writers | AI access | App access | Deletion allowed | Historical recovery |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Core `words` | vault | vault | importer (append), app (status/edit) | none | read/write | no (status `rejected`/`suspended` instead) | daily snapshot, version history, audit |
| Core `prompts` | vault | vault | importer (append) | none | read | no | same |
| Core `events` | vault | vault | app (append only) | none | read/append | no | snapshot + phone copy, merged by `event_id` |
| Core `word_state` | vault | vault | app (upsert) | none | read/write | no | snapshot; derivable from `events` |
| Core `captures` | vault | vault | app (append), importer (close) | none (filtered copy in Inbox) | read/append | no | snapshot, audit |
| Core `config` | vault | vault | app/setup (4 keys) | none | read/write | no | snapshot, audit |
| Core `inbox_log` | vault | vault | importer (append) | none | read | no | snapshot |
| Core `audit` | vault | vault | writer only (append) | none | read | no | snapshot + head anchor |
| Backups folder | vault | vault | backup trigger | none | none | retention job only (30 daily + 12 monthly) | Drive trash 30 days |
| Inbox `contract` | vault | vault, connector account | vault | read | none | no (protected) | version history; source in repo |
| Inbox `keys`, `status`, `captures_open` | vault | vault, connector account | publisher (vault) | read | none | no (protected) | regenerated from Core every pass |
| Inbox `inbox` | vault | vault, connector account | connector account (A:T), importer (U:W) | read, append | none | rows: no (protected columns span every row); values in A:T: yes | every row already in Core `inbox_log`; version history |
| Phone IndexedDB | learner | app | app | none | full | by the learner (clear site data) | re-download from Core |
| Learner context | vault (Core `config`/README) and `data/private/` locally | learner | learner | **not published** (deliberate change from Phase 0) | read | — | local + snapshot |

## 6. Implementation contracts for Phase 1 (adapters)

The deterministic core is implemented and tested now. The thin adapters that connect it to Google are Phase 1 work and must keep these rules:

1. **Inbox read:** `valueRenderOption=FORMULA` (Sheets API) or `Range.getFormulas()` merged over `getValues()` (Apps Script), so a formula reaches the validator as `=…` text and is rejected (gate test L-9).
2. **Core write:** only the `writes` list from `applyOps()`, executed as `values.append` / keyed `values.update` with `valueInputOption=RAW`; whole batch under `LockService.getScriptLock()` (Apps Script) or a single `batchUpdate` (app).
3. **Inbox write-back:** columns U:W only, from `inboxWriteBack`.
4. **No web endpoint:** the vault script has no `doGet`/`doPost`; `appsscript.json` lists only `spreadsheets` and `drive.file` scopes.
5. **Backups:** daily `snapshot()` JSON into the vault Backups folder; `verifySnapshot()` before any restore; snapshot before every migration.
6. **PWA:** Google Identity Services token client for the vault account, scope `drive.file`, token kept in memory/session only; strict CSP (`script-src 'self' https://accounts.google.com`, `connect-src https://sheets.googleapis.com https://oauth2.googleapis.com`); all content rendered as text, never HTML.
7. **Routine:** Sheets connector only, no Drive, no repository sources, full built-in deny list (see [agents/routine.md](../../agents/routine.md)); `permitted_tools` set as documentation only (not enforced, test L-4).

## 7. What is built now vs later

| Built and tested now ([core/](../../core)) | Phase 1, against the contracts above |
| --- | --- |
| Validator, dedupe key, content checks | Vault account, Core + Inbox creation script, protections |
| Importer with streams, fingerprints, caps, per-row dry-run | Apps Script triggers: importer, publisher, backup |
| Core writer (allow-listed ops, actors, atomic batches) | PWA OAuth sign-in and Sheets adapter |
| Hash-chained audit, missing-row detection | Phone event queue and sync |
| Snapshot, verify, diff, restore, recover-with-merge | Routine on the connector account |
| `agentView()` (minimal AI-readable data) | |

## 8. Deployment modes (D45)

The owner decided on 2026-10-07 that every copy uses one app API: the D31 Apps Script web app (`bootstrap`, `sync`) with a per-copy token. Where Core lives is a deployment choice.

| | Simple mode (default) | Hardened mode (optional; the owner's own data) |
| --- | --- | --- |
| Google accounts | One: the learner's | Two: the everyday account (AI connectors) and a vault account (no AI, ever) |
| Core | In the learner's account | In the vault, shared with nobody |
| Inbox | A tab or spreadsheet in the same account | A separate spreadsheet owned by the vault, Editor for the everyday account, everything but the agent columns protected (§3) |
| Web app | Deployed by the learner, executes as the learner | Deployed from the vault, executes as the vault |
| AI connectors can reach Core | **Yes**, if connectors are signed into that account (gate L-3..L-6) | **No** (identity boundary; isolation tests I-1..I-6) |
| Shared secret | Per-copy token | Per-copy token |
| Setup | Short: one Sheet, one deployment, one token | Owner steps in [OWNER-STEPS.md](OWNER-STEPS.md), then the deployment |

**What changes against §3–§6 for the app path:**
- §6 rule 4 ("no web endpoint") and rule 6 (PWA OAuth) are replaced. The web app is the only endpoint.
- Its rules:
  - It accepts only `POST` with a JSON body.
  - It checks the token in constant time before anything else.
  - It returns `{ ok, error }`, without stack traces.
  - It writes only through `applyOps(actor: app)` under the script lock.
  - It never exposes the Inbox, the audit or `inbox_log`.
- **Token rules:** at least 128 bits of randomness, generated per copy; stored only in Script Properties and on the device; never in URLs, the repo, logs or agent-readable data; rotatable by running one function in the script editor.
- **Threats re-rated:** #6 (public endpoint abuse) and #7 (client-side secret) return as *accepted, mitigated*. Mitigations: an unguessable token, rotation, writer allow-list, append-only events, daily backups, and in hardened mode an endpoint that holds no AI identity. The PWA keeps the earlier rules: strict CSP and text-only rendering, so stealing the token by XSS stays hard.
- **Gate:** the verdict stays FAIL for hardened mode until I-1..I-6 pass. Simple mode does not depend on the gate, because its trade-off is stated, not hidden. The owner's real data goes into a hardened Core only after the gate passes (SPEC Phase F).
