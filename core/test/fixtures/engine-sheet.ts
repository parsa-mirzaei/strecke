/**
 * Fixture sheet for the engine tests: synthetic, general A2–B1 German with the edge cases the engine
 * must survive: missing columns, homonyms (two rows `Bank`), near-synonyms, an inflection pair, a very
 * long compound, a chunk, a verb with a preposition. No learner data.
 */
import { toWordRecord, type WordRecord } from '../../src/record.ts';
import type { Row } from '../../src/schema.ts';

export const ROWS: Record<string, Row> = {
  termin: {
    de: 'Termin', article: 'der', plural: 'Termine', en: 'appointment', pos: 'noun', domain: 'amt',
    example_de: 'Ich habe morgen einen Termin beim Arzt.', example_en: 'I have an appointment at the doctor tomorrow.',
    example_2_de: 'Können wir den Termin auf Montag verschieben?', example_2_en: 'Can we move the appointment to Monday?',
    collocation: 'einen Termin vereinbaren',
  },
  rechnung: {
    de: 'Rechnung', article: 'die', plural: 'Rechnungen', en: 'bill, invoice', pos: 'noun', domain: 'alltag',
    example_de: 'Können wir bitte die Rechnung haben?', example_en: 'Could we have the bill, please?',
    example_2_de: 'Die Rechnung für den Strom kommt jeden Monat.', example_2_en: 'The electricity bill comes every month.',
    collocation: 'eine Rechnung bezahlen',
  },
  quittung: {
    // A synonym of Rechnung: must never be offered as a wrong meaning for it.
    de: 'Quittung', article: 'die', plural: 'Quittungen', en: 'receipt, invoice', pos: 'noun', domain: 'alltag',
    example_de: 'Bitte heben Sie die Quittung auf.', example_en: 'Please keep the receipt.',
  },
  haltestelle: {
    de: 'Haltestelle', article: 'die', plural: 'Haltestellen', en: 'stop (bus, tram)', pos: 'noun', domain: 'alltag',
    example_de: 'Wir steigen an der nächsten Haltestelle aus.', example_en: 'We get off at the next stop.',
    example_2_de: 'Treffen wir uns an der Haltestelle vor der Uni?', example_2_en: 'Shall we meet at the stop in front of the university?',
    collocation: 'an der Haltestelle warten', prep: 'an',
  },
  verspaetung: {
    de: 'Verspätung', article: 'die', plural: 'Verspätungen', en: 'delay', pos: 'noun', domain: 'alltag',
    example_de: 'Der Zug hat heute zwanzig Minuten Verspätung.', example_en: 'The train is twenty minutes late today.',
    collocation: 'Verspätung haben',
  },
  bank1: {
    de: 'Bank', article: 'die', plural: 'Banken', en: 'bank', pos: 'noun', domain: 'amt',
    example_de: 'Die Bank schließt um vier Uhr.', example_en: 'The bank closes at four.',
  },
  bank2: {
    // Homonym: another correct meaning of the same German word.
    de: 'Bank', article: 'die', plural: 'Bänke', en: 'bench', pos: 'noun', domain: 'alltag',
    example_de: 'Wir sitzen auf der Bank im Park.', example_en: 'We sit on the bench in the park.',
  },
  beitrag: {
    de: 'Krankenkassenbeitrag', article: 'der', plural: 'Krankenkassenbeiträge', en: 'health insurance contribution', pos: 'noun', domain: 'amt',
    example_de: 'Der Krankenkassenbeitrag wird monatlich abgebucht.', example_en: 'The health insurance contribution is debited monthly.',
  },
  fenster: { de: 'Fenster', article: 'das', en: 'window', pos: 'noun' }, // thin: only the minimum
  kuemmern: {
    de: 'sich kümmern', en: 'to take care of', pos: 'verb', domain: 'alltag', example_form: 'kümmere',
    example_de: 'Ich kümmere mich morgen um die Wohnung.', example_en: "I'll take care of the flat tomorrow.",
    example_2_de: 'Wer kümmert sich am Wochenende um den Hund?', example_2_en: "Who's looking after the dog at the weekend?",
    example_2_form: 'kümmert', prep: 'um',
  },
  abholen: {
    de: 'abholen', en: 'to pick up', pos: 'verb', domain: 'alltag',
    example_de: 'Kannst du mich um sieben vom Bahnhof abholen?', example_en: 'Can you pick me up from the station at seven?',
    example_2_de: 'Ich habe das Paket gestern bei der Post abgeholt.', example_2_en: 'I picked up the parcel at the post office yesterday.',
    example_2_form: 'abgeholt',
  },
  pruefen: {
    de: 'prüfen', en: 'to check, examine', pos: 'verb', domain: 'arbeit',
    example_de: 'Bitte prüfen Sie die Angaben noch einmal.', example_en: 'Please check the details once more.',
  },
  puenktlich: {
    de: 'pünktlich', en: 'on time', pos: 'adj', domain: 'alltag',
    example_de: 'Der Bus war heute ausnahmsweise pünktlich.', example_en: 'For once the bus was on time today.',
  },
  gemuetlich: { de: 'gemütlich', en: 'cosy', pos: 'adj', domain: 'alltag' },
  klingtgut: {
    de: 'Das klingt gut.', en: 'Sounds good.', pos: 'phrase', tier: 'chunk', domain: 'smalltalk',
    example_de: 'Das klingt gut, ich komme gern mit.', example_en: "Sounds good, I'd love to come along.", example_form: 'Das klingt gut',
  },
  gernegeschehen: { de: 'Gern geschehen.', en: "You're welcome.", pos: 'phrase', tier: 'chunk', domain: 'smalltalk' },
};

let n = 0;
/** A record with a stable id, built through the same path as production. */
export function rec(key: keyof typeof ROWS | Row, over: Row = {}): WordRecord {
  const row = typeof key === 'string' ? ROWS[key]! : key;
  return toWordRecord({ word_id: `w_${String(++n).padStart(8, '0')}`, status: 'active', ...row, ...over });
}

/** The whole sheet, ids assigned in order. */
export function sheet(): WordRecord[] {
  n = 0;
  return Object.keys(ROWS).map((k) => rec(k));
}
export const by = (all: readonly WordRecord[], de: string, en?: string) => all.find((w) => w.de === de && (!en || w.en === en))!;
