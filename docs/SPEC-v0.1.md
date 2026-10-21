# Strecke v0.1 Spec

Revised Oct 2, 2026 (product framing, privacy, demo mode, tiers, Phase 7) and Oct 7, 2026 (Station interface, exercises generated from record columns, FSRS memory model, typed answers; DECISIONS D36–D47). Interface details: [design/STATION.md](design/STATION.md).

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
- New words arrive without the learner typing them: from in-app capture, and from at least one scheduled agent, landing as *Vorschläge* the learner keeps or dismisses in the app.
- A row added to the Sheet (by hand or through the Inbox) appears with its exercises after the next sync, with no code change or deploy.
- Seeded with 80–100 of the learner's real words before day 1 (in the private Sheet only).

**Product concept:** one card at a time, no session to finish. Every word is a record; its exercises are generated from whatever columns it has. A stage ladder decides which exercise a word is ready for, and a memory model decides when it comes back, invisibly. Progress is shown only as evidence from the learner's own log. This doc fixes scope and contracts for Claude Code.

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
- Practice with 8 exercises generated from record columns: Karte, Artikel, Bedeutung, Lücke, Präposition, Hören, Tippen, Zweiter Kontext (see Exercises).
- Word ladder + FSRS memory model running on the device (rules in Learning engine).
- Open-ended visits: no goal, no counter; *Fertig* ends with a calm *Bis gleich*.
- *Dein Weg*: evidence the event log supports (before/after pairs, a fully known sentence), no scores or counts.
- *Wörter*: browse, search, inspect, edit and suspend words.
- *Hinzufügen* (capture): one field + domain chip, saved to the Sheet.
- *Vorschläge*: keep or dismiss agent-proposed words, as a list and as `VORSCHLAG` cards in practice.
- *Einstellungen*: theme, sound, vibration, data source, demo.
- Sync: append-only event log, batched upload, idempotent by event id.
- Data access behind one `DataAdapter` interface: `demo`, `local` (IndexedDB + fixtures), `sheet`.
- **Demo mode:** a bundled sample deck of ~20 general items (core + chunks). No token, no sync, state stays on the device. Lets a visitor try the live app.
- Backend: one Google Sheet (with `README` and `inbox` tabs) + one Apps Script web app with two actions + an hourly normalizer trigger.
- Agent integration through the Sheet: one weekly scheduled task (ChatGPT or Claude, whichever passes Phase 0) that appends to `inbox` using subscription connectors only.
- One-time seed: 80–100 words from the learner's own material (Anki deck, visual dictionary), enriched into prompts, written to the private Sheet only.
- Usage log for the 4-week test: app opens, cards per open, seconds per open.

**Out of v0.1 (do not build):**

- Any OpenAI or Anthropic API key, per-token billing, or agent-facing endpoint. Fallbacks B–D are built only if Phase 0 forces them.
- FSRS parameter optimizer; any statistics beyond *Dein Weg* and the usage log.
- Speech recognition, speed rounds, situation scenarios.
- Image generation, photographs, stock illustration. Pictures are optional bundled pictograms only (`image_key`).
- Accounts, multi-user, sharing, notifications.
- In-app editing beyond *Wörter* (edit, suspend) and *Vorschläge* (edit content in the Sheet).
- Streaks, XP, levels, badges, due counts, backlog numbers, daily goals, progress bars, mascots, confetti, red "wrong" styling.
- Native app wrappers (Capacitor, TWA).

**First feature after the test:** a speed round, i.e. response-time drills on chunks. Every review already logs `ms`, so the data exists.

## Content

- **Tiers.** Every word is `core` (high-frequency A2–B1 vocabulary) or `chunk` (a ready-made conversation phrase, `pos=phrase`, e.g. *Wie meinst du das?*, *Ich bin gerade dabei, …*).
- **New-item mix target:** about 2/3 core, 1/3 chunk. The learner's own captures are always accepted, whatever their tier.
- **No specialist or job-specific vocabulary** from agents.
- **Example diversity:** a word's two examples (`example_de`, `example_2_de`) sit in two different everyday situations; *Zweiter Kontext* uses the second one, which the learner has not yet practised for that word.
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
| `words` | word\_id, de, article (der/die/das/empty), en, pos (noun/verb/adj/phrase), tier (core/chunk), domain, family, start\_stage (0–2), image\_url, image\_ok, source (seed/capture/claude/chatgpt/manual), status (active/pending/rejected/suspended), dedupe\_key, created\_at, updated\_at, then the optional record columns below | Normalizer, app (approve/reject/edit), learner by hand |
| `prompts` | prompt\_id, word\_id, kind (cloze/listen/choice), de\_text (cloze uses `___`), answer, hint\_en, en\_text, distractors (JSON array of 2), status. **Optional override layer**: a word needs no prompts | Normalizer, learner by hand |
| `events` | event\_id, ts, type, word\_id, prompt\_id, card\_type (the exercise: karte/artikel/bedeutung/luecke/praeposition/hoeren/tippen/kontext2), result (1/0, empty for karte), ms, payload (JSON: chosen option, near\_miss, text\_shown, dont\_know), device | App only (append) |
| `word_state` | word\_id, stage (0–5), due\_at, lapses, streak, last\_seen, stability, difficulty, reps. A cache derivable from `events` | App via sync (upsert) |
| `captures` | capture\_id, ts, text, domain, context, status (new/processed/rejected) | App (new), normalizer (processed) |
| `config` | key, value | Learner by hand |

**Optional record columns on `words`** (D38). A missing column never breaks anything; it only means fewer exercises. The minimum record is `de` and `en`, plus `pos` (an article alone implies a noun). `domain` may stay empty on the learner's own rows; agent rows need `pos`, `domain` and a first example with translation (D48).

| Column | Meaning |
| --- | --- |
| `plural` | the full plural form (`Haltestellen`, `Anschlüsse`); never an ending such as `-en`, because a leading dash is a formula prefix (D48) |
| `example_de`, `example_en` | one natural example sentence (≤ 14 words) and its translation |
| `example_form` | the exact surface form of the word inside `example_de`; empty means `de`. The exercise blanks this form. For chunks it is the chunk |
| `example_2_de`, `example_2_en`, `example_2_form` | a second example in a different everyday situation |
| `collocation` | a common combination, e.g. *einen Termin vereinbaren* |
| `prep` | the typical preposition, e.g. *für* (closed list) |
| `note` | one short usage or grammar note, only if it prevents a typical mistake |
| `wrong_1`, `wrong_2` | optional hand-picked wrong English meanings; otherwise distractors are generated |
| `image_key` | optional key of a bundled pictogram (allow-list) |

Legacy values win over generated ones for the same word: `prompts` rows and the v1 Inbox `cloze_1/2`, `listen_de/en`.

**Rules:**

- `domain` is one of: `arbeit`, `uni`, `amt`, `alltag`, `smalltalk` (see Content). Application writing (CV, cover letter) is out of scope; job interviews count as `arbeit`.
- `tier` is `core` or `chunk`; chunks have `pos=phrase`. Empty `tier` on import defaults to `core` for noun/verb/adj and `chunk` for phrase.
- `start_stage` is 0 for everything except seed rows (see Phase 2). It sets where a word enters the ladder; the scheduler treats it as the stage before the first event.
- `dedupe_key` = `de` lower-cased, article stripped, whitespace collapsed (keep umlauts and ß). Unique across all statuses, so a rejected word is never proposed twice.
- `event.type` values: `open`, `close`, `seen` (Karte), `review`, `capture`, `approve`, `reject`, `edit`, `suspend`, `image_ok`.
- No word needs a prompt. A full row (both examples, `prep`, `collocation`) is the target for agent and seed rows.
- `config` defaults: `new_per_day=5`, `backlog_pause=40`, `retention=0.9`, `inbox_max_per_run=20`.
- Protect `words`, `prompts`, `events` and `word_state` with a Sheet warning-only protection, so an agent that wanders outside `inbox` triggers a warning instead of silently editing.

## API contract (Apps Script web app, used by the PWA only)

> **Two deployment modes, one API (DECISIONS D45).** *Simple mode* (default): the learner's one Google account holds the Sheet and this web app. *Hardened mode* (optional, used for the owner's own data): Core and this web app live in a vault account no AI tool is connected to; agents reach only a separate Inbox spreadsheet ([security/ARCHITECTURE.md §8](security/ARCHITECTURE.md#8-deployment-modes-d45)). The app code is the same in both.

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

## Exercises (generated from the record)

`exercisesFor(word, allWords)` in `core/` is a pure function. It returns every exercise the record's columns allow. Vitest covers each row below, including "column missing". Visual layout: [design/STATION.md](design/STATION.md).

| Exercise | Needs | What the learner does | Stages |
| --- | --- | --- | --- |
| **Karte** | `de`, `en` | Sees the word (article chip, plural) and the example with the word highlighted; lifts an amber cover to see the meaning, then the translation, collocation and note. Not graded | 0 |
| **Artikel** | `article` (noun) | Picks der/die/das for the amber gap before the noun | 1+ |
| **Bedeutung** | `de`, `en`, 2 distractors | Picks the meaning out of three | 1+ |
| **Lücke** | `example_de` containing the form, 2 distractors | Picks the form for the amber blank in the sentence (translation shown at stages 1–2) | 1–3 |
| **Präposition** | `prep` | Picks the preposition for `zuständig ___` (or the example with the preposition blanked) | 2+ |
| **Hören** | `example_de` or `de`, a German voice, 2 meaning distractors | Hears the sentence (speech starts inside the tap), picks the meaning; *Gerade kein Ton? Text zeigen* | 2+ |
| **Tippen** | `example_de` containing the form | Types the form into the blank; forgiving matching (D40) | 3+ |
| **Zweiter Kontext** | `example_2_de` containing its form, 2 distractors | A Lücke in the second, unseen situation, no translation | 4+ |

- A record with only `de`, `en`, `article` gets Karte, Artikel, Bedeutung. A full row gets all eight.
- **Distractors** come from other records: same `pos`, same `tier` preferred. For Bedeutung and Hören they are meanings (`wrong_1`/`wrong_2` first, when present); for Lücke they are forms. They are never the answer and never duplicates. With fewer than 3 candidates the exercise is skipped.
- **Overrides:** a `prompts` row or a legacy v1 cloze/listen value for the same word replaces the generated sentence.
- Every graded exercise offers *Weiß ich nicht*, which is a miss and costs nothing more.

## Learning engine (runs on the phone)

Two parts, both pure functions of the append-only event log plus each word's `start_stage`. Events are folded in `(ts, event_id)` order, so the same log always gives the same state (replay determinism, tested).

1. The **stage ladder** decides *which* exercise types a word is ready for.
2. An **FSRS-5 memory model** decides *when* the word is due (D41).

**Ladder.** At each stage the word may get any exercise whose stage range includes it. The **gate** is the hardest exercise the record supports at that stage. Only a correct gate answer promotes the word; other exercises at the stage add variety and still update the memory model.

| Stage | Name | Gate (fallback when the record lacks it) | On correct gate | On miss |
| --- | --- | --- | --- | --- |
| 0 | Neu | Karte (seen, not graded) | → 1; short recall 3–5 cards later in the same visit | — |
| 1 | Erkennen | Lücke (else Artikel, else Bedeutung) | → 2 | stays 1, back in 3–5 cards |
| 2 | Abrufen | Lücke with translation, or Präposition (else the stage-1 gate) | → 3 | → 1, back in 3–5 cards, lapses +1 |
| 3 | Hören & Tippen | Tippen (else the stage-2 gate) | → 4 | → 2, back in 3–5 cards, lapses +1 |
| 4 | Anwenden | Zweiter Kontext (else the stage-3 gate) | → 5 | → 3, back in 3–5 cards, lapses +1 |
| 5 | Sicher | rotates Tippen, Hören, Zweiter Kontext, Präposition (every miss counts) | stays 5 | → 3, lapses +1 |

A miss on a non-gate exercise lowers the stage by at most one, and never below 1. A word with `start_stage > 0` enters at that stage and skips Karte. Hören is never a gate, because whether it can be shown depends on the device's voice. The gate depends only on the word's own columns, so a replay never depends on other words. Below stage 5, every third review of a word is a non-gate exercise for variety; it updates the memory model but does not promote.

**Memory model (FSRS-5).**
- Each word carries stability, difficulty and last review.
- Every graded event updates them with a rating inferred from behaviour:

  | Behaviour | Rating |
  | --- | --- |
  | Wrong, or *Weiß ich nicht* | Again |
  | Right, but with help (*Text zeigen* in Hören, Tippen near miss) or slower than the exercise's time threshold | Hard |
  | Right | Good |

  Easy is not inferred in v0.1.
- The next due time is the interval at which predicted recall falls to `config.retention` (0.9), capped at 120 days.
- `ms`, the exercise type and the chosen option are logged on every event, so thresholds and parameters can be re-fitted by replaying the log.

**Picking the next card**, in order:

1. A same-visit reinsertion whose turn has come (a Karte's first recall, or a missed item).
2. Due words, lowest predicted recall first.
3. A new word, if fewer than `new_per_day` were introduced today and the number of due words is below `backlog_pause`. The pause is silent; the UI never shows a backlog. New words follow the 2/3 core, 1/3 chunk mix.
4. Nothing due: the word with the lowest predicted recall. The memory model handles early reviews, since stability grows little when recall is still high.
5. Practice never runs out. When the rules below cannot all hold, they are relaxed in this order, least harmful first: a new word beyond today's pace (never during a backlog pause), a third Karte in a row, a word from the last three cards (never the very last one), and finally a resting word.

Pending suggestions appear only as a `VORSCHLAG` Karte, at most once every five cards, and are not scheduled further until kept.

**Constraints on the sequence:**

- No same word within 3 cards.
- No same exercise type 3 times in a row.
- An item missed twice in one visit rests until the next open.
- After 2 misses in a row, the next card is a stage-4 or stage-5 word.
- *Dein Weg* may appear between cards when there is a new true claim: at most once per visit, never in the first five cards.

**Evidence for *Dein Weg*** is computed from the log by pure functions with fixture-log tests. The claim rules are in STATION.md. No claim is ever made that the log does not support.

## App screens and behaviour

The app has no home screen: opening it shows the first exercise. Everything else is one tap away in a small menu and never in the way. Layouts, tokens, motion and strings: [design/STATION.md](design/STATION.md).

| Screen | How you get there | What it does |
| --- | --- | --- |
| First run | Only once | Two choices: *Demo ausprobieren* (bundled deck, no setup) or *Eigenes Sheet verbinden* (paste the web app URL + token, test the connection, download content). Then the first card |
| Üben | Default on every open | One card at a time. The domain label sits top left, the speaker and menu top right; nothing else. Demo mode shows a quiet `DEMO` label |
| Dein Weg | Between cards when there is something true to show; in the menu once a claim exists | Before/after pairs and a fully known sentence from the log. No scores, no counts |
| Wörter | Menu | Browse and search all words; see a word's columns and generated exercises; edit; *Pausieren*. Rows new from the Sheet are labelled `NEU` until first seen |
| Hinzufügen | Menu | One text field (16 px font), domain chips, *Speichern*. Hidden in demo mode |
| Vorschläge | Menu | Agent-proposed words: *Behalten* / *Nicht für mich*. They also appear in practice as a `VORSCHLAG` Karte |
| Einstellungen | Menu | Theme, sound, vibration, data source, demo. No goals |

**Behaviour requirements:**

- **Offline first.** Render from IndexedDB before any network call, first card in < 2 s on cold open. Sync runs in the background and updates silently.
- **Sync.** Events queue locally; flush on every 10 events, on `visibilitychange → hidden`, and on open. Show a tiny dot only when unsynced events are older than 24 h.
- **Audio.** Web Speech API, `de-DE`. Load voices via `voiceschanged` with a timeout fallback. Speak only inside tap handlers. If no German voice exists, hide the speaker and skip Hören.
- **Answering.** A right answer flies into the blank; a wrong one dims (dashed outline, `GEWÄHLT`) while the right one turns green, with *Das sehen wir bald wieder.* No red, no sound. The card then waits for *Weiter* or a swipe up. Every animation is interruptible.
- **Haptics.** Vibration API where available, feature-detected, switchable off.
- **Usage log.** `open` event on `visibilitychange → visible`, `close` on hidden, with cards seen in between.
- **Mobile-native basics.** `100dvh`, safe-area insets, no tap highlight, `touch-action: manipulation`, 16 px inputs, hover styles only under `(hover: hover)`, `theme-color` per scheme, `prefers-reduced-motion` → fades only.
- **Look.** Station (STATION.md): warm paper, dark boards, amber for what you retrieve, Overpass type, self-hosted fonts and inline icons. Light and dark theme. No mascots, coins, emoji decoration, confetti, streak flames, red. Use the installed skills `frontend-design`, `emil-design-eng`, `mobile-native`, `animate` and `apple-design` for UI work.

## Agent integration: the Sheet is the boundary

AI agents write content straight into the learner's Google Sheet, using the Google connectors of existing ChatGPT or Claude subscriptions. No OpenAI or Anthropic API key, no per-token billing, no agent endpoint. The PWA and Apps Script only read Sheet state and never know whether a row came from ChatGPT, Claude or the learner.

```
Scheduled ChatGPT / Claude task  →  Google Sheet (inbox tab)  →  normalizer  →  words + prompts  →  PWA
```

**Agents append to one flat `inbox` tab, not to `words` and `prompts` directly.** An LLM writing through a connector reliably appends a row of plain columns; it is unreliable at minting linked IDs across two tabs and computing dedupe keys. So the agent writes one row per word, and an Apps Script **normalizer** turns valid rows into a pending word plus its prompts. If Phase 0 shows agents write the two linked tabs cleanly, the normalizer still stays as the guard.

**`inbox` columns, v2 (agent fills these):** `de`, `article`, `plural`, `en`, `pos`, `tier`, `domain`, `family`, `example_de`, `example_en`, `example_form`, `example_2_de`, `example_2_en`, `example_2_form`, `collocation`, `prep`, `note`, `wrong_1`, `wrong_2`, `image_key`, `capture_id`, `start_stage` (seed only), `source`, `run_id`. **Importer fills:** `status`, `reason`, `word_id`. The v1 header (`cloze_1`, `answer_1`, `hint_1`, `cloze_2`, `answer_2`, `listen_de`, `listen_en` in place of the example columns) stays accepted; its values map onto the record through the compat layer (D38, D39). The exact column order, `docs/sheet-readme.md` and `agents/contract.md` are updated in Phase B together with the validator.

**The Sheet documents itself.** A `README` tab holds the inbox schema, validation rules, two example rows, the domain list, the target level (A2–B1), the tier mix, and the learner's own contexts. The generic part of that text is in the repo (`docs/sheet-readme.md`); the learner's contexts are written only into the private Sheet. The scheduled prompt stays short: open the Sheet by its ID, read `README`, follow it. Changing the rules means editing `README`, not every scheduled task.

**Normalizer (Apps Script, hourly trigger, also run at the start of every `bootstrap`):**

- For each `inbox` row with empty `status`: validate, compute `dedupe_key`, check against all `words`.
- Valid new word → `words` row (`status=pending`, or `active` when `capture_id` is set or `source=seed`, since the learner supplied those words) + 1–4 `prompts` rows.
- `de` matching an existing active word → its clozes are added as extra prompts to that word (how agents reinforce weak words).
- Duplicate or invalid → `status` + `reason` on the inbox row; nothing else written.
- `capture_id` set → that capture is marked `processed`, so agents never update `captures` themselves.
- Validation rules (v2): required `de`, `en`, `pos`, `domain`, and for agent rows `example_de` + `example_en`; `article` only for nouns, only der/die/das; `tier` empty, core or chunk; each example ≤ 14 words and contains its form (`example_form`, or `de` when empty) exactly; a second example needs both its German and English; `prep` from the closed preposition list; `image_key` from the bundled allow-list; `start_stage` only on the seed path. Plus the content checks of the security core (no formulas, URLs, markup, invisible characters, instruction-like text). v1 rows keep the v1 cloze rules.

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

Each phase ends with something checkable. Claude Code stops after each phase, reports (what was built, how each "Done when" was checked, what needs the product owner, open questions) and waits for the product owner's go.

**Stack:** Vite + TypeScript + Preact (small bundle for fast open), plain CSS transitions and the Web Animations API (no animation library), IndexedDB via `idb`, Vitest for the engine, `clasp` to keep the Apps Script code in the repo. Repo layout: `app/`, `core/`, `apps-script/`, `agents/`, `tools/`, `docs/SPEC.md` (this doc), `CLAUDE.md`.

### Current plan: Station phases A–F (from 2026-10-07, D36)

These replace the MVP2 slices (D35). Phases 0–7 below are kept as the project's history; Phase 0 and the security gate are done.

- **A. Docs and proposals.** CLAUDE.md, this spec, [design/STATION.md](design/STATION.md), DECISIONS D36–D47; one batch of questions to the owner. *Done when:* docs agree with each other and with the brief; privacy audit clean.
- **B. Data layer and generators.** Schema, validator, importer and compat updates for the new columns (with `sheet-readme.md` and `agents/contract.md`); `exercisesFor` and distractors; scheduler (event log, ladder, FSRS-5); `DataAdapter` with `demo` and `local`; `tools/seed-check.ts` and the gitignored `data/seed/seed-50.csv`. *Done when:* Vitest covers every exercise row (including missing columns), the distractor rules, every ladder transition and replay determinism; the seed passes `seed-check`; coverage in the stop report.
- **C. Station UI, practice.** Tokens, components, all exercises, motion, swipe, haptics, reduced motion, self-hosted fonts, icons, `NOTICE.md`; runs on `local` (seed) and `demo`. *Done when:* each exercise is understandable from its layout alone (method stated); keyboard and screen-reader basics work; Lighthouse PWA/performance numbers reported; a real Android Chrome checklist handed to the owner (cold open < 2 s, swipe feel, haptics, TTS voice, safe areas, install).
- **D. Dein Weg, Wörter, Hinzufügen, Vorschläge, Einstellungen.** *Done when:* Dein Weg shows only claims the log supports (fixture-log tests, including "nothing to show"); a row added to the local source produces its exercises without a code change.
- **E. Sheet adapter and sync.** The `sheet` adapter on the D31 API, the Apps Script web app, and the setup guide for both modes (D45). Built and tested against fakes. *Done when:* sync is idempotent, offline-safe and tested with fakes; nothing connects to a real Sheet without the owner's explicit go.
- **F. Real data.** The owner's hardened Core: owner steps, isolation tests I-1..I-6 pass, then the starter seed and the owner's Anki words go through the importer into Core with the owner's go; verified on the phone.

### History: phases 0–7 (original plan)

Build backend before UI, and prove the three risky parts on the test phone before anything else.

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
| Answer mode | Taps, and typing from stage 3 (Tippen); grades inferred from behaviour, no self-grading (D40, D42) | Objective signals are honest and free; typing proves recall at later stages |
| Other SRS decks during the test | Paused for 4 weeks | Two review queues split the habit and spoil the test |
| Images in v0.1 | Optional bundled pictogram via `image_key` (Lucide set), none required; `image_url` unused (D44) | Hosted images are fragile; a picture only where it clearly helps a concrete noun |
| App access to Core | Decided (D45): D31 web app + per-copy token in both modes; hardened (vault) mode optional, used for the owner's data | A token on the phone is a shared secret; the vault keeps AI identities away from Core |
| Domains | arbeit, uni, amt, alltag, smalltalk (everyday situations; decided) | Drives progress page and agent targeting |
| Scheduler: ChatGPT, Claude, or both | Whichever passes the Phase 0 checklist; both if both pass | Decides the weekly task and whether any fallback is built |

**Risks to watch:**

- **Scheduled agents may not reach the Sheet unattended.** Connector access in scheduled runs is unverified for both ChatGPT and Claude, and vendors change it without notice. Phase 0 settles it; fallback D (paste CSV rows into `inbox`) always works.
- **Agents editing outside `inbox`.** A connector usually has write access to the whole Sheet. Mitigated by `README` rules, warning-only protections on the core tabs, and the normalizer being the only automated writer of `words` and `prompts`. Google's version history recovers a bad run.
- **Wrong German from agents.** Review in *Vorschläge* catches invented words. Enriched captures and extra prompts for existing words go live without review, so their sentences can still contain errors; the learner fixes those in the Sheet.
- **Subscription limits.** Scheduled tasks count against subscription usage; one weekly run should be small, but the limits are the vendors' and can change.
- **Apps Script latency.** Calls can take a second or more (estimate). Mitigated by rendering from the device cache and syncing in the background; never block a card on the network.
- **Open deployment + token.** "Anyone" access means `APP_TOKEN` is the only lock. Keep it out of the repo and URLs.
- **Public repo.** GitHub Pages on a free plan needs a public repo. Covered by the Privacy rule; audit every push.
- **Building instead of learning.** Phases 0–5 should fit in about two weeks of evenings (estimate). If Phase 3 slips past week 3, cut scope rather than extend.
