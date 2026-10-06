# Strecke

A German practice app for A2–B1 learners, made for idle minutes. Open it and you are already scrolling through short German encounters: no session to finish, no due count, no streaks. Each item resolves with one silent tap. Words climb a ladder from *recognise* to *use in a new situation*.

**Status:** MVP2, slice 1 of 4. The live page is the new interface, the *Heft*, running on a bundled sample deck ([design](docs/design/HEFT.md)). Next: connect the learner's own Google Sheet ([decisions D31–D35](docs/DECISIONS.md)).

## How it works

```
scheduled AI agent ──append──► Inbox sheet ──validator + importer──► Core sheet ◄──OAuth──► phone (PWA, IndexedDB)
   (everyday Google account)   (untrusted)       (deterministic code)   (vault account, no AI access)
```

*AI proposes. Deterministic code validates. Core is authoritative.* (Proposed production design, see [architecture](docs/ARCHITECTURE.md).)

- **Offline-first PWA** (Vite, TypeScript, Preact) on GitHub Pages. Cards render from the device cache; the network runs only in the background.
- **Bring your own Sheet.** Each learner owns one private Google Sheet and one Apps Script deployment. No server, no accounts, no paid APIs.
- **Agents through the Sheet.** A weekly scheduled ChatGPT or Claude task, using the Google connectors of an ordinary subscription, appends new words to an `inbox` tab. An Apps Script normalizer validates and deduplicates them into a review queue.
- **Engine on the device.** The scheduler is a pure function of an append-only event log, so it can be swapped for FSRS later by replaying the log.

## Docs

- [Spec](docs/SPEC.md): scope, data model, API contract, learning engine, build phases
- [Decisions](docs/DECISIONS.md): what was decided and why
- [Architecture](docs/ARCHITECTURE.md): components, data flows, trust boundaries
- [Security](docs/security/): threat model, security architecture, gate report
- [CLAUDE.md](CLAUDE.md): working rules for the coding agent

Built with Claude Code; product, spec and decisions owned by a human product owner.
