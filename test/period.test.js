import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePeriod } from '../src/period.js';

const FIXED_NOW = new Date('2026-05-25T00:00:00');

test('resolvePeriod: explicit date range', () => {
  const r = resolvePeriod('2026-05-01,2026-05-31', FIXED_NOW);
  assert.equal(r.start, '2026-05-01');
  assert.equal(r.end, '2026-05-31');
  assert.equal(r.label, 'range 2026-05-01,2026-05-31');
  assert.equal(typeof r.humanLabel, 'string');
});

test('resolvePeriod: YYYY-MM expands to full month', () => {
  const r = resolvePeriod('2026-05', FIXED_NOW);
  assert.equal(r.start, '2026-05-01');
  assert.equal(r.end, '2026-05-31');
  assert.equal(r.label, 'month 2026-05');
  assert.match(r.humanLabel, /May 2026/);
});

test('resolvePeriod: YYYY-MM handles 30-day month', () => {
  const r = resolvePeriod('2026-04', FIXED_NOW);
  assert.equal(r.start, '2026-04-01');
  assert.equal(r.end, '2026-04-30');
});

test('resolvePeriod: YYYY-MM handles February non-leap year', () => {
  const r = resolvePeriod('2026-02', FIXED_NOW);
  assert.equal(r.start, '2026-02-01');
  assert.equal(r.end, '2026-02-28');
});

test('resolvePeriod: this-month', () => {
  const r = resolvePeriod('this-month', FIXED_NOW);
  assert.equal(r.start, '2026-05-01');
  assert.equal(r.end, '2026-05-31');
  assert.equal(r.label, 'month 2026-05');
});

test('resolvePeriod: last-month', () => {
  const r = resolvePeriod('last-month', FIXED_NOW);
  assert.equal(r.start, '2026-04-01');
  assert.equal(r.end, '2026-04-30');
  assert.equal(r.label, 'month 2026-04');
});

test('resolvePeriod: last-month across year boundary', () => {
  const jan15 = new Date('2026-01-15T00:00:00');
  const r = resolvePeriod('last-month', jan15);
  assert.equal(r.start, '2025-12-01');
  assert.equal(r.end, '2025-12-31');
  assert.equal(r.label, 'month 2025-12');
});

test('resolvePeriod: this-week (2026-05-25 is a Monday)', () => {
  // Week containing 2026-05-25: Sun 2026-05-24 – Sat 2026-05-30
  const r = resolvePeriod('this-week', FIXED_NOW);
  assert.equal(r.start, '2026-05-24');
  assert.equal(r.end, '2026-05-30');
  assert.equal(r.label, 'week 2026-05-24');
});

test('resolvePeriod: last-week', () => {
  // Previous week: Sun 2026-05-17 – Sat 2026-05-23
  const r = resolvePeriod('last-week', FIXED_NOW);
  assert.equal(r.start, '2026-05-17');
  assert.equal(r.end, '2026-05-23');
  assert.equal(r.label, 'week 2026-05-17');
});

test('resolvePeriod: throws on unrecognized input', () => {
  assert.throws(
    () => resolvePeriod('bogus', FIXED_NOW),
    /Invalid period/
  );
});
