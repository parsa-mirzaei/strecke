# Strecke – project rules for Claude Code

Strecke is a German learning helper for A2–B1 learners: an offline-first PWA that opens straight into one practice card. Every word is a record; its exercises are generated from the record's columns. `docs/SPEC.md` is the source of truth; read it before any phase. The interface is specified in `docs/design/STATION.md`. Decisions and deviations go in `docs/DECISIONS.md`. Security docs (`docs/security/`) and the privacy rules below win over any brief.

## Privacy (hard rule, every file, every commit)
The repo is public (GitHub Pages) and a portfolio piece. Never commit, in any file or in git history:
- names, employers, cities, universities or any other detail about the learner; study data; Anki/CSV/seed content;
- Sheet IDs, Drive file/folder IDs, Apps Script URLs, tokens, routine/trigger IDs, email addresses.

Personal context lives only in the private Sheet (`README` tab, `config`) and in the gitignored `data/` folder (`data/private/` for context, filled-in runbooks, seed drafts). Generated files that embed personal context go to the gitignored `build/`. Committed files use placeholders (`<SHEET_ID>`, `{{LEARNER_CONTEXT}}`). Before every commit, stage the files and run:

```bash
bash tools/privacy-audit.sh
```

It checks generic patterns (emails, Google/Drive/Apps Script IDs and URLs, routine IDs, tokens) plus the learner-specific terms in `data/private/audit-terms.txt` (gitignored; never copy those terms into a committed file). It must print `clean`; `--all` scans every tracked file. Report what was removed. Keep commits small, clean and meaningful.

## Product framing
- General product, one user per copy: v0.1 is single-user, no accounts. Anyone can run their own copy with their own Sheet + Apps Script ("bring your own Sheet"). No personal data hardcoded; everything personal comes from configuration and the private Sheet.
- Default content is general A2–B1: `core` words (high-frequency) and `chunk`s (conversation phrases, `pos=phrase`). New-item mix ≈ 2/3 core, 1/3 chunk; own captures always accepted. No specialist or job-specific vocabulary from agents.
- Domains are everyday situations (`arbeit` = general working life), not jobs. A word's two examples sit in two different situations; *Zweiter Kontext* uses the unseen one.
- Demo mode (bundled ~20-item general deck, no token, no sync) is in v0.1 scope.
- Docs are written for an outside reader (engineer or recruiter).

## How to work
- Station phases A → F strictly in order (SPEC "Build phases"; they replace the MVP2 slices). At the end of each phase: stop, report (built / how each "Done when" was checked / what needs the product owner / open questions), wait for "go".
- Changes to **Scope, Data model, API contract or Agent integration**: write a proposal in `docs/DECISIONS.md` and ask first. Everything else: decide, and record notable choices in `DECISIONS.md`.
- The product owner is not an engineer: make technical calls yourself, keep manual steps few and exact. Be direct and brief.
- Test device: **Android phone, Chrome**. TTS, PWA install, safe areas and timing are judged there only. Desktop emulation is not evidence.

## Hard constraints
- No OpenAI/Anthropic API keys, no paid services, no per-token billing. Agents reach data only via the Google Sheet (`inbox`, or the fallback Phase 0 picks) using existing subscription connectors.
- No server to operate: GitHub Pages (static) + the learner's Google Sheet (plus an Inbox spreadsheet in hardened mode) + one Apps Script web app with triggers.
- Offline-first: render a card from IndexedDB in < 2 s on cold open; never block a card on the network. `bootstrap`/`sync` run in the background.
- Small bundle: Vite + TypeScript + Preact + `idb`, plain CSS transitions and the Web Animations API. Fonts and icons self-hosted (no font or icon CDN at runtime). Any other runtime dependency needs a justification in `DECISIONS.md`; asset budget in D44.
- Content is German with short English hints. UI labels in German as in STATION.md (*Weiter*, *Fertig*, *Bis gleich*, *Weiß ich nicht*, *Prüfen*, *Das sehen wir bald wieder.*, *Dein Weg*, *Wörter*, *Hinzufügen*, *Vorschläge*, *Einstellungen*, *Behalten*, *Nicht für mich*).
- Nothing from SPEC "Out of v0.1": no streaks, XP, levels, badges, due counts, backlog numbers, daily goals, progress bars, notifications, accounts, speech recognition, speed rounds, image generation or photos, native wrappers, FSRS optimizer, in-app editing beyond *Wörter* and *Vorschläge*. (Typed answers and the FSRS memory model are in scope since D40/D41.)

## Look and feel: Station (`docs/design/STATION.md`)
- Seven principles decide every screen and string: evidence, not rewards; never make the learner feel behind; only claims the event log supports, never real-world ability; companion, not teacher (no persona); alive but quiet; honesty is free; the science is invisible.
- Station signage on warm paper: dark boards for sentences, a mono label strip for context. **Amber marks what you have to retrieve** (blank, cover, article gap). No instruction captions: if an exercise needs one, fix the layout.
- Tokens, type (Overpass + Overpass Mono, self-hosted), components and contrast are in STATION.md. Light is the reference, dark keeps the same roles. **No red anywhere**: a wrong choice dims with a dashed outline and `GEWÄHLT`, the right one turns green, *Das sehen wir bald wieder.*
- No mascots, coins, confetti, emoji decoration, streak flames, praise copy. Icons: Lucide, inline SVG, 2 px round strokes.
- Use the skills `frontend-design`, `emil-design-eng`, `mobile-native`, `animate`, `apple-design` for UI work.
- Mobile basics: `100dvh`, safe-area insets with `viewport-fit=cover`, no tap highlight, `touch-action: manipulation`, 16 px inputs, hover only under `(hover: hover) and (pointer: fine)`, `theme-color` per scheme, never disable zoom.
- Motion: card enter 680 ms `cubic-bezier(.22,.9,.28,1.02)`, exit 340 ms; the right answer flies into the blank; the cover slides aside; after answering, *Weiter* or swipe up (follows the finger, rubber-bands, velocity-aware). Everything interruptible; press `scale(.97)`; haptics feature-detected; `prefers-reduced-motion` → fades only. Tuned on the Android phone only.
- Audio: Web Speech `de-DE`, voices via `voiceschanged` + timeout fallback, speak only inside tap handlers; hide the speaker and skip Hören if no German voice.

## Data and API (summary; SPEC wins on conflict)
- Tabs: `README`, `inbox`, `words`, `prompts`, `events`, `word_state`, `captures`, `config`. Agents append only to `inbox`; the normalizer is the only automated writer of `words`/`prompts`.
- `words` carries `tier` (core/chunk) and `start_stage` (0 except seed), plus optional record columns (`plural`, `example_de/en/form`, `example_2_de/en/form`, `collocation`, `prep`, `note`, `wrong_1/2`, `image_key`; D38). A missing column only means fewer exercises. `prompts` is an optional override layer. IDs minted by the writer: `w_`/`p_`/`e_`/`c_` + 8 chars. `dedupe_key` = `de` lower-cased, article stripped, whitespace collapsed, umlauts/ß kept; unique across all statuses.
- Domains (five): `arbeit`, `uni`, `amt`, `alltag`, `smalltalk`. pos: `noun`, `verb`, `adj`, `phrase`.
- Data access only through the `DataAdapter` interface (`demo`, `local`, `sheet`); UI and scheduler never know which.
- API (D31/D45): one Apps Script web app, actions `bootstrap` and `sync`, `POST` with `Content-Type: text/plain` and JSON body incl. a per-copy `token` (Script Properties + device only; never in URLs, repo or logs). Responses always `{ ok, error? }`. Writes under `LockService.getScriptLock()` and only through the core writer; batch `getValues`/`setValues`. `sync` idempotent by `event_id`; events append-only.
- Two deployment modes, same code: **simple** (one Google account, default for every copy, keep setup easy) and **hardened** (Core + web app in a vault account no AI tool is connected to, agents only reach the Inbox; used for the owner's own data, needs gate tests I-1..I-6). Never connect to a real Sheet without the owner's explicit go.
- The generic Sheet README text is `docs/sheet-readme.md`; `{{LEARNER_CONTEXT}}` is filled from `data/private/learner-context.txt` only into generated output.

## Engine
- `exercisesFor(word, allWords)` in `core/` generates exercises from record columns, exactly as SPEC "Exercises"; every row (including "column missing") and the distractor rules have Vitest tests.
- Ladder stages 0–5 decide the exercise type; an FSRS-5 memory model decides the due time; picking order exactly as SPEC "Learning engine". Ratings come from behaviour (right/wrong, help used, time), never from self-grade buttons. Scheduler = pure function of the event log plus `start_stage`, replay-deterministic. Every ladder transition and replay determinism have Vitest tests.

## Repo layout
- `app/` PWA · `core/` shared core (validator, importer, Core writer, audit, backup, exercise generator, scheduler; pure TS, no runtime deps) · `apps-script/` backend (clasp) · `agents/` agent prompts (placeholders only) · `spike/` Phase 0 throwaway · `tools/` build helpers (incl. `seed-check.ts`) · `docs/` SPEC, DECISIONS, ARCHITECTURE, design, security, runbooks · `data/seed/` gitignored seed files (never commit).
- Tooling: Node 24 LTS at `C:\Program Files\nodejs`, gh at `C:\Program Files\GitHub CLI` (add to PATH in Bash if missing). Python 3.11 for data scripts.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
