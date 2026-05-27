import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { filterByClient, migrateLocalHistory, loadHistory, saveHistory, deleteInvoice, editInvoice } from '../src/history.js';

function withTempDir(fn) {
  return async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tally-history-test-'));
    try {
      await fn(dir);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  };
}

// --- filterByClient ---

test('filterByClient: returns only invoices matching client slug', () => {
  const history = {
    invoices: [
      { number: 1, client: 'acme-corp', dirs: ['/a'], period: 'month 2026-04', generated: '2026-04-30', total: 1000, status: 'unpaid', file: 'a.pdf' },
      { number: 2, client: 'beta-llc', dirs: ['/b'], period: 'month 2026-04', generated: '2026-04-30', total: 2000, status: 'unpaid', file: 'b.pdf' },
      { number: 3, client: 'acme-corp', dirs: ['/a'], period: 'month 2026-05', generated: '2026-05-31', total: 1500, status: 'paid', file: 'c.pdf' },
    ],
  };
  const result = filterByClient(history, 'acme-corp');
  assert.equal(result.invoices.length, 2);
  assert.deepEqual(result.invoices.map(i => i.number), [1, 3]);
});

test('filterByClient: returns empty invoices array when no match', () => {
  const history = { invoices: [] };
  const result = filterByClient(history, 'nobody');
  assert.deepEqual(result.invoices, []);
});

// --- migrateLocalHistory ---

test('migrateLocalHistory: migrates records from local file into global file', withTempDir(async (dir) => {
  const localPath = join(dir, 'tally-history.yml');
  const globalPath = join(dir, 'global-history.yml');

  writeFileSync(localPath, [
    'invoices:',
    '  - number: 1',
    "    period: 'month 2026-04'",
    "    generated: '2026-04-30'",
    '    total: 1000',
    '    status: unpaid',
    '    file: acme-month-2026-04.pdf',
  ].join('\n'));

  await migrateLocalHistory(globalPath, localPath, 'acme-corp', '/repo/acme');

  const global = await loadHistory(globalPath);
  assert.equal(global.invoices.length, 1);
  assert.equal(global.invoices[0].client, 'acme-corp');
  assert.deepEqual(global.invoices[0].dirs, ['/repo/acme']);
  assert.equal(global.invoices[0].number, 1);
}));

test('migrateLocalHistory: skips records already in global history', withTempDir(async (dir) => {
  const localPath = join(dir, 'tally-history.yml');
  const globalPath = join(dir, 'global-history.yml');

  writeFileSync(localPath, [
    'invoices:',
    '  - number: 1',
    "    period: 'month 2026-04'",
    "    generated: '2026-04-30'",
    '    total: 1000',
    '    status: unpaid',
    '    file: acme-month-2026-04.pdf',
  ].join('\n'));

  const existing = {
    invoices: [{
      number: 1, client: 'acme-corp', dirs: ['/repo/acme'],
      period: 'month 2026-04', generated: '2026-04-30',
      total: 1000, status: 'unpaid', file: 'acme-month-2026-04.pdf',
    }],
  };
  await saveHistory(globalPath, existing);

  await migrateLocalHistory(globalPath, localPath, 'acme-corp', '/repo/acme');

  const global = await loadHistory(globalPath);
  assert.equal(global.invoices.length, 1);
}));

test('migrateLocalHistory: no-op when local file does not exist', withTempDir(async (dir) => {
  const localPath = join(dir, 'nonexistent.yml');
  const globalPath = join(dir, 'global-history.yml');

  await migrateLocalHistory(globalPath, localPath, 'acme-corp', dir);

  const global = await loadHistory(globalPath);
  assert.deepEqual(global.invoices, []);
}));

// --- deleteInvoice ---

test('deleteInvoice: removes invoice by number and returns updated history', () => {
  const history = {
    invoices: [
      { number: 1, client: 'acme', dirs: [], period: 'month 2026-04', generated: '2026-04-30', total: 1000, status: 'unpaid', file: 'a.pdf' },
      { number: 2, client: 'acme', dirs: [], period: 'month 2026-05', generated: '2026-05-31', total: 2000, status: 'unpaid', file: 'b.pdf' },
    ],
  };
  const result = deleteInvoice(history, 1);
  assert.equal(result.invoices.length, 1);
  assert.equal(result.invoices[0].number, 2);
});

test('deleteInvoice: returns null when invoice number not found', () => {
  const history = { invoices: [] };
  const result = deleteInvoice(history, 99);
  assert.equal(result, null);
});

test('deleteInvoice: does not mutate original history', () => {
  const history = {
    invoices: [
      { number: 1, client: 'acme', dirs: [], period: 'month 2026-04', generated: '2026-04-30', total: 1000, status: 'unpaid', file: 'a.pdf' },
    ],
  };
  deleteInvoice(history, 1);
  assert.equal(history.invoices.length, 1);
});

// --- editInvoice ---

test('editInvoice: updates total on matching invoice', () => {
  const history = {
    invoices: [
      { number: 1, client: 'acme', dirs: [], period: 'month 2026-04', generated: '2026-04-30', total: 1000, status: 'unpaid', file: 'a.pdf' },
    ],
  };
  const result = editInvoice(history, 1, { total: 1500 });
  assert.equal(result.invoices[0].total, 1500);
});

test('editInvoice: returns null when invoice number not found', () => {
  const history = { invoices: [] };
  const result = editInvoice(history, 99, { total: 500 });
  assert.equal(result, null);
});

test('editInvoice: does not mutate original history', () => {
  const history = {
    invoices: [
      { number: 1, client: 'acme', dirs: [], period: 'month 2026-04', generated: '2026-04-30', total: 1000, status: 'unpaid', file: 'a.pdf' },
    ],
  };
  editInvoice(history, 1, { total: 9999 });
  assert.equal(history.invoices[0].total, 1000);
});
