# Third-party notices

Everything below is self-hosted inside this repository or bundled at build time. The app makes no runtime request to any font service, icon CDN, tracker or other origin. Licences were read from the files shipped in each package (`npm pack <name>@<version>`) or from the project's official repository.

## Shipped in the app

### Overpass and Overpass Mono (fonts)

- **Project:** The Overpass Project Authors (Red Hat), https://github.com/RedHatOfficial/Overpass
- **Package:** `@fontsource/overpass` 5.3.0 and `@fontsource/overpass-mono` 5.3.0 (npm, Fontsource), dev dependencies; only four woff2 files are bundled (Overpass latin 400, 600, 800; Overpass Mono latin 600)
- **Licence:** SIL Open Font License 1.1. The fonts may be used, bundled and redistributed with software, including commercially; they may not be sold on their own, and modified versions must stay under the OFL and not use the reserved name. Full text: `app/node_modules/@fontsource/overpass/LICENSE`, also https://openfontlicense.org
- **Used for:** all text in the app (Overpass) and the context label strip (Overpass Mono)

Copyright 2021 The Overpass Project Authors (https://github.com/RedHatOfficial/Overpass)

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

### Tooling

Vite, Vitest, TypeScript, `@preact/preset-vite` and `@vitest/coverage-v8` are build and test tools under MIT or Apache-2.0; they do not ship in the app.
