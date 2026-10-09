# Round 3 report: the real sheet

Commits are local; `main` is not pushed. Review page (private): see the link in the round-3 chat. Preview build: the `strecke-preview` GitHub Pages site (separate from the live site; URL in the round-3 chat).

| Section | Result | Evidence |
| --- | --- | --- |
| 1 Sheet contract | pass | [../SHEET_SCHEMA.md](../SHEET_SCHEMA.md); `core/test/sheet.test.ts` (headers, rows, identity: new, edited, meaning edited, typo fixed, other headword, deleted, restored, homonyms, duplicates, id column, idempotent, reordered, bad rows, column added later keeps state, offline keeps last copy) |
| 2 Scheduling across types | pass, c0 chosen | simulator `core/src/sim/sim.ts`, tables in [../ENGINE.md](../ENGINE.md); `core/test/selector.test.ts`; the full hypothesis (c, weighted grades) did not win |
| 3 Overfit check | pass in emulation | stress fixture `core/src/data/stress-sheet.ts`; Playwright audit `app/e2e/layout.spec.ts`: 91 checks (11 types × 4 sizes × text 100/130 %, dark, 500 rows, control test); the real seed passes the same audit locally (`REAL=1`, nothing stored) |
| 4 Verlauf | pass | simulated logs `core/src/sim/log.ts`; tests for empty, 3 days, 30 days, a 1-card and a 200-card day; chart switches to scaled bars |
| 5 Quality gates | pass | core 430 tests, app 70 tests, Playwright 91, typecheck, PWA build, offline check, privacy audit |
| 6 Review page | done | private artifact with Verlauf, stress screens, simulator tables, sheet contract (synthetic data only) |
| 7 Preview | done | separate repository and URL, own storage namespace, CSP, offline verified over HTTPS |

## Real data (counts only; the content stays out of the repository)
50 seed rows ingested, 0 skipped, 0 duplicates, one unused column (`image_key`). Rows per exercise type: Karte 50, Bedeutung 50, Hören 50, Tippen 46, Reihenfolge 46, Lücke 34, Zweiter Kontext 33, Artikel 17, Plural 12, Kollokation 9, Präposition 7. Two classes of distractor faults were found and fixed by rule (light verbs as collocation partners; capitalisation giving the answer away), and chunks whose blank is a whole utterance no longer get a choice cloze. A few purely semantic overlaps remain possible (two nouns of one topic that both fit a sentence); the owner was shown the examples privately.

## Not testable without the phone
Flap drag feel, audio unlock after a tap and ElevenLabs playback, vibration, real Android text scaling (emulated here by enlarging fonts 30 %), German hyphenation of long compounds (desktop Chrome breaks them without a hyphen), PWA install and safe areas.

## Open risks
- The published CSV link is readable by anyone who has it; only the word tab must be published.
- Answers are not written back to the sheet yet (Phase E); they live on the phone and in the backup file.
- The simulator's learner is an assumption; c0 vs the round-2 ladder is close when the learner is behind, and real usage data should be checked after a few weeks.
- When the learner is far behind, rows added later wait until earlier ones are introduced (reviews first, oldest first).
