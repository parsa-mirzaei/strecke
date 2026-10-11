# Layout audit

Script: [tools/app/layout-audit.mjs](../tools/app/layout-audit.mjs). It drives the built app in headless Chromium and checks every combination of:

- viewport **320×600, 360×740, 390×844, 430×932**;
- root text size **100 % and 130 %**;
- theme **light and dark**;
- UI language **en and de**.

On each combination it captures the practice states (Karte covered, Karte with the rating row, a choice card before and after answering) and every Settings screen. It fails on:

- a page that scrolls sideways;
- an element outside the viewport;
- a clipped button label;
- a tap target under 44 px.

Desktop emulation is not evidence for feel, timing, safe areas or the on-screen keyboard. Those are checked on the Android phone (CLAUDE.md).

| Run | Screens | Problems | Notes |
| --- | --- | --- | --- |
| Slice 2 | 160 | 0 | The first run flagged one item, the *Connect your sheet* link at 43 px tall; fixed (min-height 44 px) |

| Slice 3 | 160 | 0 | Settings › Data now has the connect form (guide, link fields, CSV fallback) |

| Slice 4 | 256 | 0 | Adds a sheet phase per viewport, text size and language: run start (demo vs sheet), Data connected, Fill my list gated and ready. Fixed on the way: the instructions box is no longer flagged (it scrolls by design), and labelled values now wrap under their label at 320 px instead of breaking mid-word

Later runs are added below as the screens grow.
