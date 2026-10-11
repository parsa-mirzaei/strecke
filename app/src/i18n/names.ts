/**
 * Proper names and fixed German content shown in the interface. They are the same in every UI language,
 * so they live here instead of the string tables.
 */
export const APP_NAME = 'Strecke';
export const PROVIDER_NAME = 'ElevenLabs';
/** Spoken by "Test voice": learning content, so German whatever the UI language. */
export const SAMPLE_SENTENCE = 'Guten Tag! So klingt diese Stimme.';
/** Each language named in itself, so it can be found whatever the current language is. */
export const LANGUAGE_NAMES = { en: 'English', de: 'Deutsch' } as const;
/** Shape of a published-sheet link, shown as the input's placeholder (no real key). */
export const SHEET_LINK_EXAMPLE = 'https://docs.google.com/spreadsheets/d/e/…/pub?output=csv';
