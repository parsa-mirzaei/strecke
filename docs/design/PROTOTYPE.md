# Feed prototype: design plan

> Superseded by [HEFT.md](HEFT.md) (MVP2, 2026-10-06). Kept as the record of the first prototype.

Frontend prototype on synthetic data. Question: **would the learner open Strecke instead of a social feed in an idle minute?** No Core, no Inbox, no network.

## A. The current page (Phase 0 spike)

The live page is a test harness, not a product:
- diagnostics in monospace boxes;
- a URL field;
- no German until you tap a button;
- the Phase 0 tokens (warm cream paper, Georgia serif) are exactly the generic "calm notebook" look that reads as template.

Nothing on it gives a reason to come back. Opening it costs attention and returns nothing.

## B. Three interaction directions

| | 1. Card stack (swipe to grade) | 2. Feed of pages (resolve, then the next page rises) | 3. Notebook page (quiet text, tap to ink) |
| --- | --- | --- | --- |
| Feel | Tinder-like: one card, swipe right "had it", left "not quite" | One German moment per screen; answering moves the feed up, like the feeds the thumb already knows | A single page of text; tapping inks the answer in |
| Strengths | Fast, physical, one-handed | Uses the same muscle memory as the apps it competes with; every screen is complete on its own; natural rhythm | Calm, literary, no game feel |
| Weaknesses | Swipe direction means like/dislike elsewhere; accidental grades; reads as "flashcards with physics" | Risk of mindless skimming, if moving on doesn't require an answer | No pull; reading, not doing; nothing to come back for |
| Competes for idle time | Medium: fun for 20 swipes, then it's Anki | **High**: the feed shape is what idle hands open; making each screen a tiny retrieval turns scrolling into practice | Low |

**Chosen: 2, with one rule against skimming:** the feed only moves when the current card has been resolved. The answer *is* the "next" gesture. There is no swipe-to-skip, no autoplay chain, and no infinite list underneath; the next card is chosen when you answer.

## C. Concept: redacted German that becomes yours

One visual idea carries all three card types: **what you have not heard or said yet appears as a bar; when you retrieve it, the bar turns into the word.**
- **Hören (Listen):** the whole sentence is a row of word-shaped bars. As it is spoken, the bars light up word by word. You pick the meaning; the bars dissolve into the German text.
- **Abrufen (Recall):** one bar sits in a real sentence. You say it aloud, tap, and the bar dissolves into the word while you hear the sentence.
- **Kennenlernen (Meet):** nothing hidden. The word is the headline, with the article in its gender colour.

The moment of resolution is the bar turning into German, plus your own voice having said it first. It is small, physical and repeatable, which is what makes the 30th card still feel good.

Progress uses the app's name: **Strecke** is a route. "Was du schon sagen kannst" is a route line with five stops (Arbeit, Alltag, Uni, Amt, Gespräche). Each stop lists real sentences you can now say: *sagbar*, and how many are still *unterwegs*. No points, no streaks; missed days are not marked.

## D. Tokens

**Colour:** cool and transit-like, not cream. Light follows the system; dark is the evening-train default.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--bg` | `#EEF1F4` | `#0E1621` | page |
| `--ink` | `#14202E` | `#E6ECF2` | text |
| `--muted` | `#5A6778` | `#92A0B1` | meaning, meta |
| `--bar` | `#CBD3DC` | `#24334A` | hidden words |
| `--accent` | `#0B6E69` | `#5CC8BE` | retrieved word, focus, primary action |
| der / die / das | `#2F5FA8` / `#B23A48` / `#2E7D4F` | `#7FA6E6` / `#E58593` / `#79C49A` | article only |

**Type:** **Fira Sans**, self-hosted, one family in two widths.
- It comes from a German signage and typographic tradition, sets umlauts and ß cleanly, and its **Condensed** width solves the real problem of long compounds (*Krankenversicherungskarte*): the headword switches width before it shrinks.
- Scale (rem): headword 2.75 / line-height 1.05 / tracking −0.02em; sentence 1.3125 / 1.45; meaning 1.0625; meta 0.875.
- Weights: 400, 500, 600.

**Layout:**

```
┌──────────────────────────────┐
│ Alltag              ⟋   +    │  quiet top line: situation, progress, capture
│                              │
│ die                          │  article in gender colour
│ Verspätung                   │  headword, left-aligned, auto-fit
│ delay                        │
│                              │
│ Der Zug hat zwanzig          │  sentence; hold = slower replay
│ Minuten ████████.            │  hidden word as a bar
│                              │
│ [optional mnemonic]          │
│                              │
├──────────────┬───────────────┤
│  Nicht ganz  │   Hatte ich   │  thumb zone, 56 px, safe-area aware
└──────────────┴───────────────┘
```

- Everything left-aligned to one text edge.
- No boxed cards: each card is the whole page.
- The only container shapes are the bottom action bar, the capture sheet and the mnemonic.

**Motion** (from the skills, values fixed):

| Moment | Tokens |
| --- | --- |
| Card out | 160 ms, translateY −24 px + fade |
| Card in | 220 ms from +32 px, `cubic-bezier(0.23,1,0.32,1)` |
| Bar to word | `clip-path` reveal 240 ms + blur 2 px → 0 |
| Press | `scale(0.97)` in 120 ms |
| Sheets | `--ease-drawer` 300 ms |
| Reduced motion | opacity only |

## E. Principles

1. Opening the app is already practice. No home screen, no start button, no counts.
2. Every card is complete in under 15 seconds and worth it alone.
3. The answer moves the feed; nothing moves by itself.
4. Progress is sentences you can say, never points.
5. Leaving is always fine: no "session", no warning, no streak.
6. One bold idea (bars that become German); everything else stays quiet.

## Review against the brief: what changed and why

- **Dropped the Phase 0 cream + serif tokens.** They are the most common generated look, and they say "notebook", not "fast feed".
- **Dropped domain colours on cards.** Five route colours plus three gender colours is noise. Gender colours carry learning value; domain colours didn't.
- **Dropped swipe-to-grade.** Mapping honesty to a flick invites lying to yourself. Swipe is kept only for navigation (left edge → Strecke) and hold only for slow replay.
- **Dropped the "days" tick strip** from progress. Even without the word "streak", a row of empty ticks reads as a broken chain.
