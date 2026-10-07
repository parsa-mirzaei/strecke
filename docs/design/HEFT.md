# The Heft: MVP2 interface

> Superseded by [STATION.md](STATION.md) (2026-10-07, DECISIONS D36). Kept as the record of MVP2 slice 1.

Replaces the card prototype ([PROTOTYPE.md](PROTOTYPE.md)). Decision: [DECISIONS D33](../DECISIONS.md).

**Test it has to pass:** with two idle minutes and Instagram one tap away, Strecke is easy and attractive enough to sometimes win. No streaks, no counts, no session to finish.

## Why the card prototype failed

- It opened on an instruction ("Sag den Satz laut, dann aufdecken.") above a grey bar: effort before any payoff.
- Every item was the same loop as Anki: prompt, tap *Aufdecken*, grade yourself with *Hatte ich* / *Nicht ganz*. Two taps and a judgement per item.
- Every screen had the same composition, with about a quarter of the screen used. Nothing before or after was visible, so it was not a feed.
- Rewards were toasts, the checkpoint counted cards, and progress was a transit map that had to be read.

## The idea

One vertical scroll, like the feeds the thumb already knows. Above: what you just did, faded. In front: one encounter. Below: the next one, already visible.

- **Moving on is scrolling.** When the next encounter's top passes 40% of the screen (or you tap it), it becomes the active one and a new one is drawn below.
- **One tap resolves an item**, and it can always be done silently:
  - *Word*: nothing to do. Moving on means "new to me"; *Kenne ich schon* is optional.
  - *Gap*: think of the word, tap the bar, and it inks in. Moving on means "had it"; *Nochmal üben* is optional.
  - *Article, meaning, listen*: tap the answer. These are graded objectively.
- **Scrolling past without answering is a skip**, not a miss. The item comes back later.
- **Speaking is an invitation**, never the instruction: every fifth gap says *Wenn du magst: sag es laut.* Nothing plays by itself. Listening items offer *Gerade kein Ton? Text zeigen*.

## Compositions

A small vocabulary of layouts, so the feed changes shape without separate modes:

| Ladder stage | Composition | Shape |
| --- | --- | --- |
| 0 | Word | Article in gender colour, large serif headword, gloss, example, optional mnemonic. Agent suggestions add *Vorschlag* and *Nicht für mich* |
| 1 | Article / Meaning / Listen | Headword with *der die das* as three serif words; or the example with the word in bold and three meanings; or a play button over word-shaped bars |
| 2–3 | Gap | A sentence with one bar, English hint at stage 2. A quoted two-turn exchange („…“ – „…“) is shown as a mini-dialogue |
| 4+ | Gap, every third time Listen | As above, in the second, unseen context |

The scheduler keeps any one type from appearing three times in a row and never shows the same item twice within three entries. An item missed twice in one visit rests until the next open.

## Look

- **Dark first**, warm and calm. Light and "wie das Gerät" are options in *Was du schon sagen kannst*.
- **German is always Literata**, a screen-reading serif with optical sizes. English and controls are in Fira Sans, smaller and quieter.
- **One accent, "lamp"** (`#d2b07a` dark, `#8a6120` light). It is used where German is retrieved: the word inking in, the right answer, *Vorschlag*, *Das kannst du jetzt sagen*. Gender colours are muted and used only on articles.
- **No boxes around items.** A short rule marks where each item starts. Options are lines of text, not buttons.
- **Motion:**
  - The bar inks in (clip and blur, 460 ms, ease-out); this is the one orchestrated moment.
  - The active item fades up from the peek (220 ms).
  - Press feedback scales controls slightly.
  - Reduced motion keeps only fades.

## Progress

*Was du schon sagen kannst* is reached from the top of the Heft, so scrolling up means looking back. It lists, per situation, the real sentences you can produce without help (stage 3 and above). Tapping one plays it. It shows no scores and no counts of cards or days. Inside the feed, the line *Das kannst du jetzt sagen.* appears on the item the moment it becomes sayable.
