/**
 * Stress fixture (round 3): a synthetic sheet with adversarial content, committed on purpose so the layout,
 * the ingestion and the exercise generator are tested on messy data. General A2–B1 German, no learner data.
 * Used by core tests, the Playwright layout checks and the dev URL `?sheet=stress|stress3|stress500`.
 */

export const STRESS_HEADER = ['Wort', 'Artikel', 'Mehrzahl', 'Bedeutung', 'Wortart', 'Thema', 'Beispielsatz', 'Übersetzung', 'Beispiel 2', 'Beispiel 2 Übersetzung', 'Kollokation', 'Präposition', 'Notiz', 'Lernstand (eigene Spalte)'];

const LONG_SENTENCE = 'Wenn du morgen früh vor der Arbeit noch schnell zur Apotheke gehst, kannst du mir bitte die Tabletten gegen Kopfschmerzen mitbringen, die ich letzte Woche bestellt habe?';
const LONG_EN = 'If you go to the pharmacy quickly tomorrow morning before work, could you please bring me the headache tablets I ordered last week?';

/** Hand-written adversarial rows. Each comment names the case. */
export const STRESS_ROWS: string[][] = [
  // 36-character compound, long meaning, long sentence
  ['Krankenversicherungsbeitragsbescheid', 'der', 'Krankenversicherungsbeitragsbescheide', 'notice of the health insurance contribution you have to pay every month', 'Nomen', 'Amt',
    'Der Krankenversicherungsbeitragsbescheid kam heute mit der Post und ich verstehe ihn leider überhaupt nicht.', 'The notice about the health insurance contribution came in the post today and unfortunately I do not understand it at all.', '', '', '', '', '', 'x'],
  ['Arbeitsunfähigkeitsbescheinigung', 'die', 'Arbeitsunfähigkeitsbescheinigungen', 'a certificate from a doctor confirming that you are unable to work, needed by your employer and your health insurance', 'noun', 'arbeit',
    'Ohne Arbeitsunfähigkeitsbescheinigung darf ich nicht zu Hause bleiben.', 'Without a sick note I am not allowed to stay at home.', 'Die Arbeitsunfähigkeitsbescheinigung habe ich schon an meine Chefin geschickt.', 'I have already sent the sick note to my boss.', '', '', '', ''],
  ['Straßenbahnhaltestelle', 'die', 'Straßenbahnhaltestellen', 'tram stop', 'noun', 'alltag', 'Die Straßenbahnhaltestelle ist direkt vor dem Haus.', 'The tram stop is right in front of the house.', '', '', 'an der Straßenbahnhaltestelle warten', 'an', '', ''],
  // multi-word phrases and a very long chunk
  ['Könnten Sie das bitte noch einmal langsam wiederholen?', '', '', 'Could you please repeat that slowly once more?', 'phrase', 'smalltalk',
    'Entschuldigung, ich habe Sie nicht verstanden. Könnten Sie das bitte noch einmal langsam wiederholen?', "Sorry, I didn't understand you. Could you please repeat that slowly once more?", '', '', '', '', '', ''],
  ['Na ja / so lala', '', '', 'so-so, not great / not terrible', 'phrase', 'smalltalk', '„Wie war der Film?“ – „Na ja / so lala.“', '"How was the film?" – "So-so."', '', '', '', '', '', ''],
  ['Wie bitte?', '', '', 'Pardon?', 'Ausdruck', 'smalltalk', 'Wie bitte? Es ist hier sehr laut.', "Pardon? It's very loud here.", '', '', '', '', '', ''],
  // 25+ word example
  ['mitbringen', '', '', 'to bring along', 'verb', 'alltag', LONG_SENTENCE, LONG_EN, '', '', '', '', 'trennbar: ich bringe … mit', ''],
  // umlauts, ß
  ['übermäßig', '', '', 'excessive(ly)', 'adj', 'alltag', 'Er isst übermäßig viel Süßes.', 'He eats far too many sweets.', '', '', '', '', '', ''],
  ['Größe', 'die', 'Größen', 'size', 'noun', 'alltag', 'Haben Sie diese Hose auch in meiner Größe?', 'Do you have these trousers in my size too?', 'Welche Größe brauchst du?', 'What size do you need?', '', '', '', ''],
  // missing example, missing article, missing plural
  ['Fenster', 'das', '', 'window', 'noun', 'alltag', '', '', '', '', '', '', '', ''],
  ['Schrank', '', 'Schränke', 'cupboard, wardrobe', 'noun', 'alltag', 'Der Schrank ist zu groß für das Zimmer.', 'The wardrobe is too big for the room.', '', '', '', '', '', ''],
  ['Rechnung', 'die', '', 'bill, invoice', 'noun', 'alltag', 'Können wir bitte die Rechnung haben?', 'Could we have the bill, please?', '', '', 'eine Rechnung bezahlen', '', '', ''],
  // duplicates: an exact duplicate and a homonym
  ['Bank', 'die', 'Banken', 'bank', 'noun', 'amt', 'Die Bank schließt um vier.', 'The bank closes at four.', '', '', '', '', '', ''],
  ['Bank', 'die', 'Bänke', 'bench', 'noun', 'alltag', 'Wir sitzen auf der Bank im Park.', 'We sit on the bench in the park.', '', '', '', '', '', ''],
  ['Bank', 'die', 'Banken', 'bank', 'noun', 'amt', 'Die Bank schließt um vier.', 'The bank closes at four.', '', '', '', '', '', ''],
  // one-letter word
  ['A', 'das', '', 'the letter A', 'noun', '', 'Das A kommt im Alphabet zuerst.', 'A comes first in the alphabet.', '', '', '', '', '', ''],
  // quotes, slashes; an emoji the app cannot show (that cell is dropped, the row survives)
  ['Feierabend', 'der', 'Feierabende', 'end of the working day / time off', 'noun', 'arbeit', 'Endlich „Feierabend“! Jetzt gehe ich nach Hause.', 'Finally "end of work"! Now I am going home.', '', '', 'Feierabend machen', '', 'Note: Super 👍', ''],
  ['klasse', '', '', 'great 👍', 'adj', 'smalltalk', 'Das ist klasse!', "That's great!", '', '', '', '', '', ''],
  // more ordinary rows so distractors exist
  ['Termin', 'der', 'Termine', 'appointment', 'noun', 'amt', 'Ich habe morgen einen Termin beim Arzt.', "I have a doctor's appointment tomorrow.", 'Können wir den Termin verschieben?', 'Can we move the appointment?', 'einen Termin vereinbaren', '', '', ''],
  ['Verspätung', 'die', 'Verspätungen', 'delay', 'noun', 'alltag', 'Der Zug hat zwanzig Minuten Verspätung.', 'The train is twenty minutes late.', '', '', 'Verspätung haben', '', '', ''],
  ['Ausweis', 'der', 'Ausweise', 'ID card', 'noun', 'amt', 'Bitte zeigen Sie Ihren Ausweis.', 'Please show your ID.', '', '', 'einen Ausweis beantragen', '', '', ''],
  ['abholen', '', '', 'to pick up', 'verb', 'alltag', 'Kannst du mich vom Bahnhof abholen?', 'Can you pick me up from the station?', 'Ich habe das Paket abgeholt.', 'I picked up the parcel.', '', '', '', ''],
  ['sich kümmern', '', '', 'to take care of', 'verb', 'alltag', 'Ich kümmere mich um die Wohnung.', "I'll take care of the flat.", '', '', '', 'um', '', ''],
  ['pünktlich', '', '', 'on time', 'adj', 'alltag', 'Der Bus war heute pünktlich.', 'The bus was on time today.', '', '', '', '', '', ''],
  ['zuständig', '', '', 'responsible (for)', 'adj', 'amt', 'Wer ist hier für die Anmeldung zuständig?', 'Who is responsible for registration here?', '', '', 'zuständig für', 'für', '', ''],
  ['Geht klar.', '', '', 'Sure. / OK.', 'phrase', 'smalltalk', '„Bringst du Brot mit?“ – „Geht klar.“', '"Will you bring bread?" – "Sure."', '', '', '', '', '', ''],
  // a row without meaning: skipped and listed
  ['Kühlschrank', 'der', 'Kühlschränke', '', 'noun', 'alltag', '', '', '', '', '', '', '', ''],
];

/** The adversarial sheet: header + rows. */
export function stressTable(): string[][] {
  return [STRESS_HEADER, ...STRESS_ROWS];
}

/** Only three rows (the smallest useful sheet). */
export function tinyTable(): string[][] {
  return [STRESS_HEADER, STRESS_ROWS[18]!, STRESS_ROWS[19]!, STRESS_ROWS[20]!];
}

const SYL = ['ber', 'ka', 'lo', 'mun', 'sel', 'ti', 'dra', 'fen', 'gu', 'hol', 'ri', 'sto', 'wa', 'zei', 'nu', 'pa', 'qu', 'ver', 'mi', 'son'];
const lettersOf = (k: number) => { let x = k + 1, out = ''; while (x > 0) { out = String.fromCharCode(97 + (x % 26)) + out; x = Math.floor(x / 26); } return out; };

/** A large sheet: the adversarial rows plus synthetic pseudo-words up to `n` rows. */
export function bigTable(n = 500): string[][] {
  const rows = [...STRESS_ROWS];
  const arts = ['der', 'die', 'das'];
  for (let k = 0; rows.length < n; k++) {
    const stem = SYL[k % 20]! + SYL[Math.floor(k / 20) % 20]! + SYL[(k * 7 + 3) % 20]!;
    const kind = k % 5;
    const de = kind < 2 ? stem[0]!.toUpperCase() + stem.slice(1) + 'ung' : kind === 2 ? `${stem}en` : kind === 3 ? `${stem}lich` : `Na ${stem}, gut.`;
    const art = kind < 2 ? arts[k % 3]! : '';
    const gloss = `${lettersOf(k)}${lettersOf(k)} thing`;
    const ex = k % 4 !== 0;
    rows.push([de, art, kind < 2 && k % 2 ? `${de}en` : '', gloss, kind < 2 ? 'noun' : kind === 2 ? 'verb' : kind === 3 ? 'adj' : 'phrase', ['arbeit', 'uni', 'amt', 'alltag', 'smalltalk'][k % 5]!,
      ex ? `Gestern habe ich ${de} im Büro ${lettersOf(k)} gesehen.` : '', ex ? `Yesterday I saw it at the office ${lettersOf(k)}.` : '', '', '', '', '', '', '']);
  }
  return [STRESS_HEADER, ...rows];
}
