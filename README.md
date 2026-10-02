# Strecke

A German micro-practice app for A2–B1 learners. Open it and one practice card is on screen in under two seconds: no session to finish, no due count, no streaks. Answers are spoken aloud and self-graded. Words climb a five-step ladder from *recognise* to *use in a new situation*.

**Status:** Phase 0 (risk spike). The live page is a test harness for the three risky parts: agent access to a Google Sheet, Apps Script round-trip time from a phone, and German text-to-speech in an installed PWA.

## How it works

```
phone (PWA, IndexedDB)  ⇄  Apps Script web app  ⇄  your Google Sheet  ←  scheduled AI agent (inbox tab)
```

- **Offline-first PWA** (Vite, TypeScript, Preact) on GitHub Pages. Cards render from the device cache; the network runs only in the background.
- **Bring your own Sheet.** Each learner owns one private Google Sheet and one Apps Script deployment. No server, no accounts, no paid APIs.
- **Agents through the Sheet.** A weekly scheduled ChatGPT or Claude task, using the Google connectors of an ordinary subscription, appends new words to an `inbox` tab. An Apps Script normalizer validates and deduplicates them into a review queue.
- **Engine on the device.** The scheduler is a pure function of an append-only event log, so it can be swapped for FSRS later by replaying the log.

## Docs

- [Spec](docs/SPEC.md): scope, data model, API contract, learning engine, build phases
- [Decisions](docs/DECISIONS.md): what was decided and why
- [CLAUDE.md](CLAUDE.md): working rules for the coding agent

Built with Claude Code; product, spec and decisions owned by a human product owner.
