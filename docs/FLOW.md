# Flow: the product as graphs

Diagrams of the real code paths on `release-1` (v0.2.0). Each node names the function or file it stands for. Prose and rules: [SPEC.md](SPEC.md).

## a) Data flow

Content comes in read-only from the sheet; answers go only into IndexedDB. FSRS state is never stored: it is replayed from the event log each time a run is composed.

```mermaid
flowchart LR
  S[(Google Sheet<br/>Words tab)] -->|Publish to web| P[Published CSV link]
  P -->|"fetch, no credentials<br/>csvUrlSource()"| I["ingest()<br/>validate rows, identity"]
  I --> L[(IndexedDB meta<br/>sheet library)]
  L --> C["composeRun()<br/>due by FSRS + new words per day"]
  E[(IndexedDB events)] -->|"replay()"| C
  C --> X["exercise per card<br/>chooseByStats()"]
  X --> G["answer → LearnEvent<br/>ratingFor()"]
  G -->|"flush(): one transaction"| E
```

## b) One practice session

From a cold open to the end of a run (`app/src/main.tsx`, `App.tsx`, `run/Run.tsx`). The first card is built from the device only; the sheet sync runs alongside and its new words count from the next run.

```mermaid
flowchart TD
  O[Open app] --> U{"Update waiting?<br/>updateAtStart()"}
  U -->|yes| R[Reload into new build]
  U -->|no| V["openAppStore()<br/>version guard"]
  V --> F["openSource() + adapter.load()"]
  F --> C["startRun() → composeRun()"]
  F -.->|background, online, ≤ 1/min| Y["ctx.sync()"]
  C --> K[Card: answer or Karte rating]
  K --> N{Last card?}
  N -->|no, Next| K
  N -->|"yes, or Done"| M["Summary<br/>flush answers, persist()"]
  M --> W[New run / End / Don't count this run]
```

Hiding the app also flushes the pending answers; returning after more than the run gap (default 20 min) drops the unfinished run and starts a new one.

## c) Update and migration safety

What happens when a new build arrives (`app/src/state/update.ts`, `app/src/storage/store.ts`, `snapshot.ts`). The waiting worker never takes over by itself; the data check runs before anything is opened for writing.

```mermaid
flowchart TD
  B[New build deployed] --> W[Service worker installs and waits]
  W --> T{"Tap Update now<br/>or next app start"}
  T --> Q["peekVersion()"]
  Q --> G{"stored vs known<br/>schema version"}
  G -->|stored newer| X["NewerData screen<br/>Export backup, write nothing"]
  G -->|equal| O[Open normally]
  G -->|stored older| S["takeSnapshot()<br/>to ns-snapshots, keep 2"]
  S --> M["Migration in one<br/>upgrade transaction"]
  M --> O
  S -.-> RS["Settings › Data › Snapshots<br/>dry run, merge-only restore"]
```

The migration keeps the old `kv` store, so the pre-migration layout also survives inside the main database.

## d) Backup and restore

Backup is a file the learner keeps; restore only adds answers (`app/src/storage/backup.ts`, `StorageSection.tsx`).

```mermaid
flowchart TD
  A[Back up now] --> F["flush(), buildBackup()<br/>settings + events + channel"]
  F --> D{"Web Share can<br/>share files?"}
  D -->|yes| SH[Share .txt]
  D -->|no| DL[Download .txt]
  P[Pick a backup file] --> DR["dryRun()<br/>new / already there / skipped"]
  DR --> OK{Learner confirms}
  OK -->|yes| AP["append new answers<br/>settings only if chosen"]
  OK -->|no| NC[Nothing changes]
```

A snapshot from (c) is turned into the same file format (`dumpToBackupText()`) and goes through the same dry run.

## e) AI intake: "Fill my list"

The app only produces text; the assistant and the sheet are outside the app (`core/src/sheet/instructions.ts`, `FillMyList.tsx`). Whether a scheduled assistant can append rows without a human approving each write is unverified.

```mermaid
flowchart LR
  H[(Last-read header row<br/>or TEMPLATE_HEADERS)] --> B["buildInstructions()<br/>level, count, topic"]
  B --> C[Generate now: copy to clipboard]
  C --> L[Link to Claude / ChatGPT / Gemini home]
  L --> AI[Learner's own assistant]
  AI -->|"append rows, source = agent<br/>or CSV pasted by the learner"| S[(Google Sheet)]
  S -->|next sync| IN["ingest()"]
```

## f) Release flow (Next channel)

`tools/release.ts`; every command is a dry run unless `--yes` is given. It only writes to the `strecke-next` repository.

```mermaid
flowchart TD
  D["deploy X.Y.Z"] --> P{"Clean tree, version matches,<br/>tag is new?"}
  P -->|no| STOP[Refuse]
  P -->|yes| G["Gates: tsc + vitest<br/>root and app"]
  G --> BU["vite build VITE_NS=next<br/>≤ 300 KB, dist privacy audit"]
  BU --> CL["Clone strecke-next<br/>tag untagged live build"]
  CL --> RJ["Replace files<br/>release.json previous = live tag"]
  RJ --> Y{"--yes given?"}
  Y -->|no| DRY[Print changes, delete clone]
  Y -->|yes| PUB["Tag vX.Y.Z, commit,<br/>push main + tags"]
  RB["rollback [--to tag]"] --> CO["Check out that tag's files<br/>as one new commit"]
  CO --> Y
```

No force-push, no history rewrite: a rollback is a new commit and the rolled-back release keeps its tag. Learner data is not part of any of this; it stays in each browser.
