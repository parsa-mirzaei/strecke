# Third-party notices

Everything below is self-hosted inside this repository or bundled at build time. The app makes no runtime request to any font service, icon CDN, tracker or other origin. Licences were read from the files shipped in each package (`npm pack <name>@<version>`) or from the project's official repository.

## Shipped in the app

### Overpass (font; style 2)

- **Project:** The Overpass Project Authors (Red Hat), https://github.com/RedHatOfficial/Overpass
- **Package:** `@fontsource/overpass` 5.3.0 (npm, Fontsource), dev dependency; three woff2 files are bundled (latin 400, 600, 800). Overpass Mono was removed on 2026-10-08 (D50)
- **Licence:** SIL Open Font License 1.1. The fonts may be used, bundled and redistributed with software, including commercially; they may not be sold on their own, and modified versions must stay under the OFL and not use the reserved name. Full text: `app/node_modules/@fontsource/overpass/LICENSE`, also https://openfontlicense.org
- **Used for:** all text in style 2 "Emaille"

Copyright 2021 The Overpass Project Authors (https://github.com/RedHatOfficial/Overpass)

### Barlow and Barlow Semi Condensed (fonts; style 1)

- **Project:** The Barlow Project Authors (Jeremy Tribby), https://github.com/jpt/barlow
- **Package:** `@fontsource/barlow` 5.3.0 and `@fontsource/barlow-semi-condensed` 5.3.0 (npm, Fontsource), dev dependencies; latin 500 and 600 (Barlow), latin 600 and 700 (Semi Condensed) are bundled
- **Licence:** SIL Open Font License 1.1, read from the `LICENSE` file in each package. Copyright 2017 The Barlow Project Authors (https://github.com/jpt/barlow)
- **Used for:** style 1 "Anzeiger" (word, labels and buttons in Semi Condensed, text in Barlow)

### Atkinson Hyperlegible Next (font; style 3)

- **Project:** The Atkinson Hyperlegible Next Project Authors (Braille Institute), https://github.com/googlefonts/atkinson-hyperlegible-next
- **Package:** `@fontsource/atkinson-hyperlegible-next` 5.3.0 (npm, Fontsource), dev dependency; latin 400, 600, 800 are bundled
- **Licence:** SIL Open Font License 1.1, read from the package `LICENSE`. Copyright 2020-2024 The Atkinson Hyperlegible Next Project Authors (https://github.com/googlefonts/atkinson-hyperlegible-next)
- **Used for:** style 3 "Klartext" (all text)

While the three styles are compared, all their fonts are bundled. After the owner picks one, the fonts of the other two are removed.

### Lucide (icons and pictograms)

- **Project:** Lucide Icons and Contributors, https://github.com/lucide-icons/lucide, https://lucide.dev
- **Package:** `lucide-static` 1.52.0 (npm). Not a dependency: `tools/app/build_icons.py` copies only the 50 icons in use into `app/src/ui/icons.ts`, as plain shape data
- **Licence:** ISC; icons derived from Feather are additionally under MIT (Copyright (c) 2013-present Cole Bemis)
- **Used for:** the speaker icon and the per-word pictograms (`image_key`)

```
ISC License

Copyright (c) 2026 Lucide Icons and Contributors

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```

```
The MIT License (MIT) (for the Lucide icons derived from Feather)

Copyright (c) 2013-present Cole Bemis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Preact

- **Project:** https://github.com/preactjs/preact, package `preact` 10.29.8 (npm)
- **Licence:** MIT, Copyright (c) 2015-present Jason Miller
- **Used for:** rendering the interface

## Development only (not shipped)

### FSRS-5 algorithm

The memory model in `core/src/fsrs.ts` is an independent implementation of the published FSRS-5 formulas and default parameters of the open-spaced-repetition project (https://github.com/open-spaced-repetition, MIT). No code is copied.

### Tabler Icons and Phosphor Icons (comparison page)

Nine pictograms from each set appear only on the development comparison page `app/dev/compare.html`. Their data (`app/dev/compare-icons.json`) is generated locally by `tools/app/compare_icons.py` and gitignored, so neither set is in the repository or the build.

- Tabler Icons: `@tabler/icons` 3.49.0, https://github.com/tabler/tabler-icons. MIT License, Copyright (c) 2020-2026 Paweł Kuna
- Phosphor Icons: `@phosphor-icons/core` 2.1.1, https://github.com/phosphor-icons/core. MIT License, Copyright (c) 2023 Phosphor Icons

Both under the MIT terms reproduced above (with their own copyright lines).

### References consulted, nothing copied (2026-10-08 design review)

Openly licensed design systems of transport and public services were studied for principles only (one signal colour for what is actionable, large touch targets, type sized for distance). No code, asset, colour palette, typeface or pictogram was taken from them. Their licences, read from the official repositories:
- DB UX Design System (Deutsche Bahn), https://github.com/db-ux-design-system/core-web: code Apache-2.0; DB fonts, icons, trademarks and branding explicitly excluded
- SBB Lyne components (Swiss Federal Railways), https://github.com/sbb-design-systems/lyne-components: code MIT, Copyright (c) 2018-2024 SBB AG
- U.S. Web Design System, https://github.com/uswds/uswds: mostly public domain, with listed exceptions
- GOV.UK Frontend, https://github.com/alphagov/govuk-frontend: code MIT, Crown Copyright; its Transport typeface is not licensed for other services

### Tooling

Vite, Vitest, TypeScript, `@preact/preset-vite` and `@vitest/coverage-v8` are build and test tools under MIT or Apache-2.0; they do not ship in the app.
