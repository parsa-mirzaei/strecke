/**
 * Strecke Inbox setup. Run once, signed in as the VAULT account (the Inbox owner).
 * Paste into the Inbox spreadsheet: Extensions → Apps Script → replace Code.gs → Run setupInbox.
 *
 * Creates the five Inbox tabs and locks everything except the agent columns A:T of `inbox`
 * (rows 2+) against every editor. The agent's account is an editor, not the owner, so these
 * protections are a real control (unlike Phase 0, where the agent acted as the owner).
 * No doGet/doPost: this script never becomes a web endpoint.
 * @OnlyCurrentDoc
 */

// Must equal INBOX_COLUMNS in core/src/schema.ts (checked by core/test/apps-script.test.ts).
const INBOX_COLUMNS = [
  'de', 'article', 'en', 'pos', 'tier', 'domain', 'family', 'cloze_1', 'answer_1', 'hint_1',
  'cloze_2', 'answer_2', 'listen_de', 'listen_en', 'wrong_1', 'wrong_2', 'capture_id',
  'start_stage', 'source', 'run_id', 'status', 'reason', 'word_id',
];
const AGENT_RANGE = 'A2:T5000'; // the only cells an editor may change

const TABS = {
  contract: [['STRECKE AGENT CONTRACT v1: published by the Phase 1 setup from agents/contract.md.']],
  status: [['key', 'value'], ['pending', '0'], ['open_captures', '0'], ['favour_domains', '']],
  keys: [['dedupe_key']],
  captures_open: [['capture_id', 'text', 'domain']],
  inbox: [INBOX_COLUMNS],
};

function setupInbox() {
  const ss = SpreadsheetApp.getActive();
  const me = Session.getEffectiveUser();
  if (ss.getOwner() && ss.getOwner().getEmail() !== me.getEmail()) {
    throw new Error('Run this as the spreadsheet owner (the vault account).');
  }

  Object.keys(TABS).forEach((name) => {
    const sh = ss.getSheetByName(name) || ss.insertSheet(name);
    const rows = TABS[name];
    const width = rows[0].length;
    if (name !== 'inbox' || sh.getLastRow() === 0) sh.clearContents();
    sh.getRange(1, 1, rows.length, width).setValues(rows.map((r) => r.concat(Array(width - r.length).fill(''))));
    sh.getRange(1, 1, 1, width).setFontWeight('bold');
    sh.setFrozenRows(1);
  });
  ss.getSheets().forEach((sh) => { if (!TABS[sh.getName()]) ss.deleteSheet(sh); });

  Object.keys(TABS).forEach((name) => {
    const sh = ss.getSheetByName(name);
    sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach((p) => p.remove());
    sh.getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach((p) => p.remove());
    const p = sh.protect().setDescription('Strecke: owner only' + (name === 'inbox' ? ' (agents: A:T rows 2+)' : ''));
    if (name === 'inbox') p.setUnprotectedRanges([sh.getRange(AGENT_RANGE)]);
    p.addEditor(me);
    p.removeEditors(p.getEditors().filter((u) => u.getEmail() !== me.getEmail()));
    if (p.canDomainEdit()) p.setDomainEdit(false);
  });
  Logger.log('Inbox ready: %s tabs, agent range inbox!%s', Object.keys(TABS).length, AGENT_RANGE);
}
