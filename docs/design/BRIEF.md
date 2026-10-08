# Design brief: the Karte

One page. Written for the redesign round of 2026-10-08 by running `/clarify` in self-answering mode. The questions it raises are answered from the project's own material: the founder story and seven principles ([STATION.md](STATION.md)), the amber rule, SPEC and DECISIONS. Nothing here was asked of the owner.

## Who it is for

An international student who moved to Germany without speaking German. They are now around A2–B1, live their days in German (office letters, lectures, a part-time job, small talk at the bakery), and understand less than they would like. They open the app on an Android phone, one-handed, in idle minutes: on a platform, between lectures, in the evening. The sessions are short and frequent, and they often happen outdoors in daylight or on a dim train.

## The feeling

- **Control over a language.** Every card ends with the learner knowing exactly what they just saw, and nothing is left vague. Type is large and confident, the hierarchy is legible at a glance, and nothing competes with the word.
- **Calm absorption.** One thing at a time. No counters, nothing blinking, nothing asking for attention. Quiet surfaces, generous space, a steady rhythm from card to card.
- **Honesty without fear.** Not knowing is free. The cover lifts the same way whether you knew the word or not, there is no score, and no colour or sound means "wrong".
- **Alive under the finger.** The card responds the instant it is touched, follows the thumb 1:1, has weight when it lands, and can be caught mid-motion. Motion answers the hand; it never performs on its own.

## Answers to the audit questions

| Question (clarify bucket) | Answer from the project's material |
| --- | --- |
| "Station": literal or a metaphor? (A) | A metaphor. It borrows the qualities of good public signage: legible at distance, plates and boards, one signal colour, confident type. No trains, route maps, platform numbers or any operator's look. |
| What may amber be? (A) | Only what you have to retrieve, or once it is retrieved, the next thing for your hand. One amber thing on screen at a time (D49). |
| What does "alive" mean? (A) | Direct manipulation and physical response: press, follow, spring, settle. Never ambient or decorative animation (principle 5). |
| May the type change? (C) | Yes. The owner asked for type with real character this round. It must stay self-hosted and OFL-licensed, and survive German compounds and „…“ quotes. |
| How many styles survive? (B) | Three are built to be compared. After the owner picks one, the other two are deleted, so fonts and CSS for unused styles never ship. |
| Do layout or data change? (B) | No. Same components, same seed, same scheduler. Styles are token and CSS layers, selectable by `?style=1|2|3` and a dev-only switcher. |
| Push or deploy? (D) | No. Commits stay local; Pages republishes on every push. |

## It must never feel like

- A game: no points, mascots, confetti, bouncy rewards.
- A school test: no red, no "falsch", no marks.
- A social feed: no infinite-scroll texture, no badges.
- A generic AI-made app: no gradients, glass, soft shadows everywhere, centred everything, default type, grids of identical rounded cards.
- A transit operator's app: no copied colours, logos, pictograms or typefaces.
- Busy: never more than one point of colour, one large word, one sentence and one action in view at once.
