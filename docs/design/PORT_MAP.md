# Port map: Round 4 (cloud) into the Round 2–3 line

Source: `origin/claude/vibrant-ritchie-90ojw4` (7 commits on `534b80a`). Target: branch `round4-port`, from local `main` at `ffa2ad4`. Scope set by the owner: port **A, B, C, F**; **D and E deferred**; **G skipped**. Round 4 code that is not ported stays on its branch, untouched.

## Per feature

| | Round 4 feature | In this line before the port | Decision |
| --- | --- | --- | --- |
| A | **Storage hardening**: IndexedDB store with versioned migrations, one transaction per write, quarantine, memory fallback, one-time migration, `persist()`, growth estimate, backup by Web Share (`.txt`) with a download fallback, merge-only restore with a dry run, one backup hint | All learner data is already in IndexedDB, but as whole blobs in one key-value store: no schema versions, the whole event log is rewritten on every answer, no quarantine. Export/import exist (JSON download; import merges without a preview). No `persist()`, no hint. | **Adapt.** Port the `idb.ts` wrapper and the store design (events store keyed per record, quarantine, memory fallback). Re-implement the migration for *this* line's layout (the blob keys of the demo and sheet adapters), losslessly, keeping the old store as a snapshot. Run writes become one transaction at the end of a run, plus *Don't count this run*. Backup and restore are rebuilt on this line's backup envelope (one format). |
| B | **Language**: en/de string table, test that fails on literal UI text, language switch, rating labels, data-source label | German-only UI, strings in components. | **Port the mechanism** (`t()`, the compiler-based test), **re-write the tables** for this line's screens and strings. Rating labels as specified. Source label on the end screen, the summary and in Settings › Data. |
| C | **Sheet read side**: `word`-only contract, optional `source/added/verified/level/id`, Inbox and Meta tabs, aliases, identity, neutral row notes, `schema_version`, CSV-file fallback, re-sync on return, per-tab links, template and guides | Round 3 contract (published CSV link, aliases, per-row notes, identity with typo rule, archive on delete, CSV-file import only when already connected). | **Merge into the existing contract** (one module, `core/src/sheet/`). Add the new columns, the Inbox/Meta tabs (each by its own published link, i.e. its own `gid`), the schema message, file import without a link, re-sync on return with "N new words", notes as codes rendered by the string table. Port the template generator and the guides, adapted to this line's column limits. |
| D | **Fill my list** (instructions for the learner's own AI) | – | **Deferred.** Code stays on the Round 4 branch (`core/src/sheet/instructions.ts`, `app/src/ui/settings/FillMyList.tsx`). |
| E | **Exercise quality**: same inflectional slot for distractors, stand-in gate (`gate: true`), Round 4 simulator report | This line has its own distractor guard (capitalisation, light verbs, utterance chunks) and its own simulator. | **Deferred.** Nothing ported; no `gate` field. |
| F | **Research docs**: `research/google-signin.md`, `research/ai-providers.md`, `DEPLOY.md` | – | **Port** the two research notes with sources. `DEPLOY.md` is rewritten for the channels that now exist (its Round 4 content assumed no preview URL). |
| G | Station practice screen, Overpass fonts, Round 4 simulator and engine docs, CI preview-artifact workflow | This line has its own practice screens, Barlow, its own simulator and ENGINE.md; it deploys channels from separate repositories. | **Skip.** The `preview.yml` workflow adds nothing this line needs (Next is published from its own repository). |

## One definition where the lines differ

| Topic | Round 4 | This line | Kept |
| --- | --- | --- | --- |
| Karte rating on the event | `rating` on the `seen` event | `rating` on a `review` event of exercise `karte` (`payload.rating` in the sheet row) | **This line.** Real logs on the Stable install use it. |
| Stand-in gate | `gate: true` on events | none | **None** (feature E deferred). |
| Row identity | `id`, else lemma without article | word id column, else normalised word + article (+ meaning for homonyms), typo rule | **This line**, so existing progress keeps its word ids. Round 4's insight is added as one more matching rule: an article filled in later keeps the word. A free-text `id` column is accepted (hashed into a word id). |
| Header aliases | `WORDS_ALIASES` (canonical `word`, `meaning`, `example` …) | `ALIASES` (canonical `de`, `en`, `example_de` …) | **This line's module**, extended with every Round 4 alias that does not clash; Round 4's canonical names are what the template writes. |
| Row notes | localised strings in core | German strings in core | **Codes in core** (`{ code, column, value }`), rendered by the string table ("Row 12 · Schrank: article missing"). |
| Sheet schema version | `SCHEMA_VERSION = 1`, Meta tab | none | **Round 4's** `schema_version` in Meta; contract version 1 = this document set. |
| Backup file | Round 4 envelope (events, kv, legacy) | `{ app: 'strecke', kind: 'backup', version: 1, settings, events }` (events as sheet rows) | **This line's envelope**, version 1, with optional fields added (`library`, `channel`). Stable's existing export is readable by Next. |
| IndexedDB schema | v1: `events`, `kv`, `quarantine`, `legacy` | v1: one out-of-line `kv` store | **New v2** for this line: `events`, `meta`, `quarantine`; the v1 `kv` store stays untouched as the pre-migration snapshot. |
| Decision numbers | D49–D58 in `docs/DECISIONS.md` | `docs/design/DECISIONS.md` (canonical) | Folded in as **R4-1 … R4-10**. |
