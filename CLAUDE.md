# Strecke – project rules for Claude Code

Strecke is a German learning helper for A2–B1 learners: an offline-first PWA that opens straight into one practice card. `docs/SPEC.md` is the source of truth; read it before any phase. Decisions and deviations go in `docs/DECISIONS.md`.

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
- Domains are everyday situations (`arbeit` = general working life), not jobs. A word's two clozes sit in two different situations; *Anwenden* uses an unseen context.
- Demo mode (bundled ~20-item general deck, no token, no sync) is in v0.1 scope.
- Docs are written for an outside reader (engineer or recruiter).

## How to work
- Phases 0 → 7 strictly in order (SPEC "Build phases"). At the end of each phase: stop, report (built / how each "Done when" was checked / what needs the product owner / open questions), wait for "go".
- Changes to **Scope, Data model, API contract or Agent integration**: write a proposal in `docs/DECISIONS.md` and ask first. Everything else: decide, and record notable choices in `DECISIONS.md`.
- The product owner is not an engineer: make technical calls yourself, keep manual steps few and exact. Be direct and brief.
- Test device: **Android phone, Chrome**. TTS, PWA install, safe areas and timing are judged there only. Desktop emulation is not evidence.

## Hard constraints
- No OpenAI/Anthropic API keys, no paid services, no per-token billing. Agents reach data only via the Google Sheet (`inbox`, or the fallback Phase 0 picks) using existing subscription connectors.
- No server to operate: GitHub Pages (static) + one Google Sheet + one Apps Script web app.
- Offline-first: render a card from IndexedDB in < 2 s on cold open; never block a card on the network. `bootstrap`/`sync` run in the background.
- Small bundle: Vite + TypeScript + Preact + `idb`, plain CSS transitions. Any other runtime dependency needs a justification in `DECISIONS.md`.
- Content is German with short English hints. UI labels in German as in the spec (*Neu für mich*, *Kenne ich schon*, *Hatte ich*, *Nicht ganz*, *Weiter*, *Fertig*, *Bis gleich*).
- Nothing from SPEC "Out of v0.1": no streaks, XP, levels, due counts, daily goals, notifications, accounts, typing answers, speech recognition, speed rounds, image generation, native wrappers, FSRS, in-app editor beyond Pending edits.

## Look and feel
- Calm, typographic, a good notebook, not a game. No mascots, coins, confetti, emoji decoration, streak flames. Light + dark theme.
- Use the skills `frontend-design`, `emil-design-eng`, `mobile-native`, `animate`, `apple-design` for UI work.
- Mobile basics: `100dvh`, safe-area insets with `viewport-fit=cover`, no tap highlight, `touch-action: manipulation`, 16 px inputs, hover only under `(hover: hover) and (pointer: fine)`, `theme-color` per scheme, never disable zoom.
- Card-to-card ≤ 200 ms ease-out. Grading advances immediately; a wrong choice shows the answer and waits for one tap.
- Audio: Web Speech `de-DE`, voices via `voiceschanged` + timeout fallback, speak only inside tap handlers; hide the speaker if no German voice.

## Data and API (summary; SPEC wins on conflict)
- Tabs: `README`, `inbox`, `words`, `prompts`, `events`, `word_state`, `captures`, `config`. Agents append only to `inbox`; the normalizer is the only automated writer of `words`/`prompts`.
- `words` carries `tier` (core/chunk) and `start_stage` (0 except seed). IDs minted by the writer: `w_`/`p_`/`e_`/`c_` + 8 chars. `dedupe_key` = `de` lower-cased, article stripped, whitespace collapsed, umlauts/ß kept; unique across all statuses.
- Domains (five): `arbeit`, `uni`, `amt`, `alltag`, `smalltalk`. pos: `noun`, `verb`, `adj`, `phrase`.
- API: one Apps Script web app, actions `bootstrap` and `sync`, `POST` with `Content-Type: text/plain` and JSON body incl. `token`. Responses always `{ ok, error? }`. All writes under `LockService.getScriptLock()`, batch `getValues`/`setValues`. `sync` idempotent by `event_id`; events append-only.
- The generic Sheet README text is `docs/sheet-readme.md`; `{{LEARNER_CONTEXT}}` is filled from `data/private/learner-context.txt` only into generated output.

## Engine
- Ladder stages 0–5 and the picking order exactly as SPEC "Learning engine". Scheduler = pure function of the event log plus `start_stage` (so FSRS can replay it later). Every ladder row has a Vitest test.

## Repo layout
- `app/` PWA · `apps-script/` backend (clasp) · `agents/` agent prompts (placeholders only) · `spike/` Phase 0 throwaway · `tools/` build helpers · `docs/` SPEC, DECISIONS, runbooks.
- Tooling: Node 24 LTS at `C:\Program Files\nodejs`, gh at `C:\Program Files\GitHub CLI` (add to PATH in Bash if missing). Python 3.11 for data scripts.
