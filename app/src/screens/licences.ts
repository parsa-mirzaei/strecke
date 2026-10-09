/**
 * Third-party material that ships in the app or is called by it (A8). Full texts and package versions
 * are in NOTICE.md; the same facts are shown in Einstellungen > Über. Add a row here whenever a font,
 * icon or library is added, and a test checks that every row has a licence and an https source.
 */
export interface Licence {
  name: string;
  used: string;
  licence: string;
  holder: string;
  source: string;
}

export const LICENCES: readonly Licence[] = [
  {
    name: 'Barlow and Barlow Semi Condensed',
    used: 'All text (fonts, self-hosted from @fontsource 5.3.0, Latin subset)',
    licence: 'SIL Open Font License 1.1',
    holder: '© 2017 The Barlow Project Authors',
    source: 'https://github.com/jpt/barlow',
  },
  {
    name: 'Lucide',
    used: 'Icons for app controls (17 icons copied as plain shapes from lucide-static 1.52.0)',
    licence: 'ISC; parts derived from Feather under MIT',
    holder: '© 2026 Lucide Icons and Contributors; © 2013-present Cole Bemis (Feather)',
    source: 'https://github.com/lucide-icons/lucide',
  },
  {
    name: 'Preact',
    used: 'Rendering the interface (10.29.8)',
    licence: 'MIT',
    holder: '© 2015-present Jason Miller',
    source: 'https://github.com/preactjs/preact',
  },
  {
    name: 'FSRS-5',
    used: 'The memory model: an independent implementation of the published formulas and default parameters',
    licence: 'MIT',
    holder: 'open-spaced-repetition project',
    source: 'https://github.com/open-spaced-repetition',
  },
  {
    name: 'ElevenLabs API (optional)',
    used: 'Voice, only if you switch it on and enter your own key. Nothing of ElevenLabs is bundled',
    licence: 'Service terms apply to your account',
    holder: 'ElevenLabs',
    source: 'https://elevenlabs.io/terms',
  },
];
