import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { INBOX_COLUMNS } from '../src/schema.ts';

const src = readFileSync('apps-script/inbox-setup.gs', 'utf8');

describe('apps-script/inbox-setup.gs', () => {
  it('uses the same Inbox columns as the importer', () => {
    const block = src.slice(src.indexOf('const INBOX_COLUMNS = ['), src.indexOf('];', src.indexOf('const INBOX_COLUMNS = [')));
    const cols = [...block.matchAll(/'([a-z_0-9]+)'/g)].map((m) => m[1]);
    expect(cols).toEqual([...INBOX_COLUMNS]);
  });
  it('leaves exactly the agent columns A:X editable (24 = agent columns, Y:AA reserved)', () => {
    expect(src).toContain("const AGENT_RANGE = 'A2:X5000'");
    expect(INBOX_COLUMNS.indexOf('run_id')).toBe(23); // column X
    expect(INBOX_COLUMNS.slice(24)).toEqual(['status', 'reason', 'word_id']);
  });
  it('never exposes a web endpoint', () => {
    expect(src).not.toMatch(/function\s+do(Get|Post)\s*\(/);
  });
});
