# Journey: how Strecke got here

Built from `git log --all` (all local and remote branches), [DECISIONS.md](DECISIONS.md) (D1–D51), [design/DECISIONS.md](design/DECISIONS.md) (R2-1 … R5-7), [design/PORT_MAP.md](design/PORT_MAP.md), [../RELEASES.md](../RELEASES.md) and the round reports. Where a source gives no reason, the text says "reason not recorded".

## Timeline

| Dates | Round | What changed | Why | Result | Commits |
| --- | --- | --- | --- | --- | --- |
| 2026-10-02 | Setup | Privacy guardrails (gitignore, audit script), spec, decision log, Phase 0 spike (phone test page, Apps Script stub, agent prompt), API-based push helper | Public portfolio repo (D10); `git.exe` blocked by the machine's firewall, `gh.exe` allowed (D20) | Spike page live on the old site | `fd19a6e` → `631775c` |
| 2026-10-02 → 04 | Phase 0 risk spike | Agent prompts, deterministic Inbox validators, report | Test the three risky parts first: offline PWA with German speech, Sheet + Apps Script, scheduled agents without a paid API ([phase0/REPORT.md](phase0/REPORT.md)) | PWA install, offline and TTS pass on the phone; unattended Claude routine appends rows; 40/40 batch rows valid; warning-only protection does not stop agent writes (D21) | `34f71e9`, `814ede9` |
| 2026-10-05 | Security gate | Security core in `core/` (validator, importer, writer, audit, backup), threat model, gate report | Owner's instruction to run a security-only phase before Phase 1 (D23) | Verdict FAIL, Phase 1 blocked until a vault account and isolation tests exist (D23); vault design proposed (D24) | `15cdf65`, `4c7df84` |
| 2026-10-06 | MVP2 | Feed prototype, then the *Heft* (scroll journal) as slice 1 | Owner reset the priority to a usable personal product; security findings no longer block shipping (D31–D35) | Heft deployed to the old site; the card prototype judged a failure (HEFT.md) | `46e18e6`, `0d84a41`, `ce7896f` |
| 2026-10-07 | Station, phases A–B | Station design; optional record columns, Inbox v2, seed actor; exercise generator, FSRS-5 scheduler, data adapters | Owner's brief of 2026-10-07 (D36–D48) | Last push to `main` (`534b80a`); the old site has shown the Heft since | `e495731` → `534b80a` |
| 2026-10-07 → 08 | Phase C, styles | Station Karte slice; three visual styles for review | Phase C plan (D49); owner asked for a design round with assumptions recorded, not asked (D50) | Slice tested from the dev server only, not pushed: Pages deploys every push to `main` (D49) | `312cde4` → `4fa31ef` |
| 2026-10-09 | Round 2 | One palette, Barlow, four-step Karte rating, runs, Verlauf, grouped Settings, audio providers (device, ElevenLabs), Plural/Kollokation/Reihenfolge | Owner's findings F1–F4 after testing round 1 (R2-1) | Acceptance A1–A9 pass; A3 by self-review only (ROUND2_REPORT) | `3466a71` → `feebb14` |
| 2026-10-09 | Round 3: the real sheet | Published-CSV sheet contract and ingestion, scheduler simulator, evidence-based exercise choice (c0), stress fixture, Playwright layout audit, preview namespace | Read the learner's own sheet without Apps Script or a token, set up alone by the owner (R3-1) | Gates pass (core 430, app 70, Playwright 91); real 50-row sheet ingested with 0 skipped; Stable published from a separate repo (`strecke-preview`, R3-12) | `a82bb76` → `ffa2ad4` |
| 2026-10-11 | Round 4 (cloud) | Six slices on a cloud branch: IndexedDB storage, language, sheet read side, Fill my list, distractor/gate work, Google sign-in research | Reason for running it as a separate cloud branch: reason not recorded | Never merged; ported in part (PORT_MAP) | `fc5191b` → `41aa889` (`origin/claude/vibrant-ritchie-90ojw4`) |
| 2026-10-11 | Round 4 port | Features A (storage), B (language), C (sheet read side), F (research) ported into the Round 3 line; Next channel with its own namespace and self-healing service worker | Owner's brief: port a subset and ship it as *Next*, leaving Stable untouched (PORT_MAP) | Next deployed by hand (later tagged `live-before-v0.2.0`); isolation of channels verified in Chrome (PORT_MAP) | `a15221e` → `0982db4` |
| 2026-10-19 | Release 1 (v0.2.0) | Version guard, snapshots, updates that wait; Fill my list; new words per day; first-run clarity; settings pages; release tool | Owner's brief: make Next safe and complete enough to be the daily app, without Google sign-in (design/DECISIONS "Release 1") | v0.2.0 deployed to Next with `tools/release.ts` (`strecke-next` `34ccdcf`) | `d353073` → `dbe4911` |

## Decision log

Status: **active** (in the code today), **superseded** (replaced, by what), **dormant** (built, not used by the app), **reversed**.

| Decision | Reason (as recorded) | Date / commit | Status |
| --- | --- | --- | --- |
| D10 Privacy audit before every commit | Public portfolio repo | 2026-10-02 | active |
| D20 Push through the GitHub API (`tools/gh_push.py`) | Firewall blocks `git.exe`, allows `gh.exe` | 2026-10-02 | unknown (a plain `git fetch` worked on 2026-10-21; `tools/release.ts` uses `git push`) |
| D23 Security gate blocks Phase 1 | Owner's instruction; gate verdict FAIL | 2026-10-05 | superseded by D31 ("no longer block shipping") |
| D24 Vault account, PWA with OAuth, no web endpoint | Isolation from AI connectors | 2026-10-05 | superseded by D31/D45 for the app path |
| D31 Apps Script web app + per-copy token | OAuth per instance needs a Cloud project and hourly re-sign-in | 2026-10-06 | dormant: the app reads published CSV instead (R3-1, R4-1) |
| D32/D45 Simple vs hardened mode | Keep setup short; hardened for broad-permission agents | 2026-10-06/07 | dormant (no write path in the app) |
| D33 Heft interface | Card prototype failed (instruction first, Anki loop) | 2026-10-06 | superseded by D36 Station |
| D36 Station replaces Heft | Owner's brief 2026-10-07 | 2026-10-07 | look superseded by Round 2 (R2-1); principles stand |
| D38/D39 Optional record columns; exercises generated from the record | A new row yields exercises with no code change | 2026-10-07 | active |
| D40 Typed answers, forgiving match | Owner's brief | 2026-10-07 | active |
| D41 Ladder picks the exercise, FSRS-5 picks the time | Best-documented open model; replays from a log; can be fitted later | 2026-10-07 | FSRS active; ladder no longer default (R3-4) |
| D42 No self-grade buttons; swipe up to advance | Ratings from behaviour | 2026-10-07 | reversed for the Karte (R2-3); swipe removed (R2-12, owner finding F2) |
| D44 Asset budget ≤ 300 KB | reason not recorded (CLAUDE.md lists "small bundle" as a constraint) | 2026-10-07 | active (enforced by `tools/release.ts`) |
| D50 Three styles for review | Owner asked for a design round | 2026-10-08 | superseded (R2-15: one look) |
| R2-2 Runs of about 6 cards, 20-minute gap | Owner asked for a gap rule; run id keeps "another run" separate | 2026-10-09 | active (default values: reason not recorded) |
| R2-3 Four-step Karte self-rating | Owner decided after testing round 1 (R2-1) | 2026-10-09 | active |
| R2-5 "Secure" = stability ≥ 21 days | Same model as the scheduler; Anki's "mature" line | 2026-10-09 | active |
| R2-10 No per-word pictograms | Owner finding F1 | 2026-10-09 | active |
| R2-16 Device voice default, ElevenLabs opt-in | Zero setup by default, better voices opt-in | 2026-10-09 | active |
| R3-1 Sheet read as a published CSV link | No Apps Script or token; owner can set it up alone; CORS verified | 2026-10-09 | active |
| R3-2 Identity = id column, else word + article (+ meaning), typo rule | A wrong merge attaches the wrong history | 2026-10-09 | active |
| R3-4 Scheduling c0 (one FSRS state per word, evidence per type picks the exercise) | Wins or ties on the round's five criteria in simulation; weighted and time-based grades add nothing measurable | 2026-10-09 | active |
| R3-5 New words only fill room reviews leave | reason not recorded | 2026-10-09 | superseded by R5-5 |
| R3-12 Stable in its own repository and namespace | Live site and preview share one origin; `main` must not be pushed | 2026-10-09 | active |
| R4-1 Three layers; app never writes to the sheet | Round 4 D49, adopted | 2026-10-11 | active |
| R4-2 IndexedDB v2, one transaction per run | Ported from Round 4 (PORT_MAP A: old layout rewrote the whole log on every answer) | 2026-10-11 | active |
| R4-3 Merge-only backup file (`.txt`), dry run | Chrome shares `.txt`, not JSON | 2026-10-11 | active |
| R4-5 English default UI, German available | Owner's brief (deviation from CLAUDE.md) | 2026-10-11 | active |
| R4-11/R4-12 Next channel; self-heal of the shell cache | Leave Stable untouched; old site's worker deletes other caches | 2026-10-11 | active |
| Port scope: D and E deferred, G skipped | G: this line has its own screens, fonts, simulator. D, E: reason not recorded | 2026-10-11 | D done in Release 1; E still deferred |
| R5-1 Version guard | Never write data from a newer schema | 2026-10-19 | active |
| R5-2 Snapshot before every migration, keep 2 | Separate database needs no schema step, so v0.2.0 stays rollback-safe; "keep 2": reason not recorded | 2026-10-19 | active |
| R5-3 Updates wait for a tap or the next start | Never mid-run (RELEASES.md) | 2026-10-19 | active |
| R5-4 Fill my list, copy first, no prompt in a URL | Prefilled-prompt links are not officially documented (research note) | 2026-10-19 | active |
| R5-5 New words per day, default 10 | Default = the owner's stated maximum; marked an open decision | 2026-10-19 | active |
| R5-7 Audit fails on real-looking sheet links | reason not recorded beyond the privacy rule | 2026-10-19 | active |

## Lessons (only what the repo records)

- **Agent permissions are weaker than they look.** Warning-only sheet protection did not stop connector writes; a routine's `permitted_tools` was not enforced; agents took unrequested actions (D21, D26).
- **An Anki-like loop with an instruction first did not invite use** (HEFT.md, "Why the card prototype failed").
- **Synthetic data hid real faults.** The real 50-row sheet exposed two distractor faults (light verbs, capitalisation) and the whole-utterance chunk problem (R3-6, R3-11, ROUND3_REPORT).
- **Test fixtures can mask rules.** Fixtures with near-identical headwords were treated as one lemma by the new guard (R2-7).
- **More grading signal did not help in simulation.** Weighted grades and response-time grades added nothing measurable; the simulated learner is an assumption, so this is indicative, not proof (R3-4).
- **Sharing one origin is risky.** The old site's service worker deletes every other cache on the origin; hence separate namespaces and Next's self-heal (R3-12, R4-12, PORT_MAP isolation).
- **The layout audit pays off.** It found a German label overflowing at 320 px with large text (R4-15) and an end screen pushing its actions off a small screen (`bcddfe3`).
- **Windows specifics in tooling.** `npx` needs a shell on Windows when paths contain spaces (`6035fde`); the release clone needs the checkout's git identity (`dbe4911`).
- **Phone-only checks keep piling up.** Every round report lists the same open items that only the Android phone can judge (ROUND2_REPORT, ROUND3_REPORT, R2-20).

## Deferred work and open questions

- Feature E (same-slot distractors, stand-in gate): only on the Round 4 cloud branch (PORT_MAP).
- Google sign-in, write-back to the sheet, app-created sheet, multi-device sync (PORT_MAP; [research/google-signin.md](research/google-signin.md)).
- Promotion of Next to Stable (`strecke-preview`) (PORT_MAP).
- Retiring the old site on `main`: owner decision (PORT_MAP isolation).
- Default of 10 new words per day: open decision (R5-5).
- Whether a scheduled assistant can append rows without a human approving each write: undocumented by both providers (research/ai-providers.md).
- Real usage data to re-check the c0 choice after a few weeks (ROUND3_REPORT): no check recorded.
- D14 showcase after a 4-week test, D47 learner's own words into the private sheet (Phase F): status not recorded.
- Vitest advisories, fix needs a major upgrade "on its own" (D48): still Vitest 3.2.7 in `app/package.json`.
- Doc drift: CLAUDE.md, ARCHITECTURE.md §1, ENGINE.md and SHEET_SCHEMA.md still describe older behaviour in places ([SPEC.md, "Discrepancies"](SPEC.md#discrepancies-between-code-and-docs)).
