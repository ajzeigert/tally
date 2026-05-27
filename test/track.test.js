import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { trackStart, trackStop, formatElapsedLong } from '../src/track.js';

// Run `fn` inside a fresh temp directory, then clean up.
function withTempDir(fn) {
  return async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tally-test-'));
    const orig = process.cwd();
    process.chdir(dir);
    try {
      await fn(dir);
    } finally {
      process.chdir(orig);
      await rm(dir, { recursive: true, force: true });
    }
  };
}

// Intercept process.exit so it throws instead of killing the process.
// Returns the exit code that was passed (or null if exit was never called).
async function captureExit(fn) {
  const orig = process.exit;
  let code = null;
  process.exit = (c) => { code = c ?? 0; throw new Error(`exit:${c}`); };
  try {
    await fn();
  } catch (e) {
    if (!e.message?.startsWith('exit:')) throw e;
  } finally {
    process.exit = orig;
  }
  return code;
}

test('smoke: track.js exports are importable', () => {
  assert.equal(typeof trackStart, 'function');
  assert.equal(typeof trackStop, 'function');
});

// --- formatElapsedLong ---

test('formatElapsedLong — under 1 hour', () => {
  assert.equal(formatElapsedLong(45 * 60 * 1000), '45m');
});

test('formatElapsedLong — hours and minutes', () => {
  assert.equal(formatElapsedLong((3 * 3600 + 14 * 60) * 1000), '3h, 14m');
});

test('formatElapsedLong — days and hours', () => {
  assert.equal(formatElapsedLong((2 * 86400 + 4 * 3600 + 12 * 60) * 1000), '2 days, 4h, 12m');
});

test('formatElapsedLong — exactly 1 day', () => {
  assert.equal(formatElapsedLong(86400 * 1000), '1 day');
});

test('formatElapsedLong — 0ms', () => {
  assert.equal(formatElapsedLong(0), '0m');
});

// --- resolveStaleSession (tested via trackStart) ---

test('trackStart: stale session + discard → removes old timer, starts new session',
  withTempDir(async () => {
    writeFileSync('.tally-tracking', JSON.stringify({
      startedAt: Date.now() - 5000,
      firstStartedAt: Date.now() - 5000,
      accumulatedMs: 0,
      description: 'old task',
    }));

    const answers = ['d'];
    const mockAsk = async (_prompt) => answers.shift();

    await trackStart(['new task'], mockAsk);

    const tracking = JSON.parse(readFileSync('.tally-tracking', 'utf-8'));
    assert.equal(tracking.description, 'new task');
  })
);

test('trackStart: stale session + hours → appends entry, starts new session',
  withTempDir(async () => {
    writeFileSync('tally.yml', 'client:\n  name: Acme\nentries:\n');
    writeFileSync('.tally-tracking', JSON.stringify({
      startedAt: Date.now() - 5000,
      firstStartedAt: Date.now() - 5000,
      accumulatedMs: 0,
      description: 'old task',
    }));

    const answers = ['2.5'];
    const mockAsk = async (_prompt) => answers.shift();

    await trackStart(['new task'], mockAsk);

    const timesheet = readFileSync('tally.yml', 'utf-8');
    assert.ok(timesheet.includes('hours: 2.5'), 'hours should be written');
    assert.ok(timesheet.includes('description: old task'), 'description should be written');

    const tracking = JSON.parse(readFileSync('.tally-tracking', 'utf-8'));
    assert.equal(tracking.description, 'new task');
  })
);

test('trackStart: stale session + hours + no timesheet → error shown, d discards and continues',
  withTempDir(async () => {
    // No tally.yml
    writeFileSync('.tally-tracking', JSON.stringify({
      startedAt: Date.now() - 5000,
      firstStartedAt: Date.now() - 5000,
      accumulatedMs: 0,
      description: 'old task',
    }));

    const answers = ['2', 'd'];
    const mockAsk = async (_prompt) => answers.shift();

    await trackStart(['new task'], mockAsk);

    const tracking = JSON.parse(readFileSync('.tally-tracking', 'utf-8'));
    assert.equal(tracking.description, 'new task');
  })
);

test('trackStart: stale session + hours + no timesheet → q exits without starting new session',
  withTempDir(async () => {
    const staleData = JSON.stringify({
      startedAt: Date.now() - 5000,
      firstStartedAt: Date.now() - 5000,
      accumulatedMs: 0,
      description: 'old task',
    });
    writeFileSync('.tally-tracking', staleData);

    const answers = ['2', 'q'];
    const mockAsk = async (_prompt) => answers.shift();

    const exitCode = await captureExit(() => trackStart(['new task'], mockAsk));

    assert.equal(exitCode, 1);
    // Stale file still exists (session preserved on quit)
    assert.ok(existsSync('.tally-tracking'));
    const tracking = JSON.parse(readFileSync('.tally-tracking', 'utf-8'));
    assert.equal(tracking.description, 'old task');
  })
);

test('trackStart: stale session + invalid input → re-prompts, eventual discard works',
  withTempDir(async () => {
    writeFileSync('.tally-tracking', JSON.stringify({
      startedAt: Date.now() - 5000,
      firstStartedAt: Date.now() - 5000,
      accumulatedMs: 0,
      description: 'old task',
    }));

    const answers = ['foo', 'bar', '-1', 'd'];
    const mockAsk = async (_prompt) => answers.shift();

    await trackStart(['new task'], mockAsk);

    const tracking = JSON.parse(readFileSync('.tally-tracking', 'utf-8'));
    assert.equal(tracking.description, 'new task');
  })
);

// --- trackStop absurd hours ---

const THIRTEEN_HOURS_MS = 13 * 60 * 60 * 1000;

function writeStaleTracking(elapsedMs, description = 'long task') {
  const started = Date.now() - elapsedMs;
  writeFileSync('.tally-tracking', JSON.stringify({
    startedAt: started,
    firstStartedAt: started,
    accumulatedMs: 0,
    description,
  }));
}

test('trackStop: elapsed > 12h + y → logs rounded hours',
  withTempDir(async () => {
    writeFileSync('tally.yml', 'client:\n  name: Acme\nentries:\n');
    writeStaleTracking(THIRTEEN_HOURS_MS);

    const mockAsk = async (_prompt) => 'y';
    await trackStop(false, mockAsk);

    assert.ok(!existsSync('.tally-tracking'), 'tracking file removed');
    const ts = readFileSync('tally.yml', 'utf-8');
    assert.ok(ts.includes('description: long task'));
    assert.ok(/hours: \d+(\.\d+)?/.test(ts), 'hours entry written');
  })
);

test('trackStop: elapsed > 12h + corrected number → logs that number',
  withTempDir(async () => {
    writeFileSync('tally.yml', 'client:\n  name: Acme\nentries:\n');
    writeStaleTracking(THIRTEEN_HOURS_MS);

    const mockAsk = async (_prompt) => '4';
    await trackStop(false, mockAsk);

    assert.ok(!existsSync('.tally-tracking'));
    const ts = readFileSync('tally.yml', 'utf-8');
    assert.ok(ts.includes('hours: 4'));
  })
);

test('trackStop: elapsed > 12h + d → discards without saving',
  withTempDir(async () => {
    writeFileSync('tally.yml', 'client:\n  name: Acme\nentries:\n');
    writeStaleTracking(THIRTEEN_HOURS_MS);

    const mockAsk = async (_prompt) => 'd';
    await trackStop(false, mockAsk);

    assert.ok(!existsSync('.tally-tracking'));
    const ts = readFileSync('tally.yml', 'utf-8');
    assert.ok(!ts.includes('description: long task'), 'nothing appended to timesheet');
  })
);

test('trackStop: elapsed <= 12h → prompts, writes normally',
  withTempDir(async () => {
    writeFileSync('tally.yml', 'client:\n  name: Acme\nentries:\n');
    writeStaleTracking(2 * 60 * 60 * 1000, 'normal task');

    let promptCalled = false;
    const mockAsk = async (_prompt) => { promptCalled = true; return 'y'; };
    await trackStop(false, mockAsk);

    assert.equal(promptCalled, true, 'should prompt even for short sessions');
    const ts = readFileSync('tally.yml', 'utf-8');
    assert.ok(ts.includes('description: normal task'));
  })
);

test('trackStop: --no-confirm with short session → no prompt, writes rounded hours',
  withTempDir(async () => {
    writeFileSync('tally.yml', 'client:\n  name: Acme\nentries:\n');
    writeStaleTracking(2 * 60 * 60 * 1000, 'quick task');

    let promptCalled = false;
    const mockAsk = async (_prompt) => { promptCalled = true; return 'y'; };
    await trackStop(true, mockAsk);

    assert.equal(promptCalled, false, 'should not prompt with --no-confirm');
    assert.ok(!existsSync('.tally-tracking'));
    const ts = readFileSync('tally.yml', 'utf-8');
    assert.ok(ts.includes('description: quick task'));
  })
);

test('trackStop: --no-confirm with long session → no prompt, writes rounded hours',
  withTempDir(async () => {
    writeFileSync('tally.yml', 'client:\n  name: Acme\nentries:\n');
    writeStaleTracking(THIRTEEN_HOURS_MS, 'long task');

    let promptCalled = false;
    const mockAsk = async (_prompt) => { promptCalled = true; return 'y'; };
    await trackStop(true, mockAsk);

    assert.equal(promptCalled, false, 'should not prompt with --no-confirm');
    assert.ok(!existsSync('.tally-tracking'));
    const ts = readFileSync('tally.yml', 'utf-8');
    assert.ok(ts.includes('description: long task'));
  })
);
