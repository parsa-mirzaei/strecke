# Phase 1 proposal: architecture and build plan

Status: **proposal, nothing built.** Based on [the Phase 0 report](phase0/REPORT.md). Items marked **[ASK]** change the spec and need the product owner's decision.

Phase 1 asks one question: **will the learner open this app in small idle moments?** Everything below serves that question or keeps it safe and cheap. AI enrichment comes last.

## 1. Product scope for Phase 1

**Start with 20–40 real items** (from the learner's Anki export, through the same validator agents will use).

**Three card types, not five [ASK]:**

| Card | What happens | Why it is in |
| --- | --- | --- |
| **Meet** | Word with article, short English, one sentence, speaker. *Neu für mich* / *Kenne ich schon* | Entry point; one tap |
| **Listen** | Sentence plays, no text. Tap to reveal text and meaning. *Hatte ich* / *Nicht ganz* | Easiest retrieval, good on a bus, uses TTS |
| **Recall** | Cloze with English hint; say it aloud; reveal; self-grade. Later the second cloze, without hint, in a new situation | Speaking is the bottleneck the product exists for |

These three components cover the whole ladder:

| Stage | Card |
| --- | --- |
| 0 | Meet |
| 1 | Listen |
| 2 | Recall with hint (`cloze_1`) |
| 3 | Recall without hint (`cloze_2`) |
| 4 | Rotation of Listen and Recall |

Intervals and misses work as in the spec. Multiple choice, article taps, scenarios, images and speed rounds wait until engagement is proven.

**Feed rules:**
- No home screen: the first card renders from the device cache in under 2 s.
- No due count, no session end.
- One quiet line every 8 cards ("Diese Woche: 14 Sätze selbst gesagt."), with *Weiter* / *Fertig*.
- Calm notebook look, light and dark; card-to-card under 200 ms.

**Not in Phase 1:**
- Progress page (the checkpoint line stands in).
- Demo mode (portfolio work, after the test).
- Pending screen (replaced by suggestion cards, see 2.4).

## 2. Production data architecture

### 2.1 Keep Google Sheets as the source of truth?

**Yes, for the MVP, but split it in two.**
- **For:** free, human-editable (fix a typo in the browser), version history, already proven with the agent.
- **Against:** a connector can reach every spreadsheet of the Google account it signs in with, and Sheet protections don't stop it (Phase 0, tests 13 and 22).

The fix is to change *which account* the agent uses, not to write stronger prompts.

```
                 learner's Google account                         agent's Google account
  ┌───────────────────────────────────────────────┐        (Claude's Sheets connector signs in here)
  │ Strecke Core (private, never shared)          │                       │
  │   words · prompts · events · word_state       │                       │ can only open what is
  │   captures · config · inbox_log · audit       │                       │ shared with it
  │                                               │                       ▼
  │ Strecke Inbox (owned by learner, shared ──────┼──── Editor ──► contract · status · keys
  │   with the agent account as Editor)           │                 captures_open · inbox
  └───────────────────────────────────────────────┘
           ▲  read/write via Sheets API (OAuth, learner signs in once)
           │
     PWA on the phone (IndexedDB cache, validator, engine)
```

### 2.2 Phone ↔ data: no public endpoint [ASK]

| Option | How | Verdict |
| --- | --- | --- |
| **P1 Direct OAuth (recommended)** | The PWA signs the learner in with Google Identity Services (scope `drive.file`: only files the app created or the learner picked) and calls the Sheets API directly. Needs a free Google Cloud OAuth client (testing mode, learner as test user) | No public endpoint, no shared secret, no server. Token lasts 1 h; renewal needs the learner's Google session. Offline-first hides gaps. **Needs a spike on the phone first** (standalone PWA sign-in) |
| P2 Hardened Apps Script | "Anyone" web app gated by a 128-bit `APP_TOKEN`; fixed action list, schema checks, size caps, rate limit, append-only writes, `@OnlyCurrentDoc` | Works, but stays a public endpoint whose only lock is a token on the phone. Fallback if P1 fails |

**The Phase 0 web app gets archived either way** (Deploy → Manage deployments → Archive).

Apps Script stays only as a script bound to Core with a **time trigger, no web app**: a daily snapshot of Core into a backups folder, keeping 14 copies.

### 2.3 What the agent may do

| | Rule | Enforced by |
| --- | --- | --- |
| **Read** | `contract`, `status`, `keys`, `captures_open`, `inbox` (column A) of the Inbox spreadsheet | Google sharing: the agent account sees nothing else |
| **Write** | One `append_values` call to `inbox`, at most 20 rows | Tool allow-list on the routine (`get_values`, `append_values`). Phase 0 saw a `permitted_tools` field; verify in step 1 |
| **Never** | Core, Drive, the repo, notifications, skills | No Core access (ACL); Drive connector not attached; notifications/skills disabled in routine config (Phase 0 showed the `allowed_tools` setting did not block notifications, so this needs a deny list; verify) |

**Worst case:** a broken run clears the Inbox spreadsheet. Core is untouched. Already imported rows sit in Core `inbox_log`; pending ones come back from version history.

**Cheaper alternative [ASK]:** same Google account, separate Inbox spreadsheet, tool allow-list only. Simpler, but if the allow-list fails, the agent can reach Core again. I recommend the separate agent account. It is a free Google account; the catch is that Claude's Google Sheets connector then signs in as that account for every Claude project.

### 2.4 Validation, dedupe, audit, recovery

- **Deterministic validator** (TypeScript, Vitest, runs in the PWA on open):
  - Reads `inbox` rows past the last imported row.
  - Checks the schema: required fields, enums, one `___` per cloze, ≤14 words, answer present, reserved columns empty.
  - Writes `status` and `reason` back to each inbox row and copies the raw row to Core `inbox_log`.
- **Dedupe key, authoritative:**
  - Unicode-normalise, lower-case, collapse whitespace.
  - Strip a leading article **only when `pos=noun`**; drop trailing `.!?` for chunks; ignore a leading `sich ` on verbs.
  - Checked against every Core word (any status) and every row ever in `inbox_log`.
  - Phase 0 fixtures (44 rows, the *Das klingt gut.* case, the CSV duplicate) become unit tests.
- **Into the corpus:**
  - Valid agent items become `pending` words.
  - Instead of a separate Pending screen, they appear in the feed as a Meet card labelled *Vorschlag*, with a third quiet button, *Nicht für mich* (= reject). **[ASK]**
  - Captures and seed items enter as `active`.
- **Audit:**
  - `events` is append-only (reviews, approve, reject, edit, import).
  - Inbox rows are never deleted; they keep `run_id` and the import status.
  - Core keeps `updated_at` plus edit events.
- **Recovery:** daily Core snapshot (14 days), Google version history, and the full IndexedDB copy on the phone.

### 2.5 Agent context contract

The only thing a routine reads besides data. It lives in `contract!A1:A30` of the Inbox spreadsheet, about 1.5 KB versus Phase 0's 6.4 KB README. The routine prompt is one line: *"Open spreadsheet `<INBOX_ID>`, read contract!A1:A30, follow it."*

```
STRECKE AGENT CONTRACT v1 — you propose; code validates; the learner decides.
READ ONLY: contract!A1:A30, status!A1:B6, keys!A2:A, inbox!A2:A, captures_open!A2:D (only if status!B3 > 0).
WRITE ONLY: one append_values call to inbox!A1, at most 20 rows. No other writes, tools, skills or notifications.
STOP EARLY: if status!B2 (pending) >= 20 and status!B3 (open captures) = 0, reply "RESULT skipped" and end.
ORDER: open captures first (copy capture_id). Then new items: about 2/3 core, 1/3 chunk, favour domains in status!B5.
ITEMS: common A2–B1 German for everyday life. No specialist or job jargon, no rare words, no filler.
  core = noun (with der/die/das), verb or adjective. chunk = a whole spoken phrase, pos = phrase.
DOMAINS: arbeit, uni, amt, alltag, smalltalk.
LEARNER: {{3 short context lines, private}}
COLUMNS: de, article, en, pos, tier, domain, cloze_1, answer_1, hint_1, cloze_2, answer_2,
  listen_de, listen_en, wrong_1, wrong_2, capture_id, source, run_id
CLOZE: exactly one ___, at most 14 words, the answer fills the gap exactly;
  cloze_2 in a different everyday situation; listen_de a full sentence, at most 14 words.
DEDUPE: skip if your key matches keys or inbox (lower-case, spaces collapsed, der/die/das removed only for nouns).
run_id: claude-<fire time YYYYMMDD-HHMM UTC>. source: claude.
REPLY: RESULT written=<n> skipped=<n>
```

The app maintains `status` and `keys` on every sync, so the agent never reads Core or computes counts itself.

## 3. Automation options

| Option | User friction | Model usage | Reliability | Product value | Complexity |
| --- | --- | --- | --- | --- | --- |
| A. Daily batch | None | Highest; most runs find nothing to do, but each still starts a full session | High (Phase 0: on time ±1 min) | Low: the learner meets about 5 new items a day, so 20 a day piles up | Low |
| B. Few times a week | None | Medium; some empty runs | High | Medium | Low |
| C. Manual trigger at 10–20 captures | One tap in claude.ai routines ("Run now") | Lowest | High, but depends on remembering | High for captures; nothing happens when the learner forgets | Low |
| **D. Hybrid: weekly run with early-stop guard + manual Run now** | None (optional tap) | Low: one run a week; a "nothing to do" run reads only `contract` + `status` and stops | High | High: captures enriched within a week, backlog topped up only when low | Low (guard is two contract lines + two status cells) |

**Recommendation: D.** The guard keeps the weekly run near-free when nothing is needed. Phase 0 showed fixed start-up cost dominates small runs, so a 20-item batch per week (or on demand) is the right unit. Never run in reaction to every capture.

## 4. Phase 1 build plan

Each step ends with something the product owner can check. **The usage test can start after step 6**: 20–40 items last 1–2 weeks at 5 new a day, and steps 7–8 can land during that time.

| # | Step | Purpose | User-visible result | Technical result | Acceptance |
| --- | --- | --- | --- | --- | --- |
| 0 | Clean up the spike | Remove the public exposure | — | Phase 0 web app archived; Phase 0 routines deleted (claude.ai UI); test Sheet kept read-only as evidence | The spike URL returns an error; no enabled routines |
| 1 | Secure data foundation + auth spike | Prove least privilege before building on it | Learner signs in once on the phone | Core + Inbox spreadsheets created by a bound setup script; agent account with Editor on Inbox only; OAuth client; PWA reads one Core cell in standalone mode | (a) phone reads/writes Core via OAuth in the installed PWA, offline gap recovers; (b) **negative test:** agent routine cannot open Core; (c) **negative test:** routine with tool allow-list cannot clear a range. Any FAIL → fall back to P2 / same-account variant, recorded in DECISIONS |
| 2 | Deterministic validator | AI proposes, code decides | — | TS validator + dedupe module, Vitest | Phase 0 fixtures: 44/44 valid, CSV duplicate caught, *Das klingt gut.* kept intact; malformed rows rejected with readable reasons |
| 3 | Real seed, 20–40 items | Personal relevance from day 1 | Learner checks a sample table of the German | Script turns Anki rows into inbox rows (start stage 1/2 per D19), imported through the validator into Core | ≥20 active items, each with 2 clozes + listen sentence; learner OK on the sample |
| 4 | First real feed | Test the core feeling | App opens straight into a card; Meet, Listen and Recall work; checkpoint line every 8 | Preact feed, three card components, transitions, light/dark | Cold open to first card < 2 s on the phone (measured); no home, no counts; learner says "calm, not a game" |
| 5 | TTS + offline | Usable on a train | Speaker on every card; works in airplane mode | Service worker, IndexedDB cache, voice loading with fallback | Airplane mode: open, 10 cards, all audio plays (German voice named in the log) |
| 6 | State + progression | It remembers | Words climb the ladder; misses come back | Engine as pure functions over the event log (Vitest per ladder row); event queue synced to Core via OAuth | 30 offline reviews sync exactly once; Core `events` matches the device. **Usage test starts here** |
| 7 | Capture | Own words in | `+` → one field + domain chip → saved | Capture queue → Core `captures` → app publishes `captures_open` + `status` to Inbox | A capture appears in Inbox within one sync; works offline |
| 8 | AI batch enrichment | Top up without typing | Suggestions show up in the feed labelled *Vorschlag* | Agent contract in Inbox; weekly guarded routine (Sheets connector only, allow-list); validator import; `keys`/`status` maintained | Two unattended runs: rows imported or rejected with reasons; a run with nothing to do stops early; no write outside `inbox` (checked by diffing Core) |
| 9 | Real-life usage test (2 weeks) | Answer the Phase 1 question | Normal daily use | Usage log: opens, cards per open, seconds per open | Days used per week, opens per day; kill signal if used on fewer than 4 days in week 2 |

## 5. Decisions needed before building

1. **Separate Google account for the agent** (recommended) or same account with a tool allow-list only.
2. **Phone ↔ data:** direct OAuth (recommended, needs the step 1 spike) or a hardened Apps Script endpoint.
3. **Three card types** and the shortened ladder above.
4. **Suggestions in the feed** (*Vorschlag* card with *Nicht für mich*) instead of a Pending screen.
5. **Automation cadence D:** weekly guarded run plus manual Run now.
6. **Drop ChatGPT from v0.1** (untested; Claude passed).
7. **Seed size 20–40** for Phase 1 (spec said 80–100 before day 1).
8. **Phase renumbering:** this plan replaces SPEC phases 1–6. If approved, I update `docs/SPEC.md` and `DECISIONS.md` first, then start step 0.
