import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTimesheet, filterByRange } from '../src/timesheet.js';

// --- validation ---

test('parseTimesheet: missing mode throws', () => {
  assert.throws(
    () => parseTimesheet('client: Acme\nrate: 75\nentries: []\n'),
    /missing required field: mode/
  );
});

test('parseTimesheet: invalid mode throws', () => {
  assert.throws(
    () => parseTimesheet('client: Acme\nmode: hourly\nrate: 75\nentries: []\n'),
    /mode must be 'rate' or 'fee'/
  );
});

test('parseTimesheet: mode=rate without rate field throws', () => {
  assert.throws(
    () => parseTimesheet('client: Acme\nmode: rate\nentries: []\n'),
    /missing required field: rate/
  );
});

test('parseTimesheet: mode=fee without fee field throws', () => {
  assert.throws(
    () => parseTimesheet('client: Acme\nmode: fee\nentries: []\n'),
    /missing required field: fee/
  );
});

// --- rate mode ---

test('parseTimesheet: rate mode returns correct shape', () => {
  const ts = parseTimesheet(`
client: Acme Corp
mode: rate
rate: 75
entries:
  - date: 2026-05-01
    hours: 2
    description: API work
`);
  assert.equal(ts.client, 'Acme Corp');
  assert.equal(ts.mode, 'rate');
  assert.equal(ts.rate, 75);
  assert.deepEqual(ts.overrides, {});
  assert.equal(ts.entries.length, 1);
  assert.equal(ts.entries[0].hours, 2);
  assert.equal(ts.entries[0].description, 'API work');
  assert.equal(ts.entries[0].project, undefined);
  assert.ok(!('fee' in ts), 'fee should not be present in rate mode');
});

// --- fee mode ---

test('parseTimesheet: fee mode returns correct shape', () => {
  const ts = parseTimesheet(`
client: Acme Corp
mode: fee
fee: 5000
entries:
  - date: 2026-05-01
    hours: 3
    description: Research
`);
  assert.equal(ts.mode, 'fee');
  assert.equal(ts.fee, 5000);
  assert.ok(!('rate' in ts), 'rate should not be present in fee mode');
});

// --- overrides ---

test('parseTimesheet: extracts top-level overrides', () => {
  const ts = parseTimesheet(`
client: Acme Corp
mode: rate
rate: 75
payment_terms: Net 15
name: Andy DBA LLC
entries: []
`);
  assert.deepEqual(ts.overrides, { payment_terms: 'Net 15', name: 'Andy DBA LLC' });
});

test('parseTimesheet: ignores project field on entries', () => {
  const ts = parseTimesheet(`
client: Acme Corp
mode: rate
rate: 75
entries:
  - date: 2026-05-01
    hours: 1
    description: Work
    project: Backend
`);
  assert.equal(ts.entries[0].project, undefined);
});

// --- filterByRange ---

test('filterByRange: returns entries within inclusive date range', () => {
  const entries = [
    { date: '2026-04-30', hours: 1, description: 'before' },
    { date: '2026-05-01', hours: 2, description: 'start' },
    { date: '2026-05-15', hours: 3, description: 'middle' },
    { date: '2026-05-31', hours: 4, description: 'end' },
    { date: '2026-06-01', hours: 5, description: 'after' },
  ];
  const result = filterByRange(entries, '2026-05-01', '2026-05-31');
  assert.equal(result.length, 3);
  assert.deepEqual(result.map(e => e.description), ['start', 'middle', 'end']);
});

test('filterByRange: returns empty array when no entries match', () => {
  const entries = [
    { date: '2026-04-01', hours: 1, description: 'old' },
  ];
  assert.deepEqual(filterByRange(entries, '2026-05-01', '2026-05-31'), []);
});
