# Round 4 report: frictionless sheet, "Fill my list", hardened storage

Branch `claude/vibrant-ritchie-90ojw4`. Nothing was pushed to `main`; the live site is untouched. Decisions: [D49–D58](DECISIONS.md).

## Starting point

The brief refers to `SHEET_SCHEMA`, `ENGINE`, a Round 3 report, `docs/design/DECISIONS.md`, a "c0" design, a reorder exercise and a simulator. **None of these existed in the repo.** It stood at Station Phase B: the core engine was done and the live app was still the Heft prototype.

Status of the earlier briefs:
- **(a) UI language, data-source clarity, backup wording:** not done.
- **(b) Distractor form agreement:** partial (a same-ending preference only). The production-share report: not done.

So the Heft was replaced by a Station practice screen on the core engine (D54), the prerequisite for reading arbitrary sheet rows.

## Slices

| Slice | Result | What changed |
| --- | --- | --- |
| 1 Storage | **pass** | <ul><li>Audit: [STORAGE.md](STORAGE.md).</li><li>IndexedDB store with versioned migrations, one transaction per write, a quarantine for damaged records, and a memory fallback.</li><li>One-time migration of the prototype's localStorage blob, tested.</li><li>`persist()` asked after the first completed run; shown in Settings › Data.</li><li>Growth: 3.5 MB a year at 50 answers a day (measured).</li><li>Backup through Web Share as a `.txt` file (Chrome's share allow-list has no JSON), else a download.</li><li>Restore with a dry run; merge-only.</li><li>One backup hint after 10 runs.</li></ul> |
| 2 Language and clarity | **pass** | <ul><li>en (default) / de string table.</li><li>A compiler-based test fails on literal UI text.</li><li>Language switch in Appearance.</li><li>Rating labels *Didn't know / Partly / Knew it / Instantly* with rising bars.</li><li>Source line on the first card of a visit; *Connect your sheet* on demo data.</li><li>Layout audit.</li></ul> |
| 3 Sheet, read side | **pass** (CORS unverified) | <ul><li>Any sheet with a `word` column works: en/de header aliases, any order, extra columns ignored, empty cells allowed.</li><li>Optional columns `source`, `added`, `verified`, `level`, `id`. Optional Inbox and Meta tabs, with a `schema_version` message.</li><li>Connect flow with a numbered guide, the public-link warning, success and error states, and neutral row notes.</li><li>*Sync now*, *Disconnect*, CSV-file fallback.</li><li>Content-derived identity; idempotent, incremental sync; re-sync on return.</li><li>Template xlsx and CSVs, with copy and migration guides. [SHEET_SCHEMA.md](SHEET_SCHEMA.md)</li></ul> |
| 4 Fill my list | **pass** | <ul><li>Pure instruction generator from the sheet's real headers (snapshots, plus a parser round trip).</li><li>Gating with reasons; inputs; editable text with reset and a gentle warning.</li><li>*Generate now* copies and opens the provider. Schedule guides with honest limits.</li><li>AI tag, local skip, health line.</li><li>Privacy audit now blocks published-sheet keys.</li></ul> |
| 5 Exercise quality | **pass** | <ul><li>Distractors fill the same inflectional slot (the bad case is a test).</li><li>Fewer options or no exercise when candidates are lacking.</li><li>A stand-in gate, logged so replay stays deterministic.</li><li>Simulator: Tippen share past the building stage 39–41 % (bar: 15 %). [ENGINE.md](ENGINE.md)</li></ul> |
| 6 Research | **done** | [research/google-signin.md](research/google-signin.md): `drive.file` is non-sensitive, needs only brand verification, and tokens last about 1 h with no refresh token in the browser. Recommendation: keep published CSV as the default and add sign-in as an optional "create my sheet" path. |

Quality gates at the end:
- core 358 tests and app 49 tests pass; typecheck is clean;
- live and preview builds pass;
- offline cold reload works (first card in 48 ms on the build machine);
- layout audit: 256 screens, 0 problems ([LAYOUT-AUDIT.md](LAYOUT-AUDIT.md));
- sheet e2e passes against a fake Google;
- privacy audit `--all`: clean.

## Providers and deep links

| | Works | Does not / unverified |
| --- | --- | --- |
| Claude | `claude://claude.ai/new?q=` prefill is documented for **Claude Desktop** only. Scheduled tasks: paid plans; hourly, daily, weekly, on weekdays or manual; they use connectors. | No documented chat prefill on web or Android (`claude.ai/new?q=` reportedly removed). Not documented: whether a scheduled task can write to Google Sheets without approval each time. |
| ChatGPT | Scheduled tasks on Free (3 active, at most daily) and paid plans. The Google Drive app can edit native Sheets "where supported". | `chatgpt.com/?q=` is undocumented by OpenAI and reportedly ignored by the Android app. Not documented: whether a scheduled task can use the Drive app to write. |
| App behaviour | Always copies the text and says so; opens `claude.ai/new` or `chatgpt.com`; "Other" copies only. | |

Sources: [research/ai-providers.md](research/ai-providers.md).

## Screenshots

[screens/round4/](screens/round4/), at 320 px and 390 px wide, en and de, light theme, 100 % text, synthetic data:

| Screen | Files |
| --- | --- |
| Run start, demo | `*-run-start-demo.png` |
| Run start, sheet | `*-run-start-sheet.png` |
| Karte rating row | `*-rating.png` |
| Settings › Data, not connected | `*-data-not-connected.png` |
| Settings › Data, connected | `*-data-connected.png` |
| Fill my list, gated | `*-fill-gated.png` |
| Fill my list, ready | `*-fill-ready.png` |

Every combination (4 viewports × 100/130 % × light/dark × en/de) is produced by `tools/app/layout-audit.mjs`.

## Only verifiable on the real phone

1. **CORS.** Does Chrome on Android read the published CSV link from the app (the first *Connect*)? If not, the app says so and the CSV-file import works.
2. **Persistent storage.** The result in Settings › Data after a completed run, installed vs not installed.
3. **Web Share.** *Back up now* opens the share sheet with the `.txt` file; does Drive or Files accept it, and does *Restore* read it back?
4. **Deep links.** Does `https://claude.ai/new` or `https://chatgpt.com/` open the installed app or the browser? Is the clipboard text there to paste?
5. **Feel.** Card motion, the cover lift, the press feedback, haptics, safe areas, the on-screen keyboard over Tippen. Swipe-up is not built yet (Next button only).
6. **Audio.** The German voice, Hören, and the speaker icon.
7. **Cold open.** With a real year of answers (measured 228 ms on desktop with 18 000 events).

## What the product owner does next

1. **Choose how the preview gets a URL** ([DEPLOY.md](DEPLOY.md); recommended: `/preview/` on the same Pages site, one workflow change merged to `main`). Until then, download the `strecke-preview` artifact from the branch's CI run.
2. **Connect your sheet in the preview:** publish only the words tab as CSV and paste the link. Note the "N rows, M need attention" line and the CORS result.
3. **Paste your sheet's normal address once** in the connect field (it is refused with an explanation and kept for Fill my list), or type it in Fill my list.
4. **Try Generate now** with Claude or ChatGPT; let it add 10–20 rows. Check those rows in the sheet: articles, plurals, examples, `verified`, no duplicates. Come back to the app and look for the "N new words" line and the AI tags.
5. **Try Back up now**, then *Restore from backup* on the same phone (it should say "nothing to add").
6. **Decide on the open points:**
   - the new-word pace finding in [ENGINE.md](ENGINE.md);
   - whether to pursue Google sign-in ([research](research/google-signin.md));
   - whether the Karte self-report row (D52) stays.
