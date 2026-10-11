# Strecke

A German practice app for A2–B1 learners. Open it and the first exercise is already there: no session to finish, no due count, no streaks. Every word is a record in the learner's own Google Sheet, and the exercises (meaning, article, gap, preposition, listening, typing, a second situation) are generated from whatever columns the record has. A memory model decides in the background when each word comes back. Progress is shown only as evidence from the learner's own history.

**Status:** the daily build is the Stable channel (Round 3); the Next channel carries the Round 4 port (hardened storage and backup, English/German interface, the full sheet read side). The old live page still runs the earlier *Heft* prototype. Decisions: [docs/DECISIONS.md](docs/DECISIONS.md) (D1–D48) and [docs/design/DECISIONS.md](docs/design/DECISIONS.md) (round 2 onward).

## Channels

| Channel | URL | Built from | Storage on the phone |
| --- | --- | --- | --- |
| **Stable** (used daily) | https://<owner>.github.io/strecke-preview/ | Round 3 (`ffa2ad4`), repository `strecke-preview`; never redeployed from newer work without the owner's go | IndexedDB `strecke-preview`, localStorage `strecke-preview.*`, caches `strecke-preview-*` |
| **Next** (try new features) | https://<owner>.github.io/strecke-next/ | branch `round4-port`, repository `strecke-next`; installs as "Strecke Next" with an amber NEXT icon | IndexedDB `strecke-next`, localStorage `strecke-next:*`, caches `strecke-next-*` |
| Old live site | https://<owner>.github.io/strecke/ | `main`, by `.github/workflows/pages.yml` (push to `main` or manual run only) | IndexedDB/localStorage `strecke*`, caches `strecke-<hash>` |

Build Next: `VITE_NS=next npx vite build --outDir dist-next` in `app/`. Data moves from Stable to Next only through a backup file: *Export* in Stable, *Restore from backup* in Next (with a dry run).

## How it works today

The learner's Google Sheet is the content, the phone keeps the working state, the app is static files: three layers, no server ([architecture §0](docs/ARCHITECTURE.md#0-three-layers-what-the-app-runs-on-today-decisions-r4-1)). The app reads the sheet's published CSV links ([sheet contract](docs/SHEET_SCHEMA.md), [template](docs/template/README.md)) and never writes to it. Interface in English or German; learning content stays German.

## How it was designed to grow

```
scheduled AI agent ──append──► Inbox ──validator + importer──► Core sheet ◄──web app + token──► phone (PWA, IndexedDB)
                               (untrusted)  (deterministic code)
```

*AI proposes. Deterministic code validates. Core is authoritative.* Two deployment modes share the same code: **simple** (everything in the learner's one Google account) and **hardened** (Core in a separate account that no AI tool is ever connected to). See [architecture](docs/ARCHITECTURE.md) and [security §8](docs/security/ARCHITECTURE.md#8-deployment-modes-d45).

- **Offline-first PWA** (Vite, TypeScript, Preact) on GitHub Pages. Cards render from the device cache; the network runs only in the background.
- **Bring your own Sheet.** Each learner owns one private Google Sheet and one Apps Script deployment. No server, no accounts, no paid APIs.
- **Agents through the Sheet.** A weekly scheduled ChatGPT or Claude task, using the Google connectors of an ordinary subscription, appends new words to an `inbox` tab. An Apps Script normalizer validates and deduplicates them into a review queue.
- **Engine on the device.** A stage ladder picks the exercise and an FSRS-5 memory model picks the time, both as pure functions of an append-only event log, so the schedule replays exactly and can be re-tuned.

## Docs

- [Spec](docs/SPEC.md): scope, data model, API contract, learning engine, build phases
- [Design: Station](docs/design/STATION.md): principles, the amber rule, tokens, motion, screens
- [Decisions](docs/DECISIONS.md) and [round 2+ decisions](docs/design/DECISIONS.md): what was decided and why
- [Sheet contract](docs/SHEET_SCHEMA.md) and [template](docs/template/README.md)
- [Port map, Round 4](docs/design/PORT_MAP.md)
- [Research](docs/research/): Google sign-in, AI providers (unverified facts marked)
- [Architecture](docs/ARCHITECTURE.md): components, data flows, trust boundaries
- [Security](docs/security/): threat model, security architecture, gate report
- [CLAUDE.md](CLAUDE.md): working rules for the coding agent

Built with Claude Code; product, spec and decisions owned by a human product owner.
