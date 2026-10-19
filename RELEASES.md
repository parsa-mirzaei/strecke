# Releases (Next channel)

How a new version of **Strecke Next** goes live, how it is taken back, and why neither can lose a learner's progress.

| Channel | URL | Built from | Deployed by |
| --- | --- | --- | --- |
| Stable | `https://<owner>.github.io/strecke-preview/` | its own line | not by this tool |
| **Next** | `https://<owner>.github.io/strecke-next/` | branch `release-1` (was `round4-port`) | `tools/release.ts` |
| Old site | `https://<owner>.github.io/strecke/` | `main` | not by this tool |

The tool only ever writes to the `strecke-next` repository (built files only). It never touches Stable, the old site or `main`.

## Commands

Run from the repository root. **Every command is a dry run unless `--yes` is given.**

```bash
node tools/release.ts status
```
Clones the Next repository into a temporary folder and prints the live release (`release.json`) and its tags. Changes nothing.

```bash
node tools/release.ts deploy 0.2.0 --yes
```
1. Refuses unless the working tree is clean, `app/package.json` says `0.2.0`, and tag `v0.2.0` does not exist yet.
2. Gates: typecheck and unit tests (root and app).
3. Builds Next (`VITE_NS=next`, into `app/dist-next`) and fails if the shipped files exceed 300 KB compressed (D44).
4. Runs the privacy audit over the built files (`tools/privacy-audit.sh --dist`).
5. Clones the Next repository. If the live build has no tag (the build from before this tool), tags it `live-before-v0.2.0` so it stays reachable.
6. Replaces the files with the new build and writes `release.json` (`version`, `tag`, `source` commit, `builtAt`, `previous` = the tag that was live).
7. With `--yes`: tags the source commit `v0.2.0` in this checkout (not pushed), commits and tags `v0.2.0` in the Next repository, pushes its `main` and tags. Without `--yes`: prints the file changes and deletes the clone.

```bash
node tools/release.ts rollback --yes
node tools/release.ts rollback --to v0.2.0 --yes
```
Clones the Next repository, reads `previous` from the live `release.json` (or takes `--to`), checks out that tag's files exactly as they were published, and pushes them as **one new commit** ("Rollback to … (was …)"). No rebuild, no force-push, no history rewriting; the rolled-back release stays tagged, so rolling forward again is the same command with `--to`.

GitHub Pages serves the new files a few minutes after a push.

## What happens to learner data

Learner data never leaves the browser: answers, settings and the sheet copy are in IndexedDB (`strecke-next`), plus snapshots in `strecke-next-snapshots`. A deploy or rollback only replaces the app's files on GitHub Pages; nothing in it can read or delete a browser's data.

- **Updating.** A new build's service worker installs in the background and **waits**. The app applies it only when the learner taps *Update now* (end screen or Settings; never during a run, pending answers are saved first) or at the next app start, before the first card. A takeover the page did not ask for never reloads it.
- **Migrations.** If a new build changes the storage schema, it first copies the whole database into `strecke-next-snapshots` (the last two are kept; *Settings › Data › Snapshots*, restored through the same preview as a backup file). The migration itself runs in one transaction and keeps the old stores.
- **Rolling back to an older build.** The older build opens the same data. If the data was written by a newer schema than that build knows, the **version guard** stops it: the app shows "This data was written by a newer version. Update the app or restore a backup." with *Export backup*, and writes nothing. Rolling forward again opens the data normally.
- **Builds from before the guard (v0.1.0, `live-before-v0.2.0`).** They have no guard. v0.2.0 did not change the schema (still version 2; snapshots live in their own database), so rolling back to them is safe. A future release that raises the schema must say so here, because rolling back past it would make such a build fall back to an empty in-memory session (it still writes nothing to the stored data).
- **First switch to v0.2.0.** The v0.1.0 page has no update row; the new build waits until the app is closed completely (swiped away) and opened again.

## Release log

| Tag | Date | Source | Notes |
| --- | --- | --- | --- |
| `live-before-v0.2.0` | 2026-10-11 | `round4-port` `0982db4` | Round 4 port; first Next build, deployed by hand |
| `v0.2.0` | 2026-10-19 | `release-1` | Update safety, Fill my list, new words per day, first-run clarity |
