# Strecke v0.1 Spec

Revised Oct 2, 2026 (product framing, privacy, demo mode, tiers, Phase 7).

Strecke is a German learning helper for **A2–B1 learners**. It opens straight into one practice card in under 2 seconds, works offline, saves every answer to the learner's own Google Sheet, and accepts new vocabulary from scheduled AI agents through a review queue. v0.1 is **real and daily-usable**, not a mock-up: the first user runs a 4-week test with it.

## Product framing

- **General product, one user per copy.** v0.1 is single-user: no accounts, no multi-user. "General" means no personal data is hardcoded anywhere. Everything personal (the learner's contexts, captures, seed words, progress) comes from configuration and the learner's private Sheet. Anyone can run their own copy: their own Sheet + their own Apps Script ("bring your own Sheet").
- **Default content is general** A2–B1 vocabulary and conversation chunks. Personal material enters only through in-app captures and the private Sheet.
- **Goal:** widen general vocabulary and break the speaking lock. Specialist and job-specific vocabulary is out of scope for agents; learners pick that up from their environment.
- **Public repo, portfolio-grade.** The code and docs are written for an outside reader (engineer or recruiter). See Privacy.

**Hypothesis to test (4 weeks, first user):** if opening the app puts a relevant German retrieval on screen instantly, with no due count and no session to finish, the learner opens it in idle moments on at least 5 of 7 days, instead of social media.

**Bar for "usable", all must hold before the test starts:**

- Installed on the phone home screen as a PWA; cold open to first interactive card < 2 s after the first load.
- Works with no connection; answers given offline sync later without loss or duplicates.
- The Sheet is the source of truth for content; the learner can fix a typo in the Sheet and see it in the app on the next open.
- New words arrive without the learner typing them: from in-app capture, and from at least one scheduled agent, landing in a Pending queue the learner approves in the app.
- Seeded with 80–100 of the learner's real words before day 1 (in the private Sheet only).

**Product concept:** feed, not session; five-step word ladder; progress as abilities by everyday situation. This doc fixes scope and contracts for Claude Code.

## Privacy (hard rule)

The repo is public and served by GitHub Pages. Nothing personal goes into it, in files or in git history:

- no names, employers, cities, universities or other learner details; no study data; no CSV or seed content;
- no Sheet IDs, Drive IDs, Apps Script URLs, tokens, routine IDs or email addresses.

Personal context lives only in the private Sheet's `README` tab and in `config`. Local working files (exports, seed drafts, filled-in runbooks) live in the gitignored `data/` folder. Before every push, audit the diff for the items above.

## Architecture

```
phone (PWA, IndexedDB)  ⇄  Apps Script web app (bootstrap, sync)  ⇄  Google Sheet  ←  scheduled agents (inbox)
```

The Sheet is the source of truth and the only meeting point. Scheduled ChatGPT or Claude tasks append rows to `inbox` through the Google connectors of existing subscriptions; the Apps Script normalizer turns those rows into words and prompts; the phone renders from its own cache and only talks to the two-action API in the background.

## Scope

**In v0.1:**

- PWA (static files on GitHub Pages): manifest, service worker, app shell cached, content + state cached on device.
- Feed with 5 card types: Meet, Recognize (choice / article / listen-choice), Recall (cloze, say aloud, self-grade), Hear (listen to sentence, reveal), Use (cloze without hint, sentence in an unseen context).
- Word ladder + scheduler running on the device (rules in Learning engine).
- Checkpoint card every 8 cards; soft stop, never a "session complete".
- Progress page: core coverage and producible chunks, producible words per domain, then-vs-now examples, days with German this month.
- Capture sheet: one field + domain chip, saved to the Sheet.
- Pending queue: approve / reject / edit agent-proposed words with one tap each.
- Sync: append-only event log, batched upload, idempotent by event id.
- **Demo mode:** a bundled sample deck of ~20 general items (core + chunks). No token, no sync, state stays on the device. Lets a visitor try the live app.
- Backend: one Google Sheet (with `README` and `inbox` tabs) + one Apps Script web app with two actions + an hourly normalizer trigger.
- Agent integration through the Sheet: one weekly scheduled task (ChatGPT or Claude, whichever passes Phase 0) that appends to `inbox` using subscription connectors only.
- One-time seed: 80–100 words from the learner's own material (Anki deck, visual dictionary), enriched into prompts, written to the private Sheet only.
- Usage log for the 4-week test: app opens, cards per open, seconds per open.

**Out of v0.1 (do not build):**

- Any OpenAI or Anthropic API key, per-token billing, or agent-facing endpoint. Fallbacks B–D are built only if Phase 0 forces them.
- FSRS; optimizer; any statistics beyond the progress page and usage log.
- Typing answers, speech recognition, speed rounds, situation scenarios.
- Image generation of any kind; images are optional URLs only.
- Accounts, multi-user, sharing, notifications.
- In-app card editor beyond Pending edits (edit content in the Sheet).
- Streaks, XP, levels, due counts, daily goals.
- Native app wrappers (Capacitor, TWA).

**First feature after the test:** a speed round, i.e. response-time drills on chunks. Every review already logs `ms`, so the data exists.

## Content

- **Tiers.** Every word is `core` (high-frequency A2–B1 vocabulary) or `chunk` (a ready-made conversation phrase, `pos=phrase`, e.g. *Wie meinst du das?*, *Ich bin gerade dabei, …*).
- **New-item mix target:** about 2/3 core, 1/3 chunk. The learner's own captures are always accepted, whatever their tier.
- **No specialist or job-specific vocabulary** from agents.
- **Prompt diversity:** a word's two clozes sit in two different everyday situations; the *Anwenden* card uses a context the learner has not seen for that word.
- **Domains are everyday situations, not jobs:**

| Domain | Situations |
| --- | --- |
| `arbeit` | general working life: meetings, emails, colleagues, interviews, presentations |
| `uni` | studying: courses, exams, group work, campus |
| `amt` | offices and admin: appointments, forms, letters, bank, insurance |
| `alltag` | everyday life: shopping, home, transport, health, plans |
| `smalltalk` | chatting: opinions, feelings, weekend, reactions |

## Data model (one Google Sheet, one tab each)

Agents append only to `inbox`; the normalizer, the phone and the learner write everything else. `events` is append-only and never edited; `word_state` is a cache the phone writes so agents can see weak words. IDs are strings generated by the writer (`w_` + 8 chars, `p_` …, `e_` …) so offline writes never collide.

| Tab | Columns | Written by |
| --- | --- | --- |
| `README` | Plain text: inbox schema, rules, example rows, domains, level, tier mix, the learner's contexts (private) | Learner / setup script, once |
| `inbox` | See Agent integration (agent columns + `status`, `reason`, `word_id`) | Agents append; normalizer sets status |
| `words` | word\_id, de, article (der/die/das/empty), en, pos (noun/verb/adj/phrase), tier (core/chunk), domain, family, start\_stage (0–2), image\_url, image\_ok, source (seed/capture/claude/chatgpt/manual), status (active/pending/rejected/suspended), dedupe\_key, created\_at, updated\_at | Normalizer, app (approve/reject/edit), learner by hand |
| `prompts` | prompt\_id, word\_id, kind (cloze/listen/choice), de\_text (cloze uses `___`), answer, hint\_en, en\_text, distractors (JSON array of 2), status | Normalizer, learner by hand |
| `events` | event\_id, ts, type, word\_id, prompt\_id, card\_type, result (1/0), ms, payload (JSON), device | App only (append) |
| `word_state` | word\_id, stage (0–5), due\_at, lapses, streak, last\_seen | App via sync (upsert) |
| `captures` | capture\_id, ts, text, domain, context, status (new/processed/rejected) | App (new), normalizer (processed) |
| `config` | key, value | Learner by hand |

**Rules:**

- `domain` is one of: `arbeit`, `uni`, `amt`, `alltag`, `smalltalk` (see Content). Application writing (CV, cover letter) is out of scope; job interviews count as `arbeit`.
- `tier` is `core` or `chunk`; chunks have `pos=phrase`. Empty `tier` on import defaults to `core` for noun/verb/adj and `chunk` for phrase.
- `start_stage` is 0 for everything except seed rows (see Phase 2). It sets where a word enters the ladder; the scheduler treats it as the stage before the first event.
- `dedupe_key` = `de` lower-cased, article stripped, whitespace collapsed (keep umlauts and ß). Unique across all statuses, so a rejected word is never proposed twice.
- `event.type` values: `open`, `close`, `review`, `capture`, `approve`, `reject`, `edit`, `image_ok`.
- Every active word needs at least 1 cloze prompt; 2 cloze + 1 listen is the target.
- `config` defaults: `new_per_day=5`, `backlog_pause=40`, `checkpoint_every=8`, `inbox_max_per_run=20`.
- Protect `words`, `prompts`, `events` and `word_state` with a Sheet warning-only protection, so an agent that wanders outside `inbox` triggers a warning instead of silently editing.

## API contract (Apps Script web app, used by the PWA only)

The API exists for the phone alone; agents never call it. Two actions, one token. Every call is a `POST` with `Content-Type: text/plain` and a JSON body `{ "action": …, "token": …, … }`, which avoids the CORS preflight Apps Script cannot answer and keeps the token out of URLs (Apps Script cannot read request headers). Deployment: executed as the Sheet owner, access "Anyone", `APP_TOKEN` in Script Properties.

| Action | Request | Response | Notes |
| --- | --- | --- | --- |
| `bootstrap` | `since` (ISO, optional) | `words`, `prompts`, `word_state`, `config`, `server_time` | Runs the normalizer first, then returns rows changed since `since` (all rows when empty) |
| `sync` | `events[]`, `state[]` | `accepted` (event ids), `server_time` | Idempotent by `event_id`; applies approve/reject/edit to `words`; appends captures; upserts `word_state` |

**Server rules:**

- All writes inside `LockService.getScriptLock()`, so the hourly normalizer and a phone `sync` never write at the same moment.
- Batch reads and writes with `getValues`/`setValues`, never cell by cell.
- Responses always include `ok: true/false` and a readable `error`.
- Not in v0.1: `context`, `ingest`, `AGENT_TOKEN`. They return only as fallback C if Phase 0 requires it.

Demo mode never calls the API.

## Learning engine (runs on the phone)

Each word sits on a ladder; its stage decides the card type, and a miss moves it down. The scheduler is a plain function of the event log (plus each word's `start_stage`), so FSRS can replace it later by replaying the same log.

| Stage | Name | Card shown | On success | On miss |
| --- | --- | --- | --- | --- |
| 0 | New | Meet: word, article, English, one sentence, audio. Buttons: *Neu für mich* / *Kenne ich schon* | Neu → stage 1, due in \~2 cards. Kenne → stage 2, due in \~3 cards | — |
| 1 | Erkennen | Noun: der/die/das tap. Other: German → 3 English options, or listen → 3 meanings | → 2, due +10 min | stays 1, back in 3–5 cards |
| 2 | Abrufen | Cloze with English hint; say it aloud; reveal; *Hatte ich* / *Nicht ganz* | → 3, due +1 day | → 1, back in 3–5 cards, lapses +1 |
| 3 | Hören | Listen prompt plays, no text; reveal text + meaning; self-grade. Skip to 4 if no listen prompt | → 4, due +3 days | → 2, back in 3–5 cards, lapses +1 |
| 4 | Anwenden | A cloze in a context not yet seen for this word, no hint | → 5, due +7 days | → 2, due +10 min, lapses +1 |
| 5 | Sicher | Rotates Abrufen / Hören / Anwenden | interval × 2.5 (max 120 days) | → 2, interval reset, lapses +1 |

**Picking the next card**, in order:

1. A same-visit reinsertion whose turn has come.
2. Due words (`due_at ≤ now`), most overdue first.
3. A new word, if fewer than `new_per_day` introduced today and due count < `backlog_pause`. Words with `start_stage > 0` enter here too, skipping Meet. Pick new words toward the 2/3 core, 1/3 chunk mix.
4. Nothing due: practise the next-soonest word (logged as a review, interval grows only ×1.2). The feed never runs out.

**Constraints on the sequence:**

- No same word within 3 cards (except reinsertions).
- No same domain or same card type 3 times in a row.
- After 2 misses in a row, the next card is a stage-5 or stage-4 word (an easy win).
- A checkpoint card after every `checkpoint_every` cards.

**"Producible" for progress** means stage ≥ 3. **Core coverage** = producible core words / all active core words. **Chunks you can say** = producible chunks. **Then-vs-now** lists words with a miss at least 7 days ago and 2+ correct productions since.

Every review event stores `ms` (card shown → reveal or answer). It is not used in v0.1 scheduling; it is logged for the speed round after the test.

## App screens and behaviour

The app has no home screen: opening it shows a card. Everything else is one gesture away and never in the way.

| Screen | How you get there | What it does |
| --- | --- | --- |
| First run | Only once | Two choices: *Demo ausprobieren* (bundled deck, no setup) or *Eigenes Sheet verbinden* (paste API URL + app token, test connection, download content). Then the first card |
| Feed | Default on every open | One card at a time; domain chip top-left; small `+` and progress icon top-right; nothing else. Demo mode shows a quiet "Demo" label |
| Checkpoint | Every 8 cards in the feed | One true progress sentence + *Weiter* / *Fertig*. *Fertig* just shows a calm "Bis gleich" state; the feed resumes on the next open |
| Progress | Swipe left or progress icon | Core coverage, chunks you can say, producible words per domain (bars), then-vs-now examples, days with German this month, Pending count |
| Pending | From Progress | Agent-proposed words, one per row: approve, reject, or tap to edit `de` / `en` / domain |
| Capture | `+` anywhere | Bottom sheet: one text field (16 px font), domain chips, Save. Closes in one tap. Hidden in demo mode |

**Behaviour requirements:**

- **Offline first.** Render from IndexedDB before any network call; `bootstrap` runs in the background and updates silently.
- **Sync.** Events queue locally; flush on every 10 events, on `visibilitychange → hidden`, and on open. Show a tiny dot only when unsynced events are older than 24 h.
- **Audio.** Web Speech API, `de-DE`. Load voices via `voiceschanged` with a timeout fallback. Speak only inside tap handlers. If no German voice exists, hide the speaker icon and show one note on the Progress page.
- **Speed.** Card-to-card transition ≤ 200 ms, ease-out. Grading advances immediately; a wrong choice shows the right answer and waits for one tap.
- **Usage log.** `open` event on `visibilitychange → visible`, `close` on hidden, with cards seen in between.
- **Mobile-native basics.** `100dvh`, safe-area insets, no tap highlight, `touch-action: manipulation`, 16 px inputs, hover styles only under `(hover: hover)`, `theme-color` per scheme.
- **Look.** Calm and typographic, closer to a good notebook than a game. Light and dark theme. No mascots, coins, emoji decorations, confetti or streak flames. Use the installed skills `frontend-design`, `emil-design-eng`, `mobile-native`, `animate` and `apple-design` for UI work.

## Agent integration: the Sheet is the boundary

AI agents write content straight into the learner's Google Sheet, using the Google connectors of existing ChatGPT or Claude subscriptions. No OpenAI or Anthropic API key, no per-token billing, no agent endpoint. The PWA and Apps Script only read Sheet state and never know whether a row came from ChatGPT, Claude or the learner.

```
Scheduled ChatGPT / Claude task  →  Google Sheet (inbox tab)  →  normalizer  →  words + prompts  →  PWA
```

**Agents append to one flat `inbox` tab, not to `words` and `prompts` directly.** An LLM writing through a connector reliably appends a row of plain columns; it is unreliable at minting linked IDs across two tabs and computing dedupe keys. So the agent writes one row per word, and an Apps Script **normalizer** turns valid rows into a pending word plus its prompts. If Phase 0 shows agents write the two linked tabs cleanly, the normalizer still stays as the guard.

**`inbox` columns (agent fills these):** `de`, `article`, `en`, `pos`, `tier`, `domain`, `family`, `cloze_1`, `answer_1`, `hint_1`, `cloze_2`, `answer_2`, `listen_de`, `listen_en`, `wrong_1`, `wrong_2`, `capture_id`, `start_stage` (seed only), `source` (chatgpt/claude/manual/seed), `run_id`. **Normalizer fills:** `status` (imported/duplicate/invalid), `reason`, `word_id`.

**The Sheet documents itself.** A `README` tab holds the inbox schema, validation rules, two example rows, the domain list, the target level (A2–B1), the tier mix, and the learner's own contexts. The generic part of that text is in the repo (`docs/sheet-readme.md`); the learner's contexts are written only into the private Sheet. The scheduled prompt stays short: open the Sheet by its ID, read `README`, follow it. Changing the rules means editing `README`, not every scheduled task.

**Normalizer (Apps Script, hourly trigger, also run at the start of every `bootstrap`):**

- For each `inbox` row with empty `status`: validate, compute `dedupe_key`, check against all `words`.
- Valid new word → `words` row (`status=pending`, or `active` when `capture_id` is set or `source=seed`, since the learner supplied those words) + 1–4 `prompts` rows.
- `de` matching an existing active word → its clozes are added as extra prompts to that word (how agents reinforce weak words).
- Duplicate or invalid → `status` + `reason` on the inbox row; nothing else written.
- `capture_id` set → that capture is marked `processed`, so agents never update `captures` themselves.
- Validation rules: required `de`, `en`, `pos`, `domain`, `cloze_1`, `answer_1`; `article` only for nouns, only der/die/das; `tier` empty, core or chunk; each cloze has exactly one `___`; sentences ≤ 14 words; `start_stage` only with `source=seed`.

**Weekly scheduled task (same prompt for ChatGPT or Claude, stored in the repo as `agents/weekly.md` with a `<SHEET_ID>` placeholder; the filled-in copy lives only in the scheduler):**

1. Open the Sheet by ID; read `README`.
2. Read `words` (to avoid duplicates), `word_state` (weak words: most lapses), `captures` with `status=new`.
3. Append one `inbox` row per new capture, enriched, with `capture_id` set.
4. Append one row with a new cloze in a new everyday situation for each of the 5 weakest words.
5. Append up to 10 new A2–B1 items, about 2/3 core and 1/3 chunk, weighted to the domains with the fewest words. No specialist or job-specific vocabulary.
6. Write only to `inbox`. Never edit or delete other rows. End with a one-line summary of what was added.

Whether scheduled runs can use these connectors without a human present is not settled: an [OpenAI forum answer](https://community.openai.com/t/task-connection-google-sheets/1382361) says ChatGPT tasks cannot act on connected services, while [another guide](https://porteden.com/blog/chatgpt-scheduled-tasks-tools/) says write-enabled connectors work in tasks. Claude scheduled runs with the Google connector are also unverified. Phase 0 decides.

**Fallbacks, built only if Phase 0 shows no scheduler can write to the Sheet reliably** (in this order, cheapest first):

| Option | What it adds | Needs |
| --- | --- | --- |
| B. Drive inbox file | Agent creates a CSV in a Drive folder; the normalizer imports it into `inbox` | Drive file creation works where Sheets editing does not |
| C. HTTP ingest | An Apps Script `ingest` action with its own agent token | An agent that can make HTTP calls |
| D. Manual paste | Agent outputs CSV rows; the learner pastes them into `inbox` | Nothing; always works, costs \~30 s a week |

## Build phases for Claude Code

Build backend before UI, and prove the three risky parts on the test phone before anything else. Each phase ends with something checkable. Claude Code stops after each phase and waits for the product owner's go.

**Stack:** Vite + TypeScript + Preact (small bundle for fast open), plain CSS transitions (no animation library needed in v0.1), IndexedDB via `idb`, Vitest for the engine, `clasp` to keep the Apps Script code in the repo. Repo layout: `app/`, `apps-script/`, `agents/`, `docs/SPEC.md` (this doc), `CLAUDE.md`.

0. **Phase 0, risk spike (1–2 evenings).**
   - Make a throwaway Sheet "Strecke-test" with `README`, `inbox` and `words` (5 sample rows).
   - Run the agent checklist below for a ChatGPT scheduled task and a Claude scheduled task: first interactively, then as a scheduled run 5 minutes ahead, then one run while the learner is away from the computer.
   - A bare page on GitHub Pages POSTs to a hello-world Apps Script endpoint from the test phone; measure round-trip time.
   - The same page, installed to the home screen, speaks a German sentence with Web Speech.
   - *Done when:* every checklist cell is yes, no, or unverified (unverified only when tested and the result was ambiguous), and the chosen path (A direct Sheet write, or fallback B, C or D) is written into `docs/DECISIONS.md`.
1. **Phase 1, backend.**
   - `setup()` creates every tab with headers, the `README` text and warning-only protections; `bootstrap` and `sync`; the normalizer and its hourly trigger; `APP_TOKEN` in Script Properties.
   - *Done when:* a script exercises both actions; a repeated `sync` is accepted once; the normalizer imports a valid inbox row, marks a duplicate and an invalid row with reasons, and marks a referenced capture processed.
2. **Phase 2, seed content (private Sheet only).**
   - A script in Claude Code turns the learner's Anki export and visual-dictionary word list (pulled from Canva via the connector) into `inbox` rows with `source=seed`. Output goes to the private Sheet and the gitignored `data/` folder, never the repo.
   - Deduplicate across sources; tag every item core/chunk; drop specialist or job-specific jargon and list the dropped words in `DECISIONS.md` for confirmation; rewrite example sentences longer than 14 words.
   - Start stages: Anki words were already studied, so they start at stage 2 (older iterations) or 1 (latest iteration), never 0. Visual-dictionary-only words start at 0.
   - Gate: generate 20 items end to end and show a sample table (word, tier, 2 clozes, listen sentence, distractors) for a German check. Run the rest in batches only after the OK.
   - *Done when:* 80–100 active words, each with at least 1 cloze, most with 2 cloze + 1 listen.
3. **Phase 3, offline app core.**
   - PWA shell + service worker, IndexedDB cache, engine as pure tested functions, feed with all five card types, audio, demo mode with the bundled ~20-item general deck.
   - *Done when:* engine tests cover every ladder row; the app works in airplane mode; cold open to first card < 2 s on the test phone; demo mode works on the live URL without a token.
4. **Phase 4, sync and the other screens.**
   - Event queue + `sync`, background `bootstrap`, Capture, Progress, Pending, checkpoint, usage log.
   - *Done when:* 30 offline reviews sync exactly once after reconnecting; a capture appears in the Sheet; approving a pending word puts it in the feed.
5. **Phase 5, first agent.**
   - `agents/weekly.md` prompt (points at `README`, Sheet ID as a placeholder); a weekly scheduled task on the path chosen in Phase 0.
   - *Done when:* two consecutive unattended runs append rows that the normalizer imports, with no edits outside `inbox`.
6. **Phase 6, the 4-week test.**
   - Pause other spaced-repetition decks; put Strecke where the most-used social app was on the home screen.
   - Measure: days used per week, opens per day, cards and seconds per open, a weekly one-line note, and production of a fixed 20-word list in week 0 vs week 4.
   - *Kill criterion:* used on fewer than 4 days a week by week 3.
7. **Phase 7, showcase (only after the test).**
   - Case-study README: problem, hypothesis, architecture, screenshots/GIF, measured results.
   - A short German summary (written by the product owner).
   - An honest note: built with Claude Code; the product owner owned product, spec and decisions.
   - Bring-your-own-Sheet setup guide: create the Sheet, deploy the Apps Script, set the token, connect the app, optionally schedule an agent.

**Phase 0 agent checklist** (fill each cell with yes / no / unverified):

| Capability | ChatGPT scheduled task | Claude scheduled task |
| --- | --- | --- |
| Finds the Strecke Sheet by ID or name in a scheduled run |  |  |
| Reads rows from `README`, `words`, `word_state`, `captures` |  |  |
| Appends rows to `inbox` |  |  |
| Updates an existing cell (needed only for fallback-free capture handling; normally not required) |  |  |
| Runs with no manual confirmation per write |  |  |
| Hits the same Sheet on 3 consecutive runs |  |  |
| Puts values in the right columns per `README`, adds no tabs |  |  |
| Skips words already in `words` |  |  |

## Open decisions and risks

| Decision | Default | Why it matters |
| --- | --- | --- |
| Test phone | Android + Chrome (decided) | TTS voice behaviour and PWA install steps; test on that phone only |
| Answer mode | Say aloud + self-grade | Typing on a train is friction; speaking trains the real bottleneck |
| Other SRS decks during the test | Paused for 4 weeks | Two review queues split the habit and spoil the test |
| Images in v0.1 | Optional `image_url`, none required | Image hosting is fragile; images are not the hypothesis |
| Domains | arbeit, uni, amt, alltag, smalltalk (everyday situations; decided) | Drives progress page and agent targeting |
| Scheduler: ChatGPT, Claude, or both | Whichever passes the Phase 0 checklist; both if both pass | Decides the weekly task and whether any fallback is built |

**Risks to watch:**

- **Scheduled agents may not reach the Sheet unattended.** Connector access in scheduled runs is unverified for both ChatGPT and Claude, and vendors change it without notice. Phase 0 settles it; fallback D (paste CSV rows into `inbox`) always works.
- **Agents editing outside `inbox`.** A connector usually has write access to the whole Sheet. Mitigated by `README` rules, warning-only protections on the core tabs, and the normalizer being the only automated writer of `words` and `prompts`. Google's version history recovers a bad run.
- **Wrong German from agents.** Pending review catches invented words. Enriched captures and extra prompts for existing words go live without review, so their sentences can still contain errors; the learner fixes those in the Sheet.
- **Subscription limits.** Scheduled tasks count against subscription usage; one weekly run should be small, but the limits are the vendors' and can change.
- **Apps Script latency.** Calls can take a second or more (estimate). Mitigated by rendering from the device cache and syncing in the background; never block a card on the network.
- **Open deployment + token.** "Anyone" access means `APP_TOKEN` is the only lock. Keep it out of the repo and URLs.
- **Public repo.** GitHub Pages on a free plan needs a public repo. Covered by the Privacy rule; audit every push.
- **Building instead of learning.** Phases 0–5 should fit in about two weeks of evenings (estimate). If Phase 3 slips past week 3, cut scope rather than extend.
