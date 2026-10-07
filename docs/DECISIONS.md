# Decisions

Newest at the bottom. **[ASK]** = needs the product owner's OK (Scope, Data model, API contract, Agent integration). **[OK]** = approved. Everything else is an engineering call, recorded for reference.

## 2026-10-02 · Phase 0 setup

**D1 Layout.** Spec in `docs/SPEC.md`. The learner's raw exports live in the gitignored `data/` folder (`data/anki/`, `data/private/`).

**D2 Tooling.** The machine had Node 16, too old for Vite and clasp. Installed Node 24 LTS and GitHub CLI via winget.

**D3 Test Sheet tabs.** The throwaway `Strecke-test` Sheet has `README`, `inbox`, `words` (5 rows) plus `word_state`, `captures` and `config`. The checklist asks agents to read `word_state` and `captures`, and `config.last_agent_run` is a harmless target for the "updates an existing cell" check. The real Sheet is built by Phase 1 `setup()`.

**D4 One prompt tests path A and B.** The Phase 0 prompt ([agents/phase0-test.md](../agents/phase0-test.md)) tells the agent to append to `inbox` (A) and, only if it has no tool for that, to create `inbox_<run_id>.csv` in the Sheet's Drive folder (B). The one-line `RESULT` reply says which path ran. This halves the number of runs the product owner triggers. Added a checklist row for B.

**D5 Claude scheduler = Claude Code cloud routine** (product owner's choice). It runs in Anthropic's cloud on a cron, so it works with the computer off. Created through the routines API with the Google Drive connector only, model Sonnet 5 (lighter on subscription limits), disabled until the test Sheet exists. Its run logs can be read from Claude Code, so the product owner doesn't check Claude runs by hand.

**D6 Expected result for Claude, before testing.** The Google Drive connector exposes file-level tools only: search, read, create file/folder, copy, metadata (title/folder), share, trash. Nothing appends a row or edits a cell. So Claude will most likely fail path A and pass path B. If ChatGPT also fails A, Phase 1 adds the B importer to the normalizer, a fallback the spec already allows.

**D7 Spike backend via paste, not clasp.** The hello-world endpoint is a container-bound script pasted once; it also builds the test tabs (`setupTestSheet`). clasp comes in Phase 1, where it pays off. The README text has one source (`docs/sheet-readme.md`), injected by `tools/phase0/build_spike.py` into `build/spike/Code.gs` (gitignored).

**D8 Visual-mnemonic reference.** The learner's own visual dictionary (Canva slides of AI-generated comic panels) was read as context only, no assets. Takeaways for the UI: the word is the headline, the article is set apart, a short English gloss sits under it. Word families (machen → aufmachen, zumachen…) map to the `family` column.

## 2026-10-02 · Product decisions from the product owner [OK]

**D9 Framing.** Strecke is a general A2–B1 learning helper, single-user per copy, "bring your own Sheet". No personal data in code, docs or default content. SPEC "Product framing" added.

**D10 Privacy.** Public repo, portfolio piece: nothing personal in files or history (names, employer, city, university, study data, CSV/seed content, Sheet/Drive IDs, Apps Script URLs, tokens, routine IDs, emails). Enforced by `tools/privacy-audit.sh` before every commit. Learner-specific audit terms live in `data/private/audit-terms.txt` (gitignored), so the audit list itself leaks nothing.

**D11 Learner context out of the repo.** `docs/sheet-readme.md` has a `{{LEARNER_CONTEXT}}` placeholder. The build fills it from `data/private/learner-context.txt` into gitignored output only, and from there into the private Sheet. Phase 1 `setup()` will take the context from a Script Property or leave the placeholder for the learner to fill in the Sheet. Decided in Phase 1.

**D12 Agent prompts use placeholders.** `agents/*.md` contain `<SHEET_ID>`. The filled-in prompt exists only inside the scheduler (ChatGPT task, Claude routine). This overrides the original spec line "holds the Sheet ID".

**D13 Demo mode in v0.1.** Bundled ~20-item general deck (core + chunks), no token, no sync, local state only. First run offers *Demo ausprobieren* / *Eigenes Sheet verbinden*. Built in Phase 3.

**D14 Phase 7 Showcase** after the 4-week test: case-study README, German summary (by the product owner), honest note on building with Claude Code, bring-your-own-Sheet guide.

**D15 Content focus.** `tier` (core/chunk) on `words` and `inbox`; new-item mix ≈ 2/3 core, 1/3 chunk; captures always accepted; no specialist or job vocabulary from agents; two clozes per item in two different everyday situations; *Anwenden* uses an unseen context; domains redefined as everyday situations. Progress shows core coverage and producible chunks. Speed round noted as the first post-test feature.

**D16 `start_stage` column (data-model consequence of the seed rule).** The rule "Anki words start at stage 1 or 2" needs a place to live, because the scheduler is a function of the event log and a seed has no events. Added `start_stage` (0–2) to `words` and `inbox` (seed rows only). The scheduler treats it as the stage before the first event; such words enter through the new-word slot and skip Meet. Defaults: empty `tier` → core for noun/verb/adj, chunk for phrase.

**D17 Seed via script in Claude Code [OK].** Pull the visual-dictionary word list from Canva via the connector; deduplicate across sources; tag core/chunk; drop specialist/job jargon (word list goes here for confirmation); rewrite example sentences over 14 words; start stages: older Anki iterations → 2, latest iteration → 1, visual-dictionary-only → 0; 20-item sample table for a German check before the rest. Seed content stays in `data/` and the private Sheet. Phase 2, not before.

## Anki export, structure only (input for Phase 2; no content recorded here)

- Several CSV iterations with entries repeated across them. Columns: `Front, Back, Example_DE, Example_EN, Grammar, Tags`.
- `Front` packs grammar notes into the word (auxiliary, participle, separability, plural). The seed script must split out `de`, `article`, `pos`.
- Adverbs, conjunctions and idioms map to `pos=phrase`; no extra pos values needed.
- One example sentence per entry, often long and grammar-heavy; sentences over 14 words get rewritten. A second cloze and a listen sentence must be generated for each word.
- Tags map to the five domains with a lookup table (application-related tags → `arbeit`); the 80–100 pick should balance domains.

**D18 Five domains [OK].** `bewerbung` is folded into `arbeit`: `arbeit`, `uni`, `amt`, `alltag`, `smalltalk`. Interviews are working-life conversation (`arbeit`); writing applications belongs to the learner's writing practice, not this app.

**D19 Seed start stages, exact rule [OK].** Only the highest-numbered Anki export → `start_stage=1`; all other exports → 2; visual-dictionary-only words → 0. A word in several exports takes the stage of its newest export. Misplacements are corrected by the engine on the first misses.

**D20 Pushing without git network access.** On the dev machine the firewall blocks outbound connections from `git.exe` but allows `gh.exe`. Firewall rules are a system security setting, so they stay untouched. `tools/gh_push.py` recreates local commits through the GitHub API (same tree, message, author, dates), so remote hashes equal local hashes. Fast-forward only. If git gets network access later, plain `git push` works again.

## 2026-10-04 · Phase 0 outcome

**D21 Phase 0 closed for design.** Report: [phase0/REPORT.md](phase0/REPORT.md).
- Claude path A (Sheets connector, direct `inbox` append) and path B (CSV in Drive) both work unattended.
- Two 20-item batches gave 40/40 schema-valid rows with minimal context.
- Mobile shell, install, offline and TTS pass on the test phone.
- ChatGPT not tested.
- Security findings: warning-only protection does not stop connector writes; connectors are account-wide with destructive tools; agents took unrequested actions; the spike web app is public.
- The production write path is **not decided here**. Options and the recommendation are in [PHASE1-PROPOSAL.md](PHASE1-PROPOSAL.md), awaiting the product owner's review.

**D22 Phase 0 evidence handling.** Run logs, the test Sheet and the CSV artifacts stay private (`data/phase0/`, Drive). The public report cites them without IDs. Phase 0 one-time routines disabled themselves after firing; deleting them and archiving the spike web app are step 0 of the proposal.

## 2026-10-05 · Security gate (security only, before Phase 1)

**D23 Security gate first.** On the product owner's instruction, a security-only phase ran before Phase 1: attack-surface inventory, threat model, architecture, minimum foundation, adversarial and recovery tests. Report: [security/GATE-REPORT.md](security/GATE-REPORT.md). Verdict: **FAIL, block Phase 1** until the vault account exists and isolation tests I-1..I-6 pass ([security/OWNER-STEPS.md](security/OWNER-STEPS.md)).

**D24 [ASK] Production architecture: vault account, no endpoint.** Core (and its backups and backend script) live in a dedicated Google account that no AI connector is ever signed into. Agents reach only an Inbox spreadsheet, owned by the vault and shared as Editor (no resharing) with the everyday account the connectors use; all Inbox tabs except the agent columns are protected. The PWA reads and writes Core directly via the Sheets API with the learner's own OAuth token (`drive.file`); Apps Script runs only as triggers (importer, publisher, backup) with **no web app**. This replaces SPEC "API contract" (public web app, `APP_TOKEN`) and the warning-only protection rule, and chooses the vault variant over the proposal's "separate agent account": same isolation, but it depends on "never connect AI to the vault" rather than "never connect AI to your everyday account", and leaves the owner's existing Claude setup unchanged. Details: [security/ARCHITECTURE.md](security/ARCHITECTURE.md).

**D25 [ASK] Data model additions.** Core gets `inbox_log` (every Inbox row ever seen, by content fingerprint) and `audit` (hash-chained). The Inbox spreadsheet has `contract`, `keys`, `status`, `captures_open`, `inbox`. Rules enforced in code: the Inbox never accepts `source=seed`/`capture` or `start_stage` (seed import gets its own local path and actor in Phase 2); agent words enter only as `pending`; capture rows go live only with an open, matching `capture_id`; nothing in Core is ever deleted (words become `rejected`/`suspended`). Agent rows that duplicate an existing word are rejected for now; the spec's "extra prompts for existing words" returns later as *pending* prompts, so AI text never goes live unreviewed except enriched captures (spec choice).

**D26 Platform facts found by the gate** (engineering record, re-test after platform updates). Routine `permitted_tools` on a connector is **not enforced** (a routine limited to `get_values, append_values` cleared, overwrote and copied data). The built-in `disallowed_tools` list **is** enforced. An empty `allowed_tools` expands to the full default preset. Strict sheet protection never binds the owner identity. Connector writes are user-entered, so `=…` becomes a live formula and plain reads return computed text; the importer must read formulas as text.

**D27 [ASK] Learner context not shared with agents by default.** Phase 0 put the learner's context in the Sheet README, which every connector session can read. Proposal: agents get level, domains and tier mix only; the context stays in Core. If the owner wants more relevant suggestions, at most three generic lines go into the protected contract, knowingly readable by every Claude session of the everyday account.

**D28 Shared security core at `core/`.** Validation, import, writer, audit and backup are pure TypeScript in a top-level `core/` (root `package.json`; devDependencies vitest, typescript, @types/node; **no runtime dependencies**), so the PWA and the Apps Script bundle run the same tested code. Adds `core/` to the repo layout in CLAUDE.md. npm install scripts stay blocked (esbuild's optional platform binary works without its postinstall). SHA-256 is a small pure implementation so hashes are identical in browser, Apps Script and Node; it is checked against `node:crypto`.

**D29 Dedupe key, final rule.** NFC; lower-case; typographic quotes folded; whitespace collapsed; trailing `.!?…` dropped; leading der/die/das only for nouns; leading `sich` only for verbs; umlauts and ß kept. `de`, `en` and `answer_1` must contain a letter.

**D30 Phase 0 cleanup.** The four Phase 0 routines and the gate's test routine are disabled and their prompts replaced with a no-op (originals saved privately in `data/phase0/`); the routines API cannot detach their connectors, so the owner deletes them in the UI. The Phase 0 web app must be archived by the owner (its URL exists only on the phone). The test Sheet and CSV artifacts stay as evidence. Disposable gate spreadsheets (synthetic data) stay until the owner has reviewed the report.

## 2026-10-06 · MVP2: make the product work [OK]

The product owner reset the priority to a usable personal product. The security findings above (D21, D26) stay valid; they no longer block shipping.

**D31 API: Apps Script web app + per-instance token [OK].** The PWA talks to the learner's own Sheet through one Apps Script web app (`bootstrap`, `sync`; `POST`, `text/plain`, token in the body), as in SPEC "API contract". The token is generated per instance and stored only in Script Properties and on the device. This replaces the D24 proposal that the PWA call the Sheets API with the learner's OAuth token: that needs a Google Cloud project and OAuth client per instance and an interactive re-sign-in roughly hourly, which makes "run your own copy" impractical.

**D32 Hardened mode optional [OK].** The vault account and the separate Inbox spreadsheet (D24, D25) become an optional hardened deployment for learners who connect broad-permission AI agents. The default is simple personal mode: one Google account, one Sheet. The code leaves room for hardened mode (the Inbox location is configuration) but MVP2 does not build it.

**D33 Heft is the MVP2 interface [OK].** The feed becomes one vertical scroll of short encounters in a few varying layouts. Each item resolves with one tap and settles into a trail above; the next item is already visible below. Dark-first, calm, typographic. Speaking aloud is an optional invitation, never the default instruction; no typing.

**D34 Scope removed [OK].** The checkpoint card and the Pending screen are removed. Agent suggestions appear in the feed as *Vorschlag* (keep by learning it, or *Nicht für mich*). Self-grading is reduced to one optional *nochmal* after a reveal.

**D35 MVP2 has four slices [OK].**
1. Heft UI on demo data, usable on the test phone.
2. The learner's own Google Sheet end to end via Apps Script + token.
3. One minimal automated ingestion path: an external scheduled AI workflow adds valid rows to the Sheet.
4. Real vocabulary and one week of actual use.

Not in MVP2 until real use shows they are needed: offline cache with event queue and background sync, hardened mode, two full AI pipelines, deeper brand work. The architecture keeps room for them. These slices replace the Phase 1–7 order for now.

## 2026-10-07 · Station: redesign and data-driven exercises

The product owner's brief of 2026-10-07 changes the interface, the exercise model and the engine. It pre-approves the scope and data-model changes below (marked [OK]). The security docs and the privacy rules still take precedence over the brief. Design: [design/STATION.md](design/STATION.md).

**D36 Station replaces the Heft [OK].** The interface becomes *Station*: one card at a time on warm paper, sentences on dark boards, a mono label strip for context, and one rule: amber marks what you have to retrieve. This replaces D33 (Heft) and the "calm notebook" look in CLAUDE.md. Work now runs in **phases A–F** (SPEC "Build phases"), which replace the MVP2 slices of D35. Slice 1's Heft code is replaced in Phase C. `HEFT.md` is kept with a "superseded" banner, as `PROTOTYPE.md` was.

**D37 Seven principles govern every screen and string [OK].** These are: evidence, not rewards; never make the learner feel behind; only claims the event log supports; companion, not teacher; alive but quiet; honesty is free; the science is invisible. They are written out in STATION.md, and copy is reviewed against them.

**D38 Optional record columns [OK].** `words` gains optional `plural`, `example_de`, `example_en`, `example_form`, `example_2_de`, `example_2_en`, `example_2_form`, `collocation`, `prep`, `note`, `wrong_1`, `wrong_2` and `image_key`. They are appended after the existing columns, so the change is additive. A missing column never breaks anything; it only means fewer exercises. The minimum record is `de`, `en`, `pos`, `domain`, plus `article` for nouns.
- The Inbox gets a **v2 header** with the same columns. The importer keeps accepting the v1 header, and the validator gives every new column the existing rigour: enums (`prep` from a closed list, `image_key` from the bundled allow-list), length caps, at most 14 words per example, the form contained in its example, no formulas, URLs, markup or invisible characters.
- Agent rows must also carry `example_de` and `example_en`; thin rows are for the learner's own entries.
- `docs/sheet-readme.md`, `agents/contract.md` and the validators change together with their tests in Phase B, so the docs never describe a header the code rejects.
- `word_state` gains `stability`, `difficulty` and `reps` (a derivable cache, see D41).

**D39 Exercises are generated from the record [OK].** The pure function `exercisesFor(word, allWords)` in `core/` derives the exercises (Karte, Artikel, Bedeutung, Lücke, Präposition, Hören, Tippen, Zweiter Kontext) from whatever columns a row has. A new Sheet row therefore produces exercises with no code change.
- The `prompts` tab becomes an optional override layer.
- For the same word, the legacy `cloze_1/2`, `listen_de/en` and `prompts` rows win over generated values. A compat layer in `core/` maps them, with tests.
- Distractors come from other records: same `pos`, same `tier` preferred, never the answer, never duplicates. When fewer than three candidates exist, the exercise is skipped.

**D40 Typed answers are in scope [OK].** *Tippen* appears from stage 3. Matching is forgiving:
- After trimming, NFC, collapsing spaces and dropping final punctuation, an exact answer is correct.
- Case, ß/ss and ä/ae-style differences also count as correct; the correct spelling is shown quietly.
- One edit away (two for answers of 10+ characters) is a *near miss*: it counts as correct, rated "hard", and shows *Fast: …*.
- A typed leading article matching the word's article is ignored.
- "Typing answers" leaves the "Out of v0.1" list.

**D41 Scheduler: the ladder picks the exercise, FSRS-5 picks the time.** The engine is a pure function of the append-only event log plus `start_stage`, folded in `(ts, event_id)` order, so it replays identically and can be re-tuned.
- The **stage ladder (0–5)** decides which exercise types a word is ready for.
- An **FSRS-5 memory model** (stability, difficulty, retrievability; published default parameters; target retention from `config.retention`, default 0.9; interval cap 120 days) decides when it is due. It is implemented in `core/` in about 150 lines with no dependency.
- FSRS was chosen because it is the best-documented open model, it replays from a log by design, and it can be fitted to this learner later with the optimizer (still out of scope).
- **Ratings come from behaviour:** wrong or *Weiß ich nicht* → Again; right but with help (text shown in Hören, Tippen near miss) or slow (over the exercise's time threshold) → Hard; right → Good. Easy is not inferred in v0.1.
- Karte is "seen", not a grade: it schedules a short recall a few cards later in the same visit.
- **Known limit:** one memory state per word, although recognition is easier than recall. The picker therefore prefers the stage's gate exercise, and every event logs its exercise type, so a per-type model can be fitted later.
- FSRS leaves the "Out of v0.1" list; the optimizer stays out.
- `config.checkpoint_every` is removed (the checkpoint was dropped in D34) and `config.retention` is added.

**D42 Interaction rules.**
- **No self-grading buttons anywhere.** Every graded exercise offers a quiet *Weiß ich nicht*, which counts as a miss and is treated exactly like a wrong answer, calmly. This replaces the labels *Neu für mich*, *Kenne ich schon*, *Hatte ich*, *Nicht ganz* and *nochmal*.
- After an answer the card stays, showing the filled blank and its meaning, until *Weiter* or a swipe up. This replaces "grading advances immediately" and the ≤ 200 ms card-to-card rule with the brief's motion values (enter 680 ms, exit 340 ms, all interruptible).
- The every-fifth-gap "sag es laut" invitation is dropped, because it is instruction copy.

**D43 Screens [OK].**
- *Dein Weg* replaces the Progress page: only claims the log supports, with no scores or coverage percentages. The rules are in STATION.md.
- A *Vorschläge* list returns next to the in-feed `VORSCHLAG` Karte. This partly reverses D34, because the brief lists the screen.
- *Wörter* allows editing and suspending a word. Extending the writer's editable fields to the new columns happens in Phase D.
- *Hinzufügen* is the existing capture flow; *Einstellungen* has no goals.

**D44 Fonts, icons, pictograms and asset budget.** All verified on npm on 2026-10-07 and re-checked against the package `LICENSE` files when installed in Phase C. `NOTICE.md` records source, version and licence.
- **Fonts:** Overpass and Overpass Mono via `@fontsource/overpass` and `@fontsource/overpass-mono` 5.3.0, SIL OFL 1.1, self-hosted. Literata and Fira Sans are removed.
- **UI icons:** Lucide via `lucide-static` 1.52.0, ISC; some icons derive from Feather, MIT, whose notice is kept. Its 2 px round-cap stroke matches the Station look. The SVGs are copied into the bundle as inline components, so it adds no runtime dependency.
- **Per-word pictograms** (`image_key`) use the same Lucide set, not OpenMoji. OpenMoji is CC BY-SA 4.0, which brings attribution and share-alike duties, and a second style would break visual consistency. `image_key` is an allow-list of bundled Lucide names for concrete nouns where a picture helps (bus stop, ID card, form, …); otherwise none. There are no photos, stock illustrations or generated images.
- **Budget, compressed:** fonts ≤ 160 KB (woff2, latin + latin-ext, three weights + one mono), icons + pictograms ≤ 25 KB, and the whole app (JS + CSS + fonts + icons) ≤ 300 KB.

**D45 [ASK] How the app reaches Core: the brief and D31 disagree.**
- **The brief says:** follow D24 and `security/ARCHITECTURE.md`: no shared secret, no web endpoint, a vault account, and the PWA using the learner's own Google sign-in. The security gate stays FAIL until the owner steps are done.
- **D31/D32 say (approved 2026-10-06):** an Apps Script web app with a per-instance token (a shared secret), with the vault made optional.
- **Until the owner decides,** Phases B–D build only against the `demo` and `local` adapters, which do not depend on this choice, and Phase E does not start.
- **Engineering note:** D24's cost is a vault account (about 20 minutes of owner steps) and a Google sign-in that may need re-confirming about hourly; the phone test in Phase E measures how often. D31's cost is a token that, if leaked from the phone, opens all of Core.

**D46 Data adapters.** The UI and the scheduler talk only to a `DataAdapter` interface with three implementations: `demo` (bundled ~20 synthetic items, no sync), `local` (IndexedDB + fixtures, for development and tests) and `sheet` (real Core). The `sheet` adapter is unit-tested against fakes and never connected to a real Core before the gate passes and the owner says go.

**D47 Starter seed.** `data/seed/seed-50.csv` holds about 50 general A2–B1 records in the new layout: about 2/3 core, 1/3 chunks, with a few deliberately thin rows. It is gitignored, as is all seed content. `tools/seed-check.ts` (committed, no content) validates any seed file with the same validator and prints a report. The seed loads through the importer and writer into a local/fixture Core, and into the real Core only in Phase F with the owner's go. The demo deck is regenerated in the new layout (synthetic, committed).
