# Round 2 design decisions

Decisions and deviations from the reference prototype ([reference/strecke-prototype-v2.html](reference/strecke-prototype-v2.html)) for the Phase C rework. Project-wide decisions stay in [../DECISIONS.md](../DECISIONS.md); this file is the design log for round 2. Format: what, why.

## Brief precedence
R2-1. **The round-2 brief overrides earlier docs where they conflict.** It reverses D42 (no self-grade buttons) for the Karte only, adds the Verlauf dashboard and optional goals, and replaces the three-style comparison (D50) with one palette. Why: the owner decided these after testing round 1. The older STATION.md look (warm paper, dark boards, Overpass) is superseded by the tokens below; its principles stand.

## Product
R2-2. **Run (Runde)**: about 6 cards (setting 3–12), boundary by inactivity gap, default 20 minutes (setting 5–120). Events carry a run id; events without one fall back to the gap. Why: the owner asked for a gap rule; the id keeps "Noch eine Runde" a separate run and the gap keeps abandoned runs honest.
R2-3. **Karte rating** is the learner's own four-step answer (*Nicht gewusst* / *Teilweise* / *Gewusst* / *Sofort*) mapped to FSRS 1–4. Other exercises grade automatically (wrong → Again, right → Good; slow or helped → Hard, as since Phase B). **Easy is not inferred**: no learner data exists to show that response time improves scheduling, so the default Good stays.
R2-4. **A new word rated *Nicht gewusst* stays at stage 0** (its Karte returns). Why: a quiz on a word one has just failed to recall teaches nothing.
R2-5. **"Secure" = FSRS stability ≥ 21 days** (Anki's "mature" line). Stability rather than the ladder stage so the dashboard uses the same memory model as the scheduler. The UI says: *Sicher: du erinnerst dich voraussichtlich mindestens drei Wochen lang.*
R2-6. **Three new exercise types**: Plural (choice), Kollokation (choice), Reihenfolge (tap words in order). They never gate the ladder, so old logs replay identically and the 295 existing tests stand. Typed recall (Tippen), meaning match (Bedeutung) and listening (Hören) already existed. Sheets with `collocation` or `plural` columns unlock the new ones.
R2-7. **Distractor ambiguity guard** drops synonyms, inflections, homonyms and phrases the sheet itself contains; previously chosen wrong options rank first. Existing scheduler test fixtures were given distinct headwords and glosses (they used `Wort001`, `meaning w_c0000001`, which the guard rightly treats as one lemma). No assertion was changed.
R2-8. **Goals** are optional, off by default, and shown only when switched on: one setting, "Runden pro Woche". No daily target.
R2-9. **"Diese üben"** passes the chosen words to the composer as `focus`: they come first and no new words are added for that run.

## Interface
R2-10. **Per-word pictograms are removed from the UI (F1).** The `image_key` column stays valid in the Sheet (existing data), is ignored by the app, and the Lucide pictogram shapes are no longer bundled. Icons are used for app controls only.
R2-11. **Three fixed zones on every screen (F3)**: route and run label on top; the card in the middle; actions at the thumb. Same for Karte, choice, typed, reorder, summary and week.
R2-12. **Leaving a card is a labelled button (F2).** Swipe-up advance is removed. The only gesture is the flap: drag up to peel, or tap, Enter, Space. The run can be left through *Fertig* only.
R2-13. **Palette from the prototype's `:root`**, kept as CSS variables in one file (`app/src/styles/tokens.css`). Light and dark; no red. Contrast is checked by a test (`app/src/styles/contrast.test.ts`) at WCAG AA (4.5:1 text, 3:1 graphics).
R2-14. **Type: Barlow and Barlow Semi Condensed**, self-hosted from the `@fontsource` packages (SIL OFL 1.1), latin subset. Overpass and Atkinson Hyperlegible Next are dropped.
R2-15. **The three style layers (D50) and the dev style switcher are removed.** One look.

## Deviations from the prototype
- The prototype marks a wrong choice with a grey fill only. The app keeps that and adds a check mark on the right option, so state never rests on colour alone.
- The prototype ends with "Neu starten"; the app ends with *Bis gleich.* and offers *Neue Runde* only on the summary.
- The prototype's summary shows "Wörter sicherer" per day; the app keeps the label and computes it from the log (R2-5).
- The cloze in the prototype has three text options; the app uses the same, falling back to two when the sheet has too few similar words (ENGINE.md).
