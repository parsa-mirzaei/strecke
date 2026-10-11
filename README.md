# Strecke

A German practice app. Open it and the first exercise is already there: no session to finish, no due count, no streaks. Every word is a row in the learner's own Google Sheet, and the exercises (meaning, article, gap, preposition, listening, typing, a second situation) are generated from whatever columns the row has. A memory model decides in the background when each word comes back. The app is not tied to a level: the learner states their own.

**Status:** Round 4 is on a work branch and in the preview build. The live page on `main` still runs the earlier prototype. See [docs/DEPLOY.md](docs/DEPLOY.md) and [decisions D49–D58](docs/DECISIONS.md).

## How it works: three layers

```
 the learner's Google Sheet  ──"Publish to web" CSV (read only)──►  the app (static PWA)  ◄──►  this device
 content: words, Inbox, Meta                                         engine + UI              IndexedDB: answers,
   ▲                                                                                          FSRS state, settings,
   │ the learner, or the learner's OWN AI assistant (Fill my list)                           cached sheet; backups
```

- **The Sheet is the content layer.** The learner writes it by hand or lets their own AI assistant append rows. The app reads it and never writes it.
- **The device holds the working state.** The event log, memory model and settings live in IndexedDB and work offline. Backups go to a file.
- **The app is a static PWA** (Vite, TypeScript, Preact) on GitHub Pages: no server, no accounts, no API keys. **The app never calls an AI service and never connects to an AI account.**
- **The engine runs on the device.** A stage ladder picks the exercise and an FSRS-5 memory model picks the time, both as pure functions of the event log.

## Use it with your own sheet (open-source users)

1. **Make a sheet.** Any Google Sheet with a column named `word` works. A `meaning` column is needed for practice; every other column adds exercises. Or start from the [template](docs/template/README.md) (xlsx or per-tab CSV). An existing list can be migrated without breaking anything ([guide](docs/template/README.md#already-have-a-word-list-migrate-without-breaking-anything)).
2. **Publish only the words tab as CSV.** On a computer: File › Share › Publish to web › choose the words tab › Comma-separated values (.csv) › Publish. Anyone with that link can read that tab, so keep private notes out of it.
3. **Connect.** In the app: Settings › Data, paste the link, Connect. The app says how many rows it read and lists, neutrally, rows that need attention. It re-reads the sheet when you come back to it. If the link cannot be read from your browser, import the tab as a CSV file instead.
4. **Optional: Fill my list.** Settings › Fill my list writes instructions for *your own* AI assistant (Claude, ChatGPT or another) from your sheet's real columns: your level, how many words, how often, topics. *Generate now* copies them and opens the assistant. *Set up a schedule* explains how to run them regularly in your own account, and is honest about plan limits. New rows carry a small AI tag and can be skipped on the device.
5. **Back up.** Settings › Data › *Back up now* saves your answers to a file. *Restore from backup* only adds what is missing.

Column rules: [docs/SHEET_SCHEMA.md](docs/SHEET_SCHEMA.md).

## Development

```bash
npm ci && npm test && npm run typecheck                       # core engine, sheet contract, security core
cd app && npm ci && npm test && npm run typecheck && npm run build   # app (build:preview for the preview channel)
bash tools/privacy-audit.sh --all
node --experimental-strip-types tools/simulate.ts            # engine simulator (synthetic learner)
```

Browser checks (need Playwright with Chromium): `tools/app/layout-audit.mjs`, `tools/app/sheet-e2e.mjs`.

## Docs

- [Spec](docs/SPEC.md) and [Design: Station](docs/design/STATION.md): the original product and interface spec. Round 4 changes are in DECISIONS D49–D58.
- [Decisions](docs/DECISIONS.md): what was decided and why
- [Architecture](docs/ARCHITECTURE.md) · [Storage](docs/STORAGE.md) · [Sheet schema](docs/SHEET_SCHEMA.md) · [Engine notes](docs/ENGINE.md) · [Deploy](docs/DEPLOY.md)
- Research: [AI providers](docs/research/ai-providers.md) · [Google sign-in](docs/research/google-signin.md)
- [Security](docs/security/): threat model, security architecture, gate report (for the Apps Script path)
- [CLAUDE.md](CLAUDE.md): working rules for the coding agent

Built with Claude Code; product, spec and decisions owned by a human product owner.
