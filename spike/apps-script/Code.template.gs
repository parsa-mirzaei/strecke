/**
 * Strecke – Phase 0 spike. Throwaway; not the Phase 1 backend.
 * Build: python tools/phase0/build_spike.py  ->  build/spike/Code.gs (gitignored; it contains
 * the learner context from data/private/learner-context.txt, which must never be committed).
 * Paste build/spike/Code.gs into the test Sheet: Extensions → Apps Script → replace Code.gs.
 *   1. Run setupTestSheet once (authorise when asked).
 *   2. Deploy → New deployment → Web app, execute as Me, access Anyone.
 */

const README_LINES = /*README_LINES*/[];

const NOW = '2026-10-02T12:00:00Z';

const TABS = {
  inbox: [['de', 'article', 'en', 'pos', 'tier', 'domain', 'family', 'cloze_1', 'answer_1', 'hint_1',
    'cloze_2', 'answer_2', 'listen_de', 'listen_en', 'wrong_1', 'wrong_2', 'capture_id',
    'start_stage', 'source', 'run_id', 'status', 'reason', 'word_id']],
  words: [
    ['word_id', 'de', 'article', 'en', 'pos', 'tier', 'domain', 'family', 'start_stage', 'image_url', 'image_ok',
      'source', 'status', 'dedupe_key', 'created_at', 'updated_at'],
    ['w_t0000001', 'Besprechung', 'die', 'meeting', 'noun', 'core', 'arbeit', '', 0, '', '', 'manual', 'active', 'besprechung', NOW, NOW],
    ['w_t0000002', 'Das klingt gut.', '', 'Sounds good.', 'phrase', 'chunk', 'smalltalk', '', 0, '', '', 'manual', 'active', 'das klingt gut.', NOW, NOW],
    ['w_t0000003', 'Vorlesung', 'die', 'lecture', 'noun', 'core', 'uni', '', 0, '', '', 'manual', 'active', 'vorlesung', NOW, NOW],
    ['w_t0000004', 'Termin', 'der', 'appointment', 'noun', 'core', 'amt', '', 0, '', '', 'manual', 'active', 'termin', NOW, NOW],
    ['w_t0000005', 'sich beschweren', '', 'to complain', 'verb', 'core', 'alltag', '', 0, '', '', 'manual', 'rejected', 'sich beschweren', NOW, NOW],
  ],
  word_state: [
    ['word_id', 'stage', 'due_at', 'lapses', 'streak', 'last_seen'],
    ['w_t0000001', 3, '2026-10-04T08:00:00Z', 0, 2, NOW],
    ['w_t0000002', 2, '2026-10-03T08:00:00Z', 3, 0, NOW],
    ['w_t0000003', 4, '2026-10-09T08:00:00Z', 1, 1, NOW],
    ['w_t0000004', 1, '2026-10-02T12:10:00Z', 2, 0, NOW],
  ],
  captures: [
    ['capture_id', 'ts', 'text', 'domain', 'context', 'status'],
    ['c_t0000001', NOW, 'Verspätung', 'alltag', 'heard on the train', 'new'],
    ['c_t0000002', NOW, 'der Termin', 'amt', 'letter from an office', 'new'],
  ],
  config: [
    ['key', 'value'],
    ['new_per_day', 5], ['backlog_pause', 40], ['checkpoint_every', 8],
    ['inbox_max_per_run', 20], ['last_agent_run', ''],
  ],
};

function setupTestSheet() {
  const ss = SpreadsheetApp.getActive();
  const readme = getOrCreate_(ss, 'README');
  readme.clear();
  readme.getRange(1, 1, README_LINES.length, 1).setValues(README_LINES.map(l => [l]));
  readme.setColumnWidth(1, 1100);

  Object.keys(TABS).forEach(name => {
    const sh = getOrCreate_(ss, name);
    sh.clear();
    const rows = TABS[name];
    const width = rows[0].length;
    sh.getRange(1, 1, rows.length, width).setValues(rows.map(r => r.concat(Array(width - r.length).fill(''))));
    sh.getRange(1, 1, 1, width).setFontWeight('bold');
    sh.setFrozenRows(1);
  });

  // Drop the default empty tab.
  ss.getSheets().forEach(sh => {
    if (sh.getName() !== 'README' && !TABS[sh.getName()]) ss.deleteSheet(sh);
  });
  ss.setActiveSheet(readme);
  ss.moveActiveSheet(1);

  // Warning-only protection on the read-only tabs (as in the spec).
  ['words', 'word_state', 'captures', 'config'].forEach(name => {
    const sh = ss.getSheetByName(name);
    sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(p => p.remove());
    sh.protect().setDescription('Strecke: agents write only to inbox').setWarningOnly(true);
  });
}

function getOrCreate_(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

/** Hello-world endpoint for the phone round-trip test. text/plain POST, JSON body. */
function doPost(e) {
  const t0 = Date.now();
  let body = {};
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'Body is not JSON' });
  }
  // Touch the Sheet once so the timing includes a real read, like bootstrap will.
  const rows = SpreadsheetApp.getActive().getSheetByName('words').getLastRow() - 1;
  return json_({ ok: true, echo: body.n || null, words: rows, server_ms: Date.now() - t0, server_time: new Date().toISOString() });
}

function doGet() {
  return json_({ ok: true, hint: 'POST a text/plain JSON body' });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
