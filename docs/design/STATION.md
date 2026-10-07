# Station: the Strecke interface

Replaces the Heft ([HEFT.md](HEFT.md)). Decisions: [DECISIONS D36–D45](../DECISIONS.md). Exercise and engine rules: [SPEC "Exercises" and "Learning engine"](../SPEC.md).

## Why the app exists

The learner moved to Germany without speaking German. There is a wide gap between what they could do before and what they can do now. Strecke is meant to give back a feeling of **control**: following what people say on the street, holding a short conversation without the other person noticing they are still learning. The app runs on that feeling, not on dopamine.

## Seven principles

Every screen and every string is checked against these.

1. **Evidence, not rewards.** Motivation comes from proof of being ahead of yesterday. No streaks, XP, levels, confetti, flames, coins, mascots or badges.
2. **Never make the learner feel behind.** No due counts, no backlog numbers, no "you missed yesterday", nothing that grows while they are away.
3. **Every progress claim is specific, true and checkable from the learner's own event log.** "Vor drei Wochen: *zuständig* nicht erkannt. Heute: ohne Hilfe." Never a claim about real-world ability ("you can order at a bakery"): knowing a word in the app is not that, and a false claim gives false control.
4. **A companion, not a teacher.** Warm, close, never judging. This is a tone for the visual and verbal language, not a character: no avatar, no persona, no chat bot.
5. **Alive but quiet, with character.** Nothing generic, nothing cute.
6. **Honesty is free.** Saying "I did not know" costs nothing. A wrong answer is information, not failure: no red, no buzzer, no loss. Signals come from behaviour (right/wrong, response time, chosen option), not self-grading buttons. While working, the app is calm and absorbing, like a friend sitting next to you.
7. **The science is invisible.** The scheduler decides what comes next. The UI never shows intervals, due counts, stability or "level". The learner sits down and a session is there.

## Concept: station signage on warm paper

Station signs are clear, public and adult. Sentences sit on **boards** (dark panels), and context sits on a **mono label strip**. The palette is warm paper, not cold transit. One rule explains the whole interface, so no exercise needs instruction text:

> **Amber means "what you have to retrieve."** In every exercise the missing answer is an amber shape: a blank in a sentence, a cover over a meaning, the gap before a noun. Answering fills it; tapping lifts it.

- A first-time user understands each exercise from its layout alone. No "tap to reveal", no tutorial copy. If a layout needs a caption, the layout is wrong.
- A lone word on an empty page is wrong. Show context (the example sentence) and the shape of the missing answer. The only exception is a *thin* record with no example (see SPEC): its Karte shows the word, article and plural, plus the collocation if there is one.

## Tokens

CSS custom properties. Light is the reference design; dark keeps the same roles. Default theme follows the device; Einstellungen offers *Hell*, *Dunkel*, *Wie das Gerät*.

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| `--paper` | `#F4F0E6` | `#13171D` | page |
| `--paper-2` | `#EAE4D6` | `#1C2129` | sheets, option fill on press |
| `--ink` | `#1B2430` | `#ECE6D8` | text, option outlines |
| `--ink-2` | `#5B6270` | `#A3A9B4` | translations, notes, labels |
| `--line` | `#C9C4B8` | `#3A424E` | dividers (decorative only) |
| `--signal` | `#F2A900` | `#F2A900` | amber: the thing to retrieve |
| `--signal-edge` | `#9C6C00` | `#F2A900` | outline of amber shapes on paper |
| `--ok` | `#1F7A5C` | `#4DB38D` | correct |
| `--board` | `#1B2430` | `#262E3A` | sentence boards |
| `--board-ink` | `#F4F0E6` | `#F4F0E6` | text on boards |
| `--board-mute` | `#B7BDC8` | `#B7BDC8` | secondary text on boards |

**No red anywhere.** No error colour exists in the token set.

**Contrast**, WCAG ratios computed from the hex values (text needs 4.5:1, UI shapes 3:1):

| Pair | Light | Dark |
| --- | --- | --- |
| ink on paper | 13.75 | 14.45 |
| ink-2 on paper / paper-2 | 5.39 / 4.84 | 7.61 / 6.85 |
| ok on paper (text) | 4.62 | 6.98 |
| ink on signal (filled blank, article chip) | 7.79 | 8.95 |
| signal on board (highlighted word) | 7.79 | 6.81 |
| board-mute on board | 8.29 | 7.25 |
| signal on paper (shape) | **1.77**, fails 3:1 | 8.95 |
| signal-edge on paper (shape outline) | 4.05 | — |

Amber shapes on light paper therefore always carry a `--signal-edge` outline or underline. The fill alone is not enough to see them.

## Type

- **Overpass** (400, 600, 800) for everything, and **Overpass Mono** (12 px, letter-spaced, upper-case) for labels. Both are SIL OFL 1.1 and self-hosted from `@fontsource`. There are no font requests at runtime, so the PWA works offline. Licences are listed in `NOTICE.md`.
- Headword: 800, `clamp(44px, 15vw, 60px)`, tight tracking. Long compounds wrap with `hyphens: manual` and soft hyphens from the data, never mid-syllable by the browser.
- Board sentence: 600, about 22 px, line-height 1.35. Translations and notes: 400, 16 px, `--ink-2`.
- German is always set in `lang="de"` so screen readers and hyphenation use German rules.

## Components

| Component | Shape |
| --- | --- |
| Label strip | Mono label, top left: the domain (`ALLTAG`), plus `DEMO` or `VORSCHLAG` when relevant |
| Article chip | Small `--signal` rectangle with the article in ink; an empty chip with a `--signal-edge` outline when the article is what you retrieve |
| Headword | 800 weight, left-aligned on the text edge |
| Board | `--board` panel, radius 6, full-bleed minus the gutter; the target word marked with a signal underline or fill |
| Amber blank `.gap` | Word-width space with a 4 px `--signal` underline and a `--signal-edge` 1 px base line; filled state: signal background, ink text |
| Amber cover | A `--signal` panel with a `--signal-edge` outline, laid over the meaning; it slides aside when lifted |
| Option row | 56 px, 2 px ink outline, radius 6, full width; for der/die/das and prepositions, chips in one row |
| *Weiter* | 60 px, `--signal` fill, ink text, full width, bottom of the thumb zone |
| *Fertig* | 60 px, outline; ends the visit with a calm *Bis gleich* |
| *Weiß ich nicht* | Quiet text button under the options of every graded exercise |
| Icons | Lucide, inline SVG, 2 px stroke, round caps and joins; only the icons in use are bundled |

## Exercises on screen

What the learner sees. Which exercise appears when is set by the SPEC ladder.

| Exercise | Layout | Resolves by |
| --- | --- | --- |
| **Karte** | Article chip, headword, plural in ink-2; board with the example, the word highlighted; amber cover over the meaning | Tap the cover: it slides aside, the meaning shows, then the example translation, collocation and note fade in. *Weiter* |
| **Artikel** | Empty amber chip before the headword; example board below; chips *der die das* (always in this order) | Tap a chip |
| **Bedeutung** | Article chip, headword, example board; an amber blank where the meaning goes; three meaning rows | Tap a row |
| **Lücke** | Board with the sentence and one amber blank; at stages 1–2 the example translation in ink-2 underneath; three option rows | Tap a row |
| **Präposition** | `zuständig ▭` (or the example with the preposition blanked) on the board; preposition chips | Tap a chip |
| **Hören** | Board with a large play control and the sentence as word-shaped bars, the target word's bar amber; three meaning rows; *Gerade kein Ton? Text zeigen* | Tap play (speech starts inside the tap), then a row |
| **Tippen** | The Lücke board; a 16 px text field sits in the blank; *Prüfen* | Enter or *Prüfen* |
| **Zweiter Kontext** | A Lücke in the second example's situation, no translation | Tap a row |

**After any answer**
- *Right:* the chosen word flies into the blank and the blank fills; the option pops; the meaning or translation fades in. Then *Weiter*, or swipe up.
- *Wrong or "Weiß ich nicht":* the chosen option dims, with a dashed outline and a small mono `GEWÄHLT` tag. The right option turns `--ok` and the right word fills the blank. One quiet line appears: *Das sehen wir bald wieder.* The card waits for *Weiter* or a swipe.
- *Tippen near miss:* the correct form appears under the field as *Fast: Verspätung*. It counts as correct.

## Motion and feel

Tuned on a real Android phone; desktop emulation is not evidence. Plain CSS transitions plus the Web Animations API, no animation library.

| Moment | Value |
| --- | --- |
| Card enter | 680 ms, `cubic-bezier(.22,.9,.28,1.02)`, from 48 px below + fade |
| Card exit | 340 ms, up and out |
| Right answer | chosen word flies into the blank ≈ 560 ms (FLIP, transform only), blank fills; option pops ≈ 550 ms |
| Cover lift | slides aside ≈ 700 ms; meaning, then translation and note fade in after |
| Press | `scale(.97)`, 180 ms, on every control |
| Swipe up to continue | the card follows the finger 1:1; released early it rubber-bands back with a spring; a fast flick continues even when short (velocity-aware) |
| Reduced motion | fades only, same timings shortened to ≤ 200 ms |

- **Interruptible:** a tap never waits for an animation. A new answer or *Weiter* cancels running animations and jumps to their end state.
- **Haptics** (Vibration API, feature-detected, off in Einstellungen): 12 ms on right, a soft double pulse (8, 60, 8) on wrong, 8 ms on cover lift. Never relied on.
- **Mobile basics:** `100dvh`, safe-area insets with `viewport-fit=cover`, no tap highlight, `touch-action: manipulation`, 16 px inputs, hover only under `(hover: hover) and (pointer: fine)`, `theme-color` per scheme, zoom never disabled. The Tippen field keeps the board visible above the keyboard (`visualViewport`).
- **Audio:** Web Speech `de-DE`, voices via `voiceschanged` plus a timeout fallback, speech only inside tap handlers; the speaker hides when no German voice exists, and Hören is then skipped.

## Screens

| Screen | Reached by | Content |
| --- | --- | --- |
| **Üben** (home) | Every open | One card at a time, actions in thumb reach. Top: label strip left; speaker and menu icon right. No counters, no progress bar. Renders from IndexedDB in < 2 s |
| **Dein Weg** | Appears between cards when there is a new true claim (at most once per visit, never in the first five cards); also in the menu once a claim exists | One sentence whose deck words are all known; before/after pairs from the log. No scores, no counts. Not shown at all when there is nothing true to show |
| **Wörter** | Menu | Search and browse all words; open one to see every column and the exercises it generates; edit; *Pausieren* (suspend). New rows from the Sheet carry a `NEU` label until first seen |
| **Hinzufügen** | Menu | One 16 px field + domain chips + *Speichern*. Feeds the existing capture flow |
| **Vorschläge** | Menu | Agent suggestions: *Behalten* / *Nicht für mich*. Suggestions also appear in the feed as a Karte labelled `VORSCHLAG` |
| **Einstellungen** | Menu | Theme, Ton, Vibration, Datenquelle, Demo. No goals |

### Dein Weg: which claims are allowed

Each claim is computed from the event log by a pure function, with a fixture-log test per rule.

| Claim | Shown only when | Wording |
| --- | --- | --- |
| Before/after | The word's earliest graded event, ≥ 7 days ago, was a miss, and its two most recent graded events are correct, the latest one a recall exercise (Lücke at stage ≥ 3, Tippen, Zweiter Kontext) with no text shown | *Vor drei Wochen: **zuständig** nicht erkannt. Heute: ohne Hilfe.* The verb matches the missed exercise: recognition → *nicht erkannt*, Lücke → *nicht eingesetzt*, Tippen → *nicht geschrieben*. The time phrase comes from the real dates (*Heute*, *Gestern*, *Vor zehn Tagen*, *Vor drei Wochen*) |
| A known sentence | An example sentence containing at least two deck words, each of which was last answered correctly in a recall exercise | The sentence on a board with the deck words marked, and *Jedes markierte Wort hast du zuletzt ohne Hilfe gewusst.* |
| New situation | A word's first correct Zweiter Kontext | ***Termin**: jetzt auch in einer neuen Situation.* |

There are never counts, percentages, streaks, or sentences like "you can now…".

## Strings

German UI, short English hints for content. Fixed labels: *Weiter*, *Fertig*, *Bis gleich*, *Weiß ich nicht*, *Prüfen*, *Fast:*, *Das sehen wir bald wieder.*, *Gerade kein Ton? Text zeigen*, *Dein Weg*, *Wörter*, *Hinzufügen*, *Vorschläge*, *Einstellungen*, *Behalten*, *Nicht für mich*, *Speichern*, *Pausieren*, *Suchen*. Labels: `NEU`, `VORSCHLAG`, `DEMO`, `GEWÄHLT`.

**Never in any string:** imperatives that explain an exercise, praise ("Super!"), loss language ("falsch", "verpasst"), numbers about progress, claims about real-world ability.

## Accessibility

- Every exercise is fully operable by keyboard: options are buttons in reading order; 1/2/3 pick an option; Enter means *Weiter*.
- Screen readers get the blank as "Lücke" and the cover as a button labelled with its role ("Bedeutung zeigen"). Results are announced through a polite live region ("Richtig: Verspätung" / "Die Antwort ist Verspätung").
- Colour is never the only signal: a wrong choice also gets a dashed outline and the `GEWÄHLT` tag; the right one gets a check icon.
