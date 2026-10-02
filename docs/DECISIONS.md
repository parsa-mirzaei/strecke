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
