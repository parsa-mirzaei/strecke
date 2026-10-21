# Strecke: what the product is, as built

State of branch `release-1` at `dbe4911` (Next channel v0.2.0, 2026-10-19), checked against the code on 2026-10-21. The original v0.1 plan (Apps Script API, agents, build phases) is kept verbatim in [SPEC-v0.1.md](SPEC-v0.1.md); where it and this file differ, this file describes what the code does. Rules, values and file paths below come from the code unless a doc is named. "Unverified" = needs the Android phone or was not re-checked here.

## Purpose and goals

- A German practice app for A2–B1 learners that opens straight into the first card of a short run: no start screen, no due count, no session to finish (`app/src/App.tsx`).
- Hypothesis from the v0.1 plan: if opening the app puts a German retrieval on screen instantly, the learner opens it in idle moments on at least 5 of 7 days ([SPEC-v0.1.md](SPEC-v0.1.md)). Whether that holds: unverified (no usage evaluation is recorded in the repo).
- One user per copy, "bring your own sheet": the content is the learner's own Google Sheet; nothing personal is in the code (D9, D10).

## Product rules (enforced in code or tests)

| Rule | Where |
| --- | --- |
| No streaks, overdue/backlog counts, comparisons or red; contrast WCAG AA | `app/src/rules.test.ts`, `app/src/styles/contrast.test.ts` (R2-13, Round 2 A4) |
| Every number shown is computed from the device's event log | `core/src/engine/stats.ts` (`dashboard`) |
| UI text only from the string tables; English default, German available; learning content stays German | `app/src/i18n/`, compiler-based test `i18n.test.ts` (R4-5) |
| The app never writes to the sheet, holds no AI keys, never calls an AI service | R4-1; no write path in `app/src/` |
| Only Google "publish to web" CSV links are accepted as a sheet source | `sheetUrl()` in `core/src/engine/settings.ts` |
| Production CSP: scripts from the app only; `connect-src` limited to the app, `docs.google.com`, `*.googleusercontent.com`, `api.elevenlabs.io`, `script.google.com` | `app/vite.config.ts` |
| Audio API key: device only, never exported or logged | `app/src/audio/`, tests (R2-18) |

## Non-goals (not built, by decision)

Streaks, XP, badges, due counts, daily targets, notifications, accounts, speech recognition (CLAUDE.md, SPEC-v0.1 "Out of v0.1"); Google sign-in, any write-back to the sheet, an app-created sheet, live multi-device sync (PORT_MAP "Still deferred"); creating AI schedules from the app (R5-4); per-word pictograms (R2-10); swipe navigation (R2-12).

## Architecture: three layers (R4-1, `docs/ARCHITECTURE.md` §0)

| Layer | What | Code |
| --- | --- | --- |
| Content | The learner's Google Sheet: *Words* tab (required), optional *Inbox* and *Meta* tabs, each read through its own published CSV link; or a CSV file picked once | `app/src/data/source.ts`, `core/src/data/sheet.ts`, `core/src/sheet/` |
| Working state | IndexedDB per channel: event log, sheet library (every row ever seen), settings, device info | `app/src/storage/` |
| App | Static PWA (Vite, TypeScript, Preact; only runtime dependency `preact`) on GitHub Pages, one build per channel | `app/` |

The Apps Script web app, Inbox validator, Core writer, audit and backup modules (D24–D48) exist and are tested in `core/` and `apps-script/`, but the app does not use them.

### Content layer

- Sources (`openSource`): a published CSV link → `SheetAdapter` with a background source; a CSV file → same adapter, no background source; nothing → `DemoAdapter` (bundled synthetic deck). Dev-only fixtures behind `import.meta.env.DEV`.
- Fetch: `cache: 'no-store'`, `credentials: 'omit'`; an HTML answer is rejected (`not_csv`).
- Sync runs on app open and on every return to the app, only when online and at most once a minute (`App.tsx`). A failed read keeps the last good library and records the error; a failing optional tab never fails the words (R4-14).
- Ingestion (`ingest()`): tolerant header aliases (German/English), row-level validation with notes as codes, identity = `id` column or normalised word + article (+ meaning), typo rule, deleted rows archived, never dropped. Contract: [SHEET_SCHEMA.md](SHEET_SCHEMA.md).
- New words are offered oldest-added first, then in sheet order (`introductionOrder()` in `core/src/sheet/ingest.ts`).

### State layer

- One IndexedDB database per channel (`NS` in `app/src/ns.ts`: `strecke`, `strecke-preview`, `strecke-next`). Schema v2 (`MIGRATIONS` in `app/src/storage/store.ts`): `events` (one record per answer, key `<log>|<event id>`, index `log`), `meta` (`{k, v}`), `quarantine` (bad records set aside), and the v1 `kv` store kept untouched.
- Writes: answers of a run are held in memory and flushed in one transaction when the run ends, when the app is hidden (`visibilitychange`, `pagehide`), before backup, restore or update. A failed flush keeps the batch for the next try. Appends are idempotent by event id.
- Without IndexedDB the same API runs in memory (`MemoryAppStore`); nothing persists then.
- `navigator.storage.persist()` is requested after the first completed run, never on first load, and again after later runs while not protected (`persist.ts`).

### Scheduling (round 3 "c0", R3-4)

- **When:** one FSRS-5 memory state per word (published default parameters, target retention 0.9, interval cap 120 days), replayed from the event log (`core/src/fsrs.ts`, `replay()` in `core/src/scheduler.ts`). Deterministic: same log, same state.
- **Which exercise:** per word × type evidence (`chooseByStats`, default `selector: 'stats'`). Levels 0 look, 1 recognise, 2 in context, 3 produce. A word climbs a level when its last four answers one level down are ≥ 60 % right; after a miss it drops below the missed level; with predicted recall < 0.5 it stays at recognition; within a level the least-practised type comes first; the type just shown and the word's last type are avoided. A new word rated *Didn't know* gets its Karte again.
- The Round 2 stage ladder (`chooseForRun`) remains in the code for `selector: 'ladder'` and old-log replay (ENGINE.md).

### Composing a run (`composeRun`, `core/src/engine/run.ts`)

1. Active words with a German word and a meaning.
2. Reviews: due words (lowest predicted recall first), then not-due words (same order); ties broken by a seeded jitter.
3. New words: `min(new per run, unseen words, today's remaining new-word cap, run length)`, in a 2/3 core, 1/3 chunk mix. A run with nothing to review gets one extra new word.
4. New cards are spread through the run and do not open it when a review can.
5. *Practise these* (Verlauf) passes chosen words as `focus`: they come first, no new words.
6. A word appears at most once per run.

### Exercise types (`core/src/exercises.ts`, ENGINE.md "Eligibility")

Karte, Artikel, Bedeutung, Lücke, Präposition, Hören, Tippen, Zweiter Kontext (core types), plus Plural, Kollokation, Reihenfolge (R2-6). Each is generated only when the row has the needed columns; distractors come only from other rows of the same sheet, after an ambiguity guard (`core/src/engine/distractors.ts`). Hören is left out without a German voice. Karte cannot be switched off; the others can (Settings › Practice).

### Grading and rating (`ratingFor()`)

| Exercise | FSRS rating |
| --- | --- |
| Karte | the learner's own choice: *Didn't know* 1, *Partly* 2, *Knew it* 3, *Instantly* 4 (R2-3, R4-4) |
| Any other | wrong or *Don't know* → 1 Again; right with help or slower than the type's `SLOW_MS` (6–25 s) → 2 Hard; right → 3 Good. Easy is never inferred |

Typed answers use a forgiving match (case, ß/ss, umlaut spelling, one or two edits as a near miss; D40, `core/src/typing.ts`). "Secure" = FSRS stability ≥ 21 days (R2-5).

### New words per day (R5-5)

Setting `newPerDay`, default 10, range 0–30 (`DEFAULT_SETTINGS`, `LIMITS`). A word counts as new on the local calendar day of its first answer (`newToday()`). Runs add new words until the day's cap regardless of how many reviews are due; reviews that do not fit stay due. 0 = no new words. Related settings: new per run (default 2, 0–6), run length (default 6, 3–12), run gap (default 20 min, 5–120).

### Runs

Every answer carries the run id. On return after more than the run gap, an unfinished run is dropped and a new one starts (`gapExceeded`). *Don't count this run* (summary) removes that run's answers from the log.

### Backup and restore (`app/src/storage/backup.ts`, R4-3)

- File: `strecke-backup-<date>.txt` containing JSON `{ app: 'strecke', kind: 'backup', version: 1, exportedAt, settings, events, channel }`. `.txt` because Chrome's Web Share accepts it and not JSON (R4-3). Shared via Web Share where files can be shared, else downloaded. Contains settings (including the sheet links) and all answers; not the word library (words come back from the sheet) and never the audio key.
- Restore: validate → **dry run** (answers in the file, new, already there, skipped, settings that would change) → merge-only append of new answers; settings only if the learner chooses. Nothing is ever deleted by a restore.
- One quiet hint after 10 completed runs without a backup (`BACKUP_HINT_AFTER_RUNS`); the last-backup date is shown in *Data*.
- Stable's export file uses the same envelope and restores into Next (R4-3).

### Update safety (R5-1 to R5-3, `RELEASES.md`)

- **Version guard:** before opening, the stored IndexedDB version is read (`indexedDB.databases()`, else an open that aborts creation). Newer than the build knows → `NewerDataError` → a screen with *Export backup* (read-only dump), nothing written. A `VersionError` race never falls back to the in-memory store.
- **Snapshot before migration:** the whole database is copied into `<ns>-snapshots`; the newest 2 are kept (`SNAPSHOT_KEEP`). Restorable from *Settings › Data › Snapshots* through the same dry run. Release 1 did not raise the schema (still v2).
- **Updates wait:** the service worker never calls `skipWaiting()` on install. A waiting build is applied on a tap (*Update now*, end screen and Settings, never in a run; answers flushed first) or at the next app start before the first card. Update checks on return to the app, at most hourly.

### AI intake: "Fill my list" (R5-4, `core/src/sheet/instructions.ts`, `app/src/screens/FillMyList.tsx`)

The app builds a text for the learner's own assistant from the sheet's last-read header row (or `TEMPLATE_HEADERS`), with level (free text), count (1–50, default 10) and an optional topic. The text treats cell content as data, asks only to append rows, sets `source = agent` and leaves `verified` empty, and asks for general everyday words. *Generate now* copies the text to the clipboard, then offers links to the Claude, ChatGPT and Gemini home pages (no prompt in a URL). No schedule is created; whether a scheduled assistant can append rows unattended is unverified (R5-4, `docs/research/ai-providers.md`).

### Channels (README, R3-12, R4-11)

| Channel | Build | Storage namespace | Published from |
| --- | --- | --- | --- |
| Stable | `VITE_NS=preview`, Round 3 `ffa2ad4` | `strecke-preview` | repository `strecke-preview` |
| Next | `VITE_NS=next`, `release-1` | `strecke-next` (+ `strecke-next-snapshots`) | repository `strecke-next`, via `tools/release.ts` |
| Old site | default build of `main` | `strecke` | `strecke` Pages workflow |

Each channel has its own IndexedDB name, localStorage prefix, cache prefix and service-worker scope; each worker deletes only its own `<ns>-<10 hex>` shell caches. Only Next asks its worker to refill a deleted shell ("self-heal", R4-12).

## Quality gates

| Gate | Current status | How checked |
| --- | --- | --- |
| Typecheck (root and app) | pass | `npx tsc --noEmit`, run 2026-10-21 |
| Unit tests | pass: core 463, app 107 | `npx vitest run` in root and `app/`, run 2026-10-21 |
| Size budget ≤ 300 KB compressed (D44) | pass: 262 KB | Next build measured the way `tools/release.ts` does, 2026-10-21 |
| Privacy audit of built files | clean | `tools/privacy-audit.sh --dist app/dist-next`, 2026-10-21 |
| Playwright layout audit (`app/e2e/layout.spec.ts`) | unverified today (not re-run); last extended in commit `bcddfe3` | needs local Chrome; not part of `tools/release.ts` gates |
| Behaviour on the Android phone (install, cold open < 2 s, offline, flap, haptics, audio unlock, Web Share of the backup, text scaling, update row) | unverified | phone only (CLAUDE.md) |
| Published-CSV CORS on the phone | unverified (checked from a desktop 2026-10-09, R3-1; `research/google-signin.md`) | phone only |

`tools/release.ts deploy` runs typecheck and unit tests (root and app), the build, the size budget and the dist privacy audit before publishing.

## Known gaps and deferred items

- Feature E (distractors in the same inflectional slot, stand-in gate, Round 4 simulator report): only on `origin/claude/vibrant-ritchie-90ojw4` (PORT_MAP).
- Google sign-in, write-back, app-created sheet, multi-device sync: deferred; cross-device = backup file only (PORT_MAP).
- Promotion of Next to the Stable repository: deferred (PORT_MAP).
- Old site still live on `main` with a service worker that clears other channels' caches; retiring it is an owner decision (PORT_MAP, isolation).
- Answers live only on the device and in backup files (R3 report "Open risks").
- Disabling a gate type affects promotion only under `selector: 'ladder'`; the ENGINE.md note predates the stats selector (ENGINE.md "Known limits").
- Purely semantic distractor overlaps cannot be detected by rules (R3-11).
- Default of 10 new words per day is marked "open decision for the owner" (R5-5).
- The scheduling choice rests on a synthetic learner; real usage data was to be checked after a few weeks (R3 report). No such check is recorded.

## Discrepancies between code and docs

| Doc says | Code does |
| --- | --- |
| ARCHITECTURE.md §1: PWA status "Phase C–D (Station UI; the Heft prototype … is live until then)"; data adapters "`sheet` speaks the D31 API"; PWA "reaches Core through the `sheet` adapter" | `SheetAdapter` reads published CSV only; no app code calls the Apps Script API; the Heft is only on the old site |
| ENGINE.md "Inputs": event log "synced to the Sheet's `events` tab" | Events are never written to the sheet (R4-1) |
| ENGINE.md "Selection of a run" step 5: "Exercise per card by the ladder above" | Default `selector: 'stats'` uses `chooseByStats`; the ladder only under `selector: 'ladder'` |
| SHEET_SCHEMA.md: link pasted in *Settings › Data*; CSV file under *Settings › Data*; read errors shown in *Data* | The link, file picker and source status are on *Settings › Sheet* (`SheetPage` → `SheetSection`), as R5-6 says |
| SHEET_SCHEMA.md: the CSP "allows exactly these two hosts for the sheet"; R2-18: `connect-src` = app, sheet web app hosts, ElevenLabs | `connect-src` also allows `https://script.google.com` (the unused Apps Script path) |
| PORT_MAP "One definition": backup envelope gains optional `library` and `channel` | `buildBackup()` adds only `channel`; no `library` field |
| README "Status": "the Next channel carries the Round 4 port"; "Docs: Spec … API contract … build phases" | Next runs v0.2.0 from `release-1`; that spec is now `SPEC-v0.1.md` |
| CLAUDE.md: "UI labels in German"; "Ratings … never from self-grade buttons"; "after answering, *Weiter* or swipe up"; Overpass | English default with German (R4-5); four-step Karte self-rating (R2-3); no swipe (R2-12); Barlow (R2-14). Recorded as deviations in design/DECISIONS.md, but CLAUDE.md itself was not updated |
| STATION.md banner: "Under review (2026-10-08, D50)" | Review closed by Round 2 (R2-1, R2-15) |
| `DEFAULT_CONFIG.newPerDay = 5` in `core/src/scheduler.ts` | Only the Phase B picker reads it; the app's cap is the setting (default 10). Not a bug, but two values under one name |
