# Strecke

A German practice app for A2–B1 learners. Open it and the first exercise is already there: no session to finish, no due count, no streaks. Every word is a record in the learner's own Google Sheet, and the exercises (meaning, article, gap, preposition, listening, typing, a second situation) are generated from whatever columns the record has. A memory model decides in the background when each word comes back. Progress is shown only as evidence from the learner's own history.

**Status:** redesign in progress. The live page still runs the previous *Heft* prototype on a bundled sample deck. The new interface, *Station*, is specified in [docs/design/STATION.md](docs/design/STATION.md) and built in phases A–F ([decisions D36–D47](docs/DECISIONS.md)).

## How it works

```
scheduled AI agent ──append──► Inbox sheet ──validator + importer──► Core sheet ◄──OAuth──► phone (PWA, IndexedDB)
   (everyday Google account)   (untrusted)       (deterministic code)   (vault account, no AI access)
```

*AI proposes. Deterministic code validates. Core is authoritative.* (Proposed production design, see [architecture](docs/ARCHITECTURE.md).)

- **Offline-first PWA** (Vite, TypeScript, Preact) on GitHub Pages. Cards render from the device cache; the network runs only in the background.
- **Bring your own Sheet.** Each learner owns one private Google Sheet and one Apps Script deployment. No server, no accounts, no paid APIs.
- **Agents through the Sheet.** A weekly scheduled ChatGPT or Claude task, using the Google connectors of an ordinary subscription, appends new words to an `inbox` tab. An Apps Script normalizer validates and deduplicates them into a review queue.
- **Engine on the device.** A stage ladder picks the exercise and an FSRS-5 memory model picks the time, both as pure functions of an append-only event log, so the schedule replays exactly and can be re-tuned.

## Docs

- [Spec](docs/SPEC.md): scope, data model, API contract, learning engine, build phases
- [Design: Station](docs/design/STATION.md): principles, the amber rule, tokens, motion, screens
- [Decisions](docs/DECISIONS.md): what was decided and why
- [Architecture](docs/ARCHITECTURE.md): components, data flows, trust boundaries
- [Security](docs/security/): threat model, security architecture, gate report
- [CLAUDE.md](CLAUDE.md): working rules for the coding agent

Built with Claude Code; product, spec and decisions owned by a human product owner.
