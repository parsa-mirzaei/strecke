# Storage on the device

Strecke keeps the learner's working state on the phone: the event log (every answer), the settings, and a cached copy of the learner's sheet. The engine (ladder + FSRS) is a pure function of that log, so the log is the one thing that must not be lost. Decisions: [DECISIONS D50, D51](DECISIONS.md).

## 1. Audit: what the app stored before Round 4

| Data | API | Limits and failure modes |
| --- | --- | --- |
| Item states, review events, captures, usage log | `localStorage`, one JSON blob `strecke.proto.v1` (Heft prototype, `MockAdapter`) | Synchronous main-thread writes of the whole blob on every answer. Events silently capped at 2 000 (oldest dropped), usage at 300. A quota error was swallowed: the app kept working in memory and lost everything on reload. One unparseable byte made the whole blob unreadable, and the app then started over from the seed (total loss). Two tabs overwrote each other's blob (last writer wins). Cleared site data or private mode lost everything, with no backup or export apart from copying the usage log as text. |
| Theme | `localStorage` `strecke.theme` | Harmless; needed before first paint. |
| App shell, fonts, icons | Cache Storage (service worker precache) | Rebuilt from the network if evicted; holds no learner data. |
| Audio | none | Web Speech speaks on the fly; nothing is cached. |
| FSRS state | not stored | Derived by replaying the event log (`core/src/scheduler.ts`), so it is never a separate source of truth. |

The security core's `LocalAdapter` and `DemoAdapter` (`core/src/data/`) accept any key-value store, but the browser wiring was still missing (it was Phase C work).

## 2. What is implemented now

| Data | Where | Notes |
| --- | --- | --- |
| Event log | IndexedDB, database `strecke` (preview: `strecke-preview`), store `events`, key `id`, index `ts` | Append-only. One transaction per write; idempotent by event id. |
| Settings, sheet connection, sheet cache, local skips, backup and run bookkeeping | IndexedDB store `kv` (`{k, v}`) | Several keys can be written in one transaction (`setMany`). |
| Damaged records | IndexedDB store `quarantine` | A record that fails the shape check on load is moved here in the same transaction. The rest loads normally; Settings › Data says how many were set aside. |
| Prototype data | IndexedDB store `legacy` | The old localStorage blob, archived unchanged by the one-time migration and included in every backup. |
| Theme and language mirror | `localStorage` `<ns>.theme`, `<ns>.locale` | A copy only, so `index.html` can paint the right theme before the bundle loads. IndexedDB holds the real values. |

Code: [app/src/storage/](../app/src/storage). It is a thin wrapper of about 100 lines (`idb.ts`), not a library.

- **Versioned schema.** `MIGRATIONS` in `store.ts` is an append-only list. Opening the database runs every step above the stored version inside the single upgrade transaction, so an upgrade happens completely or not at all. If another tab opens a newer version, this tab closes its connection instead of blocking the upgrade.
- **Transactions.** `transact()` aborts the whole transaction when its callback throws. An event batch with one malformed event writes nothing (tested).
- **Corruption.** Every stored event is checked (`isLearnEvent`) before the engine sees it. Failures are quarantined, never deleted, and are not included in backups.
- **No IndexedDB at all** (some private modes, blocked site data): the same API runs in memory. Settings › Data then says plainly that progress lasts only until the app is closed.
- **Multiple tabs.** Event writes are idempotent per event, so two tabs append to the same log without overwriting each other. Each tab runs its own visit; the next load replays the merged log.
- **One-time migration** (`migrate.ts`). On the first start of this version, the prototype's blob is archived in `legacy`. Its review events for words that also exist in the current demo deck (matched by the German word) are converted into learning events. The old key is removed only after the IndexedDB transaction has committed. If anything fails, the key stays and the next start tries again. Tested, including an unreadable blob and a failing write.

## 3. Persistent storage

By default, an origin's storage is *best-effort*: the browser may evict it under storage pressure without asking. *Persistent* storage is removed only when the user clears it ([MDN: storage quotas and eviction criteria](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)).

`navigator.storage.persist()` asks for persistence. According to [web.dev: Persistent storage](https://web.dev/articles/persistent-storage):

- Chrome and other Chromium browsers **never show a prompt**. They grant the request automatically when the site seems important (high site engagement, installed or bookmarked, notification permission), and otherwise deny it silently.
- A denied request can be made again later and is judged by the same heuristics.
- Firefox asks the user.

So Strecke asks only **after the first completed run**, never on first load. It asks again at the end of later runs while storage is still not protected, at most once per visit (`shouldAskPersist`).

Settings › Data shows `Storage: protected` / `not protected` / `unknown` (or `this visit only` in memory mode), with one plain sentence on what it means. The result on the real phone (installed PWA, Chrome on Android) can only be checked there.

*Not verified from official documentation in this environment* (the build container could not open MDN or web.dev directly; the facts above come from search summaries of those pages): exact quota sizes per browser, and the length of Safari's eviction window. The app does not depend on either number.

## 4. Log growth

Measured in headless Chromium with the real store:

- One event is about 180 bytes as JSON.
- 50 events a day for a year is 18 250 events. Writing them grew the origin's reported usage (`navigator.storage.estimate()`) by **3.5 MB**.
- A cold reload with that year of events reached the first card in 228 ms on the build machine. A phone is several times slower; check it on the real device.

Verdict: **not a concern.** Ten years of daily use stays in the tens of megabytes, far below any browser's per-origin quota. Replay cost grows linearly; if it ever matters, a derived-state snapshot can be cached next to the log, which stays the source of truth.

## 5. Backup and restore

Settings › Data › *Back up now* writes one file holding the event log, settings, the cached sheet copy and the legacy archive. Device bookkeeping (backup date, run counter, persist result) is left out.

- **Sharing.** Where files can be shared, the file goes to the system share sheet (Web Share API Level 2, `navigator.canShare({ files })`; see [MDN: Navigator.canShare()](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/canShare)). Otherwise it is downloaded.
- **File type.** Chrome accepts only a fixed list of file types for sharing. `.txt`/`text/plain` is on it; `.json`/`application/json` is not ([Chromium `share_service_impl.cc`, `kPermitted`](https://github.com/chromium/chromium/blob/main/chrome/browser/webshare/share_service_impl.cc)). So the file is `strecke-backup-YYYY-MM-DD.txt` and contains JSON.
- **Restore from backup** checks the file and shows a dry run before changing anything: the date, the number of answers, how many are new for this device, how many are already here, how many damaged records will be skipped, and how many settings would be added.
- Restore is a **merge**: it adds missing events and missing settings and never deletes or replaces anything. Restoring the same file twice changes nothing (tested).
- Settings › Data shows the last backup date.
- After 10 completed runs without a backup, one quiet hint appears with *Back up now* / *Not now*. It is shown once per device, ever, with no guilt wording.

Whether the share sheet offers the file to Drive or Files on the test phone can only be checked on that phone.
