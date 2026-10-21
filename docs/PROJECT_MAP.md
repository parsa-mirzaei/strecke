# Project map

What exists where, what each piece is for, and what must not be touched. Inventory taken on 2026-10-21 from `git` (after `git fetch --all --prune`) and the GitHub CLI (read-only). No website or live app was opened. URLs use `<owner>` as in [README.md](../README.md).

## Repositories

| Repository | Visibility | Role | Last commit |
| --- | --- | --- | --- |
| `strecke` | public | Source code, docs, history. Its GitHub Pages site is the **old live site**, deployed by `.github/workflows/pages.yml` from `main` | `main` = `534b80a`, 2026-10-07 |
| `strecke-preview` | public | Built files of the **Stable** channel only | `a5fdb07`, 2026-10-09, "Preview build (round 3)" |
| `strecke-next` | public | Built files of the **Next** channel only, written by `tools/release.ts` | `34ccdcf`, 2026-10-19, "Strecke Next v0.2.0 from dbe4911" |

One remote in this checkout: `origin` → the `strecke` repository.

## Branches, tags and sites

Ahead/behind is counted against `release-1` (`dbe4911`). "Status" values: active, frozen, abandoned, cleanup candidate, unknown.

| Item | Kind | Last commit | vs `release-1` | Role | Status | Do-not-touch note |
| --- | --- | --- | --- | --- | --- | --- |
| `release-1` (local and `origin`) | branch | `dbe4911` 2026-10-19 | = | Current line; source of Next v0.2.0 | active | Base for new work |
| `docs-map` | branch | (this branch) | ahead by the doc commits | These four docs | active | – |
| `round4-port` (local and `origin`) | branch | `0982db4` 2026-10-11 | 8 behind, 0 ahead | Round 4 port; fully contained in `release-1`; source of the first Next build (`live-before-v0.2.0`) | frozen | Keep: it is the recorded source of a rollback target ([RELEASES.md](../RELEASES.md)) |
| `origin/main` | branch | `534b80a` 2026-10-07 | 29 behind, 0 ahead | Deploys the old live site; at this commit the app is the *Heft* prototype (Station replaced it only in `f55fb32`, after this commit) | frozen | **Never push.** Every push to `main` redeploys the old site |
| local `main` | branch | `ffa2ad4` 2026-10-09 | 15 behind, 0 ahead | Round 3 work, 15 commits ahead of `origin/main`, never pushed (R3-12) | frozen | Never push it to `origin/main` |
| `origin/round3-laptop-backup` | branch | `ffa2ad4` 2026-10-09 | 15 behind, 0 ahead | Backup of the Round 3 line; the commit Stable was built from (README) | frozen | Keep: Stable's recorded source |
| `origin/round3-local-backup` | branch | `534b80a` 2026-10-07 | 29 behind, 0 ahead | Same commit as `origin/main` | cleanup candidate (adds nothing over `origin/main`) | Do not delete without the owner's go |
| `origin/claude/vibrant-ritchie-90ojw4` | branch | `41aa889` 2026-10-11 | 29 behind, **7 ahead** | Round 4 cloud work (slices 1–6). Partly ported; features E and G only exist here (PORT_MAP) | frozen (reason for keeping: deferred feature E lives only here) | Do not delete; do not merge as a whole (PORT_MAP: "untouched") |
| `v0.2.0` | tag, local only | `dbe4911` | = | Source commit of Next v0.2.0 (not pushed, by design of the release tool) | active | Do not move |
| **STABLE** `https://<owner>.github.io/strecke-preview/` | site | repo `strecke-preview` `a5fdb07` | built from `ffa2ad4` | The app used daily; IndexedDB `strecke-preview` | active (frozen code) | See "Never do" |
| **NEXT** `https://<owner>.github.io/strecke-next/` | site | repo `strecke-next` `34ccdcf` | built from `dbe4911` (v0.2.0) | New features; IndexedDB `strecke-next` | active | Deploy and roll back only with `tools/release.ts` |
| Old site `https://<owner>.github.io/strecke/` | site | last Pages run on `534b80a`, 2026-10-07, success | – | *Heft* prototype | frozen; retiring it is an open owner decision (PORT_MAP, isolation) | Do not open on the phone (its service worker clears the other channels' caches) |

Unknown: none of the items above. Whether anyone still has the old site installed on a device is not knowable from the repository.

## Where things live

| Topic | File |
| --- | --- |
| What the product is, as built | [SPEC.md](SPEC.md) (the original v0.1 plan: [SPEC-v0.1.md](SPEC-v0.1.md)) |
| How it got here | [JOURNEY.md](JOURNEY.md) |
| Diagrams of the real code paths | [FLOW.md](FLOW.md) |
| Decisions D1–D51 (Phase 0 to Round 2) | [DECISIONS.md](DECISIONS.md) |
| Decisions R2-1 onward (Round 2, 3, 4 port, Release 1) | [design/DECISIONS.md](design/DECISIONS.md) |
| Sheet contract (columns, identity, tabs) | [SHEET_SCHEMA.md](SHEET_SCHEMA.md); code `core/src/sheet/` |
| Engine (eligibility, distractors, scheduling, grading) | [ENGINE.md](ENGINE.md); code `core/src/engine/`, `core/src/scheduler.ts`, `core/src/fsrs.ts`, `core/src/exercises.ts` |
| Round 4 port scope and result | [design/PORT_MAP.md](design/PORT_MAP.md) |
| Release tool and update safety | [../RELEASES.md](../RELEASES.md); code `tools/release.ts`, `app/src/storage/snapshot.ts`, `app/src/state/update.ts` |
| Channels and storage namespaces | [../README.md](../README.md#channels); code `app/src/ns.ts`, `app/vite.config.ts` |
| Research (Google sign-in, AI providers) | [research/](research/) |
| Security design (Apps Script path, not used by the app today) | [security/](security/), [ARCHITECTURE.md](ARCHITECTURE.md) |
| Privacy audit | `tools/privacy-audit.sh` |

## Never do

- Push `main` (or anything to `origin/main`): it redeploys the old site.
- Delete or force-push any remote branch or tag; delete anything in `strecke-preview` or `strecke-next`.
- Open the old site (`/strecke/`) in the phone's Chrome: its service worker deletes the Stable and Next offline caches (data is safe; Stable then has no offline shell until opened online) (PORT_MAP, isolation).
- Change STABLE's repository, URL, manifest (`id`, name), service worker or storage namespace (`strecke-preview`): the installed app would lose its data or its identity. Stable is not redeployed from newer work without the owner's go (README).
- Deploy Next by hand: use `node tools/release.ts` (dry run unless `--yes`).
- Commit real words, sheet links or IDs, backups, screenshots of real data, or anything personal (CLAUDE.md "Privacy"; run `bash tools/privacy-audit.sh`).
