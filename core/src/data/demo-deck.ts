/**
 * Demo deck (DECISIONS D13, D47): synthetic, general A2–B1 everyday German, committed on purpose so a
 * visitor can try the app without a Sheet. No learner data. Same record layout as the Sheet; one row
 * is deliberately thin (only `de`, `article`, `en`). `start_stage` spreads the deck over the ladder so
 * a first visit already shows several exercise types.
 */
import type { Row } from '../schema.ts';

type DemoRow = Partial<Record<
  | 'de' | 'article' | 'plural' | 'en' | 'pos' | 'tier' | 'domain' | 'example_de' | 'example_en' | 'example_form'
  | 'example_2_de' | 'example_2_en' | 'example_2_form' | 'collocation' | 'prep' | 'note' | 'wrong_1' | 'wrong_2'
  | 'image_key' | 'start_stage', string>>;

const ROWS: DemoRow[] = [
  // alltag
  { de: 'Haltestelle', article: 'die', plural: 'Haltestellen', en: 'stop (bus, tram)', pos: 'noun', domain: 'alltag',
    example_de: 'Wir steigen an der nächsten Haltestelle aus.', example_en: 'We get off at the next stop.',
    example_2_de: 'Treffen wir uns an der Haltestelle vor der Uni?', example_2_en: 'Shall we meet at the stop in front of the university?',
    collocation: 'an der Haltestelle warten', prep: 'an', image_key: 'bus' },
  { de: 'Rechnung', article: 'die', plural: 'Rechnungen', en: 'bill, invoice', pos: 'noun', domain: 'alltag',
    example_de: 'Können wir bitte die Rechnung haben?', example_en: 'Could we have the bill, please?',
    example_2_de: 'Die Rechnung für den Strom kommt jeden Monat per Post.', example_2_en: 'The electricity bill comes by post every month.',
    image_key: 'receipt', start_stage: '1' },
  { de: 'Verspätung', article: 'die', plural: 'Verspätungen', en: 'delay', pos: 'noun', domain: 'alltag',
    example_de: 'Der Zug hat heute zwanzig Minuten Verspätung.', example_en: 'The train is twenty minutes late today.',
    example_2_de: 'Entschuldigung für die Verspätung, der Bus kam nicht.', example_2_en: "Sorry I'm late, the bus didn't come.",
    collocation: 'Verspätung haben' },
  { de: 'sich kümmern', en: 'to take care of', pos: 'verb', domain: 'alltag',
    example_de: 'Ich kümmere mich morgen um die Wohnung.', example_en: "I'll take care of the flat tomorrow.", example_form: 'kümmere',
    example_2_de: 'Wer kümmert sich am Wochenende um den Hund?', example_2_en: "Who's looking after the dog at the weekend?", example_2_form: 'kümmert',
    prep: 'um', note: 'sich kümmern um (Akkusativ)' },
  { de: 'abholen', en: 'to pick up', pos: 'verb', domain: 'alltag',
    example_de: 'Kannst du mich um sieben vom Bahnhof abholen?', example_en: 'Can you pick me up from the station at seven?',
    example_2_de: 'Ich habe das Paket gestern bei der Post abgeholt.', example_2_en: 'I picked up the parcel at the post office yesterday.', example_2_form: 'abgeholt',
    start_stage: '1' },
  { de: 'pünktlich', en: 'on time, punctual', pos: 'adj', domain: 'alltag',
    example_de: 'Der Bus war heute ausnahmsweise pünktlich.', example_en: 'For once the bus was on time today.',
    example_2_de: 'Bitte sei pünktlich, die Prüfung beginnt um acht.', example_2_en: 'Please be on time, the exam starts at eight.',
    start_stage: '2' },
  { de: 'Schlüssel', article: 'der', en: 'key' },
  // amt
  { de: 'Termin', article: 'der', plural: 'Termine', en: 'appointment', pos: 'noun', domain: 'amt',
    example_de: 'Ich habe morgen einen Termin beim Bürgeramt.', example_en: 'I have an appointment at the citizens’ office tomorrow.',
    example_2_de: 'Können wir den Termin auf Freitag verschieben?', example_2_en: 'Can we move the appointment to Friday?',
    collocation: 'einen Termin vereinbaren', image_key: 'calendar', start_stage: '2' },
  { de: 'Ausweis', article: 'der', plural: 'Ausweise', en: 'ID card', pos: 'noun', domain: 'amt',
    example_de: 'Bitte zeigen Sie mir Ihren Ausweis.', example_en: 'Please show me your ID.',
    example_2_de: 'Ich habe meinen Ausweis zu Hause vergessen.', example_2_en: 'I left my ID at home.',
    image_key: 'id-card' },
  // arbeit
  { de: 'Besprechung', article: 'die', plural: 'Besprechungen', en: 'meeting', pos: 'noun', domain: 'arbeit',
    example_de: 'Die Besprechung fängt um zehn Uhr an.', example_en: 'The meeting starts at ten.',
    example_2_de: 'Ich bin gerade in einer Besprechung, ich rufe zurück.', example_2_en: "I'm in a meeting right now, I'll call back.",
    start_stage: '1' },
  { de: 'vereinbaren', en: 'to arrange, to agree on', pos: 'verb', domain: 'arbeit',
    example_de: 'Ich möchte gern einen Termin vereinbaren.', example_en: "I'd like to arrange an appointment.",
    example_2_de: 'Wir haben vereinbart, dass ich die Präsentation mache.', example_2_en: "We agreed that I'll do the presentation.", example_2_form: 'vereinbart',
    collocation: 'einen Termin vereinbaren', start_stage: '2' },
  { de: 'zuständig', en: 'responsible, in charge', pos: 'adj', domain: 'arbeit',
    example_de: 'Wer ist hier für die Anmeldung zuständig?', example_en: "Who's in charge of registration here?",
    example_2_de: 'Dafür bin ich leider nicht zuständig.', example_2_en: "I'm afraid I'm not responsible for that.",
    prep: 'für', note: 'zuständig für (Akkusativ)', wrong_1: 'available', wrong_2: 'expensive', start_stage: '1' },
  { de: 'Moment, ich überlege kurz.', en: 'One moment, let me think.', pos: 'phrase', domain: 'arbeit',
    example_de: 'Moment, ich überlege kurz. Ja, Dienstag passt.', example_en: 'One moment, let me think. Yes, Tuesday works.',
    example_2_de: 'Gute Frage. Moment, ich überlege kurz.', example_2_en: 'Good question. One moment, let me think.' },
  { de: 'Ich melde mich später.', en: "I'll get back to you later.", pos: 'phrase', domain: 'arbeit',
    example_de: 'Ich habe gerade keine Zeit. Ich melde mich später.', example_en: "I don't have time right now. I'll get back to you later.",
    example_2_de: '„Passt dir Freitag?“ – „Weiß ich noch nicht, ich melde mich später.“', example_2_en: '“Does Friday suit you?” – “Don’t know yet, I’ll get back to you later.”',
    example_2_form: 'ich melde mich später.', start_stage: '1' },
  // uni
  { de: 'Prüfung', article: 'die', plural: 'Prüfungen', en: 'exam', pos: 'noun', domain: 'uni',
    example_de: 'Die Prüfung ist am Montag um acht Uhr.', example_en: 'The exam is on Monday at eight.',
    example_2_de: 'Hast du die Prüfung bestanden?', example_2_en: 'Did you pass the exam?',
    collocation: 'eine Prüfung bestehen', note: 'eine Prüfung bestehen: to pass an exam' },
  { de: 'sich anmelden', en: 'to register, to sign up', pos: 'verb', domain: 'uni',
    example_de: 'Bis Freitag musst du dich für den Kurs anmelden.', example_en: 'You have to sign up for the course by Friday.', example_form: 'anmelden',
    example_2_de: 'Ich habe mich beim Bürgeramt angemeldet.', example_2_en: 'I registered at the citizens’ office.', example_2_form: 'angemeldet',
    prep: 'für', note: 'für einen Kurs, bei einem Amt' },
  // smalltalk
  { de: 'müde', en: 'tired', pos: 'adj', domain: 'smalltalk',
    example_de: 'Ich bin heute total müde.', example_en: "I'm totally tired today.",
    example_2_de: 'Nach dem Umzug waren wir alle sehr müde.', example_2_en: 'After the move we were all very tired.' },
  { de: 'Wie meinst du das?', en: 'What do you mean?', pos: 'phrase', domain: 'smalltalk',
    example_de: 'Wie meinst du das? Ich verstehe es noch nicht ganz.', example_en: "What do you mean? I don't quite get it yet.",
    example_2_de: '„Das Meeting war interessant.“ – „Hm, wie meinst du das?“', example_2_en: '“The meeting was interesting.” – “Hm, what do you mean?”',
    example_2_form: 'wie meinst du das?', wrong_1: 'How are you?', wrong_2: 'What do you think?' },
  { de: 'Kannst du das bitte wiederholen?', en: 'Can you repeat that, please?', pos: 'phrase', domain: 'smalltalk',
    example_de: 'Entschuldigung, kannst du das bitte wiederholen?', example_en: 'Sorry, can you repeat that, please?', example_form: 'kannst du das bitte wiederholen?',
    example_2_de: 'Das ging zu schnell. Kannst du das bitte wiederholen?', example_2_en: 'That was too fast. Can you repeat that, please?',
    start_stage: '1' },
  { de: 'Ich bin mir nicht sicher.', en: "I'm not sure.", pos: 'phrase', domain: 'smalltalk',
    example_de: 'Ich bin mir nicht sicher, ob der Laden heute offen hat.', example_en: "I'm not sure whether the shop is open today.", example_form: 'Ich bin mir nicht sicher',
    example_2_de: '„Kommst du am Samstag?“ – „Ich bin mir nicht sicher.“', example_2_en: '“Are you coming on Saturday?” – “I’m not sure.”' },
  { de: 'Das klingt gut.', en: 'Sounds good.', pos: 'phrase', domain: 'smalltalk',
    example_de: 'Pizza heute Abend? Das klingt gut.', example_en: 'Pizza tonight? Sounds good.',
    example_2_de: 'Das klingt gut, dann machen wir es so.', example_2_en: "Sounds good, then let's do it that way.", example_2_form: 'Das klingt gut',
    start_stage: '2' },
];

const COLUMNS = ['de', 'article', 'plural', 'en', 'pos', 'tier', 'domain', 'example_de', 'example_en', 'example_form',
  'example_2_de', 'example_2_en', 'example_2_form', 'collocation', 'prep', 'note', 'wrong_1', 'wrong_2', 'image_key', 'start_stage'] as const;

/** The deck as Core-shaped `words` rows (ids `w_demo0001` …, all active, source `seed`). */
export const DEMO_WORDS: Row[] = ROWS.map((r, i) => {
  const row: Row = Object.fromEntries(COLUMNS.map((c) => [c, r[c] ?? '']));
  const pos = row.pos || (row.article ? 'noun' : '');
  return {
    ...row,
    word_id: `w_demo${String(i + 1).padStart(4, '0')}`,
    pos,
    tier: row.tier || (pos === 'phrase' ? 'chunk' : 'core'),
    start_stage: row.start_stage || '0',
    status: 'active',
    source: 'seed',
  };
});
