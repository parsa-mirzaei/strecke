# Strecke architecture

Strecke is an offline-first PWA for A2–B1 German learners. It opens straight into one practice card, keeps the learner's corpus and history in their own Google Sheet, and accepts new vocabulary that scheduled AI agents propose. Product scope: [SPEC.md](SPEC.md). Decisions: [DECISIONS.md](DECISIONS.md). Security design and evidence: [security/](security/).

**Principle: AI proposes. Deterministic code validates. Core is authoritative.**

## 0. Three layers: what the app runs on today (DECISIONS R4-1)

```
 ┌──────────────────────────────┐  publish to web (CSV,   ┌──────────────────────────────┐
 │ 1 CONTENT: the learner's     │  one link per tab)      │ 3 APP: static PWA            │
 │   Google Sheet               │ ──────────────────────► │   GitHub Pages, no server,   │
 │   Words (+ Inbox, Meta)      │  read-only, never       │   no keys, no AI calls       │
 │   written by the learner and │  written by the app     │   Stable · Next · old live   │
 │   their own AI assistant     │  (or a CSV file)        │   (separate namespaces)      │
 └──────────────────────────────┘                         └──────────────┬───────────────┘
                                                                         │ reads/writes
                                                          ┌──────────────▼───────────────┐
                                                          │ 2 WORKING STATE: the device  │
                                                          │   IndexedDB v2: events (one  │
                                                          │   record each), meta, kv     │
                                                          │   (library, settings),       │
                                                          │   quarantine; backup file    │
                                                          └──────────────────────────────┘
```

- **Content** lives in the sheet. The app reads it through Google's "Publish to web" CSV links (contract: [SHEET_SCHEMA.md](SHEET_SCHEMA.md)), ingests it incrementally and keeps the last good copy on the device. A sync never blocks practice.
- **Working state** lives on the device: the event log (answers, Karte ratings), the library of every row ever seen, settings. Writes happen in one IndexedDB transaction at the end of a run (`app/src/storage/`); damaged records are set aside in `quarantine`, never dropped. A backup file (Web Share or download, merge-only restore with a dry run) protects it.
- **The app** is static files. Each channel has its own IndexedDB name, localStorage prefix, cache prefix and service-worker scope, so channels on one origin never see each other's data (verification in [design/PORT_MAP.md](design/PORT_MAP.md#isolation-verified-2026-10-11)).
- The Apps Script web app, Inbox validator and Core writer below are built and tested in `core/` and `apps-script/`, but the app does not use them in this path; they remain the design for a private write-back path (Phase E).

## 1. Components

| Component | Where | Status | Role |
| --- | --- | --- | --- |
| Security core | [core/src/](../core/src) | Built; record columns, Inbox v2 and the `seed` actor added in Phase B (D38, D48) | Pure TypeScript, no runtime dependencies. Shared by the PWA and the Apps Script backend. Everything that decides whether data may enter or change Core |
| Inbox setup | [apps-script/inbox-setup.gs](../apps-script/inbox-setup.gs) | Built, not yet run | Creates the Inbox tabs and locks all but the agent columns |
| Exercise generator | [core/src/exercises.ts](../core/src/exercises.ts), [record.ts](../core/src/record.ts), [typing.ts](../core/src/typing.ts) | Built (Phase B) | `exercisesFor(word, allWords)`: exercises and distractors derived from a record's columns; compat layer for legacy prompts/clozes ([SPEC "Exercises"](SPEC.md#exercises-generated-from-the-record)) |
| Scheduler | [core/src/scheduler.ts](../core/src/scheduler.ts), [fsrs.ts](../core/src/fsrs.ts) | Built (Phase B); *Dein Weg* evidence in Phase D | Pure fold over the event log: stage ladder (which exercise) + FSRS-5 memory model (when); card picker |
| Data adapters | [core/src/data/](../core/src/data) | `demo`, `local`, `sheet` (published CSV, Round 3/4) built; events through an `EventLog` (IndexedDB v2 in the app) | One `DataAdapter` interface; UI and scheduler never know the source. `sheet` speaks the D31 API and is tested against fakes before any real Sheet |
| Backend | `apps-script/` | Phase E | Web app (`bootstrap`, `sync`, per-copy token, D31/D45) plus triggers: importer (hourly), agent-view publisher, daily backup. Bound to Core: in the learner's account (simple mode) or the vault account (hardened mode) |
| PWA | `app/` | Phase C–D (Station UI; the Heft prototype of MVP2 slice 1 is live until then) | Practice, Dein Weg, Wörter, Hinzufügen, Vorschläge, Einstellungen; IndexedDB cache, event queue. Reaches Core through the `sheet` adapter |
| Agent contract and routine | [agents/contract.md](../agents/contract.md), [agents/routine.md](../agents/routine.md) | Built (docs) | What the weekly agent is told, and the routine configuration that limits it |
| Phase 0 spike | `spike/` | Retired | Throwaway test page and endpoint from the risk spike |
| Tools | [tools/](../tools) | Built | Privacy audit before commits; `seed-check.ts` for seed files; sheet hash manifests for recovery checks; Phase 0 validators |

### Security core modules

| Module | Responsibility | Security role |
| --- | --- | --- |
| [schema.ts](../core/src/schema.ts) | Inbox and Core column lists, keys, enums, limits | Single source of truth for shapes and caps |
| [text.ts](../core/src/text.ts) | Normalisation, dedupe key, content checks | Rejects formulas, URLs, markup, control/invisible characters, instruction-like text |
| [validate.ts](../core/src/validate.ts) | One Inbox row → list of reasons | **Validation boundary** |
| [importer.ts](../core/src/importer.ts) | Inbox sheet → Core operations; `agentView()` | **Import boundary**: header check, fingerprints, dedupe, streams, caps, per-row dry-run; defines the only data agents may read |
| [writer.ts](../core/src/writer.ts) | Applies allow-listed operations per actor | **The only way to change Core**: no delete/clear verbs, immutable IDs, all-or-nothing batches |
| [audit.ts](../core/src/audit.ts) | Hash-chained audit entries, verification | **Audit boundary**: tamper evidence, missing-row detection |
| [backup.ts](../core/src/backup.ts) | Snapshot, verify, diff, restore, recover | **Backup boundary**: verified restore, merge of later learner work |
| [ids.ts](../core/src/ids.ts), [sha256.ts](../core/src/sha256.ts) | ID minting, hashing | IDs never come from AI output; identical hashes on every platform |

## 2. Data stores and trust

The diagram shows **hardened mode** (D45), used for the owner's data. In **simple mode**, the default for every other copy, Core, Inbox and the web app all live in the learner's one Google account. The same validator, importer and writer guard every write, but AI connectors signed into that account can reach Core directly. The setup guide states this trade-off.

```
 everyday Google account (AI connectors)        vault Google account (no AI, ever)
 ┌────────────────────────────┐   Editor        ┌───────────────────────────────┐
 │ Strecke Inbox  (untrusted) │◄──────────────── │ Strecke Core  (authoritative) │
 │ agents read/append here    │ ───────────────► │ importer · writer · audit     │
 └────────────────────────────┘  validated only  │ daily backups                 │
                                                  └──────────────▲────────────────┘
                                                                 │ Apps Script web app + per-copy token (D45)
                                                       PWA on the phone (IndexedDB copy)
```

- **Core**: words, prompts, events, word state, captures, config, `inbox_log`, `audit`. Owned by the vault account, shared with nobody. The app reaches it only through the vault's web app with the per-copy token.
- **Inbox**: owned by the vault, shared as Editor with the everyday account that Claude's connectors use. Holds the agent contract, dedupe keys, a few counts, open captures, and the `inbox` tab where agents append. Everything except the agent columns is protected.
- **Phone**: a full IndexedDB copy of Core plus an event queue. It renders cards without the network and is a recovery source.

## 3. Data flows

**Personal capture stream** (the learner's own words):
`app capture → Core captures (new) → Inbox captures_open → agent enriches with capture_id → validator → importer (capture must be open and match) → Core words (active, source=capture)`

**Scheduled vocabulary expansion stream** (AI suggestions):
`weekly routine → Inbox inbox → validator → importer → Core words (pending) → Vorschlag card → learner accepts → active`

**Practice** (no AI involved): `Core → phone cache → card → event → queue → Core events (append-only, idempotent by event_id)`.

**Backup**: `Core → daily snapshot (per-tab SHA-256 manifest + audit head) → vault Backups folder`; recovery restores a verified snapshot and merges later events by ID.

## 4. Trust boundaries in one table

| From → To | Crossing allowed only through | Fails |
| --- | --- | --- |
| Agent → Inbox | Google ACL + Inbox protections (agent columns only) | Write refused by Google |
| Inbox → Core | `importInbox()` → `applyOps(actor: importer)` | Row rejected with reason, logged in `inbox_log` |
| Core → Agent | `agentView()` → protected Inbox tabs | Nothing else is published |
| App → Core | Web app token check → `applyOps(actor: app)` | Request or batch refused, Core unchanged |
| Backup → Core | `verifySnapshot()` → `restoreSnapshot()` / `recover()` | Tampered snapshot refused |

Details, permission matrix and residual risks: [security/ARCHITECTURE.md](security/ARCHITECTURE.md), [security/THREAT-MODEL.md](security/THREAT-MODEL.md), [security/GATE-REPORT.md](security/GATE-REPORT.md).

## 5. Running the checks

```bash
npm install
npm test
npm run coverage
npm run typecheck
npm run seed-check -- data/seed/seed-50.csv   # the seed file itself is gitignored
bash tools/privacy-audit.sh --all
```
