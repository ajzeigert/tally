import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { renderInvoiceXlsx } from '../src/xlsx.js';

function withTempDir(fn) {
  return async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tally-xlsx-test-'));
    try {
      await fn(dir);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  };
}

async function readWorkbook(path) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  return wb.worksheets[0];
}

// Collect non-empty cell text of a worksheet into a flat array of strings,
// row by row, for easy "contains" assertions.
function rowTexts(ws) {
  const rows = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const cells = [];
    row.eachCell({ includeEmpty: false }, (cell) => cells.push(cell.value));
    rows.push(cells);
  });
  return rows;
}

const rateData = {
  freelancer: { name: 'Jane Dev', email: 'jane@dev.com', phone: '555-1212', location: 'Portland, OR', payment_terms: 'Net 30' },
  client: 'Acme Corp',
  invoiceNumber: 7,
  periodLabel: 'May 2026',
  generatedDate: '2026-06-01',
  mode: 'rate',
  rate: 150,
  entries: [
    { date: '2026-05-02', hours: 3, description: 'Design', amount: 450 },
    { date: '2026-05-03', hours: 2, description: 'Build', amount: 300 },
  ],
  totalHours: 5,
  totalAmount: 750,
  outstandingBalance: 0,
  paymentTerms: 'Net 30',
};

test('renderInvoiceXlsx: rate mode writes header, line items, and totals', withTempDir(async (dir) => {
  const path = join(dir, 'out.xlsx');
  await renderInvoiceXlsx(rateData, path);
  const ws = await readWorkbook(path);
  const flat = rowTexts(ws).flat().map(String);

  // Header block
  assert.ok(flat.includes('Jane Dev'), 'freelancer name present');
  assert.ok(flat.includes('jane@dev.com'), 'email present');
  assert.ok(flat.includes('Acme Corp'), 'client present');
  assert.ok(flat.some((v) => v.includes('7')), 'invoice number present');
  assert.ok(flat.includes('May 2026'), 'period present');
  assert.ok(flat.includes('2026-06-01'), 'generated date present');

  // Line items
  assert.ok(flat.includes('Design'), 'first description present');
  assert.ok(flat.includes('Build'), 'second description present');

  // A cell holds the numeric total amount 750 with currency format
  let foundTotal = false;
  ws.eachRow((row) => {
    row.eachCell((cell) => {
      if (cell.value === 750 && typeof cell.numFmt === 'string' && cell.numFmt.includes('$')) {
        foundTotal = true;
      }
    });
  });
  assert.ok(foundTotal, 'total amount 750 present as currency-formatted number');
}));

const feeBaseData = {
  freelancer: { name: 'Jane Dev', email: 'jane@dev.com', phone: '555-1212', location: 'Portland, OR', payment_terms: 'Net 15' },
  client: 'Beta LLC',
  invoiceNumber: 9,
  periodLabel: 'May 2026',
  generatedDate: '2026-06-01',
  mode: 'fee',
  fee: 5000,
  totalHours: 12,
  totalAmount: 5000,
  outstandingBalance: 0,
  paymentTerms: 'Net 15',
};

test('renderInvoiceXlsx: fee mode with includeHours shows line items but no per-line amount', withTempDir(async (dir) => {
  const path = join(dir, 'fee-hours.xlsx');
  const data = {
    ...feeBaseData,
    includeHours: true,
    entries: [
      { date: '2026-05-02', hours: 7, description: 'Consulting' },
      { date: '2026-05-09', hours: 5, description: 'Review' },
    ],
  };
  await renderInvoiceXlsx(data, path);
  const ws = await readWorkbook(path);
  const flat = rowTexts(ws).flat().map(String);

  assert.ok(flat.includes('Consulting'), 'line item present');
  assert.ok(flat.includes('Review'), 'line item present');
  // header row should NOT include an Amount column in fee mode
  assert.ok(!flat.includes('Amount'), 'no Amount column header in fee mode');

  // Fee total 5000 present as currency
  let foundFee = false;
  ws.eachRow((row) => row.eachCell((cell) => {
    if (cell.value === 5000 && typeof cell.numFmt === 'string' && cell.numFmt.includes('$')) foundFee = true;
  }));
  assert.ok(foundFee, 'fee total present as currency');
}));

test('renderInvoiceXlsx: fee mode without includeHours has no line items', withTempDir(async (dir) => {
  const path = join(dir, 'fee-nohours.xlsx');
  const data = { ...feeBaseData, includeHours: false, entries: [] };
  await renderInvoiceXlsx(data, path);
  const ws = await readWorkbook(path);
  const flat = rowTexts(ws).flat().map(String);

  assert.ok(!flat.includes('Description'), 'no line-item table header when hours excluded');
  let foundFee = false;
  ws.eachRow((row) => row.eachCell((cell) => {
    if (cell.value === 5000) foundFee = true;
  }));
  assert.ok(foundFee, 'fee total still present');
}));

test('renderInvoiceXlsx: outstanding balance and payment terms appear conditionally', withTempDir(async (dir) => {
  const withBal = join(dir, 'bal.xlsx');
  await renderInvoiceXlsx({ ...rateData, outstandingBalance: 200 }, withBal);
  let ws = await readWorkbook(withBal);
  let flat = rowTexts(ws).flat().map(String);
  assert.ok(flat.some((v) => v.toLowerCase().includes('outstanding')), 'outstanding label present');
  assert.ok(flat.some((v) => v.toLowerCase().includes('payment terms') || v.includes('Net 30')), 'payment terms present');

  const noBal = join(dir, 'nobal.xlsx');
  await renderInvoiceXlsx({ ...rateData, outstandingBalance: 0 }, noBal);
  ws = await readWorkbook(noBal);
  flat = rowTexts(ws).flat().map(String);
  assert.ok(!flat.some((v) => v.toLowerCase().includes('outstanding')), 'no outstanding row when balance is 0');
}));
