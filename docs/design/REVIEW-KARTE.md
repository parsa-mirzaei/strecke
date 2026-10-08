# Karte design review (2026-10-08)

The Karte slice from Phase C, reviewed against [BRIEF.md](BRIEF.md) and the seven principles in [STATION.md](STATION.md). This is the basis for three experimental styles. Decisions: DECISIONS D50.

**Method.** Every Karte state was captured with `tools/app/shots.mjs`: before the cover, cover lifted, the hand-over to the next card, a long word, a phrase and a thin row. Each was shot at 390 × 844 and 320 × 600, in light and dark, from the running dev server with real seed data, using headless Chrome with a fresh profile per shot. Three rounds of build, screenshot and critique followed per style.

## Audit of the slice as built (ranked)

| # | Severity | Flaw | Principle or brief point broken |
| --- | --- | --- | --- |
| 1 | Bug | At 390 px a long compound (*Krankenkasse*) ran past the right margin. The flex column did not shrink, so the fit-to-width check never fired | Control: content must never break the frame |
| 2 | High | Three full-width rounded slabs stacked (board, cover, buttons), all with the same radius and weight. This is the "identical rounded cards" pattern, and nothing says which one matters | AI slop test; hierarchy at a glance |
| 3 | High | The English meaning (26 px, 800) outweighed the German example (22 px, 600). The hint spoke louder than the language being learned | Content is German with short English hints; control |
| 4 | High | A dead zone of about 40 % of the screen between the answer and the actions. The content floats top-left and the thumb zone is empty paper | Calm absorption is not emptiness; layout reads unfinished |
| 5 | High | The amber cover was a flat bar with warning-tape hatching: it read as a disabled field or a caution sign, not as something to lift | Amber rule (retrieve, not warn); honesty without fear |
| 6 | Medium | *Fertig* was an outlined box as heavy as *Weiter*, and the only control below the card before the reveal, which looked like a lonely unfinished button | One action in view; a rare action should be quiet |
| 7 | Medium | The pictogram had the same size and stroke as the speaker icon. It read as another control | Icon hierarchy (slop test) |
| 8 | Medium | Phrase cards showed the chunk twice: as the headword and again inside the example | Calm: nothing redundant |
| 9 | Medium | In dark mode the board (#262E3A) barely separated from the page (#13171D) | Legibility, hierarchy |
| 10 | Medium | The mono upper-case label (`AMT`) at 12 px was faint and generic (a slop tell) and vanished on thin rows with no domain | Typography with a decision behind it |
| 11 | Low | Thin rows (word and meaning only) left the screen almost empty, with no composition for the case | Every card complete at rest |
| 12 | Low | The 680 ms enter with overshoot, on an action repeated tens of times a day, was close to sluggish | Alive under the finger, never waiting |

**AI slop test, slice as built: partial fail.** It failed on uniform rounded slabs (2), one icon size and weight everywhere (7) and a generic mono label (10). It passed on gradients, glass, shadows, emoji, centring, filler copy and decorative motion.

## Research (sources, all verified at source)

- **Type with signage character.** Licences read from the package files (`npm pack`). Details in NOTICE.md.
  - **Barlow** and **Barlow Semi Condensed**: OFL, The Barlow Project Authors, modelled on Californian highway and plate signage. The condensed width keeps long compounds whole.
  - **Atkinson Hyperlegible Next**: OFL, Braille Institute and the Atkinson Hyperlegible Next Project Authors. Distinguishes look-alike letters, which helps someone reading a foreign language.
  - **Overpass** (kept): OFL, Red Hat; descends from Highway Gothic.
  - Considered and not used: Fira Sans (the Heft's former face), IBM Plex (corporate technical voice), Public Sans (neutral, little character), D-DIN (not on a reputable registry).
- **Open design systems of transport and public services.** Licences read from the official repositories. None of them gives assets, so they serve as principles only, and nothing was copied.
  - DB UX Design System: Apache-2.0 for code; the licence explicitly excludes DB fonts, icons, trademarks and branding.
  - SBB Lyne components: MIT code; brand assets separate.
  - USWDS: mostly public domain, with listed exceptions.
  - GOV.UK Frontend: MIT code; its Transport typeface is restricted to GOV.UK.
  - Principles taken from them: one signal colour reserved for the actionable, large touch targets, type sized for distance, plates and panels as hierarchy.
- **Texture.** A paper grain generated in CSS from an SVG noise filter, written here (no third-party asset).
- **Motion principles.** From the installed skills (apple-design, emil-design-eng, animate). Nothing from other products.

## Three styles

Same components, same seed, same scheduler. Each style is a token and CSS layer (`app/src/styles/style-N.css`) plus a motion profile (`app/src/station/motion.ts`). Select with `?style=1|2|3`, or with the dev switcher in the strip.

### 1. Anzeiger (departure display)

**Idea.** German is read off one dark display panel that runs from the status bar down; the English answer lives on paper below.

**What changes.**
- **Type:** Barlow Semi Condensed 700 for the word (52–76 px) and Barlow for text.
- **Layout:** the panel takes the free height and sets the word on its lower edge. Calm space becomes a deliberate dark field, and the answer and the cover sit in thumb reach.
- **Phrases:** the example becomes the hero, so nothing is said twice.
- **Pictogram:** an outlined symbol tile.
- **Cover:** an amber flap with a hinge seam that folds up (rotateX, 420 ms).
- **Motion:** crisp. Enter 380 ms, exit 240 ms.

**Tradeoff.** The strongest hierarchy and the most "station" character, but even the light theme is mostly dark. It is the closest of the three to a transit-app look.

**Rounds.**
1. The dead paper zone under the panel; the pictogram tile shouted.
2. The panel was made to fill the space and the tile became an outline.
3. The hero phrase underline was thinned. Clean.

### 2. Emaille (enamel plates)

**Idea.** Every part is an object you could touch: the word on a light enamel plate with a double rim, the sentence on a dark plate, the cover an amber plate that slides aside.

**What changes.**
- **Type:** Overpass.
- **Layout:** content rests low near the thumb, on paper with a fine grain.
- **Word plate:** hugs its word instead of spanning the width.
- **Context:** a small line plate (*Amt*) replaces the mono label.
- **Motion:** calm with weight. Enter 560 ms, plate slides 560 ms.

**Tradeoff.** Warm and tactile, the evolution of the original Station direction. The plates add visual weight, the top of the screen stays quiet paper, and the idea sits closest to skeuomorphism.

**Rounds.**
1. Three identical full-width rounded slabs: a slop fail. The cover's rim read as a button.
2. The plate became sized to its word, with radii by role; the button-like rims were removed.
3. Content was lifted off the actions so short cards don't sink.

### 3. Klartext (type only)

**Idea.** No boxes. Hierarchy is made by size, weight and one thick ink rule that holds the German together; the English answer stands outside the rule.

**What changes.**
- **Type:** Atkinson Hyperlegible Next.
- **Layout:** the example sentence is set large in ink instead of on a board. The article is plain lighter text.
- **Cover:** a blank exactly one text line tall, with a 48 px touch area, that wipes away left to right.
- **Pictogram:** large and light-stroked (44 px, 1.5 stroke), so it illustrates and never looks like a control.
- **Phrases:** appear once.
- **Motion:** quick and soft. Enter 420 ms, wipe 380 ms.

**Tradeoff.** The calmest and most legible, and it ages best. It has the least literal "station" character, and its whitespace must be judged on the phone.

**Rounds.**
1. Dead zone; the blank was below the 44 px touch target; the hero underline was heavy.
2. The answer moved into thumb reach, the touch area became 48 px, and the underline was thinned. This pushed the answer 200 px from its word.
3. The answer was pulled back up, with top padding for balance.

**AI slop test, all three after round 3: pass.**
- None has gradients, glass, soft shadows, emoji, a uniform card grid, centred text, default type, filler copy or decorative motion.
- Each has exactly one point of colour (amber: the cover, then *Weiter*).
- Icons have a hierarchy (the pictogram is distinct from UI icons).
- Every choice traces back to the brief.

## Recommendation

**3 · Klartext**, with one idea borrowed from 1 if the owner wants more presence: the condensed display face for very long compounds.
- It serves the brief most directly. Calm absorption and honesty come from type alone, legibility is the font's purpose (a learner reads every letter of a foreign word), and nothing on screen competes with the word.
- It also costs the least to extend to the other seven exercises: blanks, options and typed answers are typographic by nature.
- **1 · Anzeiger** is the most striking and the best at "control". It is the choice if the owner wants the app to feel like a confident instrument and accepts a mostly dark screen.
- **2 · Emaille** is warm but the most decorative of the three, and plates multiply as exercises add options.

After the owner picks, the other two style files and their fonts are deleted (DECISIONS D50).
