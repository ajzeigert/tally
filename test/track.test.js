import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { trackStart, trackStop, formatElapsedLong, parseAgo, parseSince } from '../src/track.js';

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

// --- parseAgo ---

test('parseAgo — minutes only', () => {
  assert.equal(parseAgo('45m'), 45 * 60 * 1000);
});

test('parseAgo — hours only', () => {
  assert.equal(parseAgo('2h'), 2 * 60 * 60 * 1000);
});

test('parseAgo — hours and minutes', () => {
  assert.equal(parseAgo('2h30m'), (2 * 60 + 30) * 60 * 1000);
});

test('parseAgo — minutes greater than 59', () => {
  assert.equal(parseAgo('90m'), 90 * 60 * 1000);
});

test('parseAgo — invalid forms return null', () => {
  assert.equal(parseAgo('abc'), null);
  assert.equal(parseAgo('5'), null);
  assert.equal(parseAgo(''), null);
  assert.equal(parseAgo('2x'), null);
  assert.equal(parseAgo('30m2h'), null);
});

// --- parseSince ---

test('parseSince — H:MM today', () => {
  const now = new Date('2026-06-08T15:00:00').getTime();
  const ts = parseSince('9:30', now);
  const d = new Date(ts);
  assert.equal(d.getHours(), 9);
  assert.equal(d.getMinutes(), 30);
  assert.equal(new Date(ts).toDateString(), new Date(now).toDateString());
});

test('parseSince — HH:MM today', () => {
  const now = new Date('2026-06-08T15:00:00').getTime();
  const ts = parseSince('14:00', now);
  const d = new Date(ts);
  assert.equal(d.getHours(), 14);
  assert.equal(d.getMinutes(), 0);
});

test('parseSince — invalid forms return null', () => {
  const now = Date.now();
  assert.equal(parseSince('25:00', now), null);
  assert.equal(parseSince('9:99', now), null);
  assert.equal(parseSince('nine', now), null);
  assert.equal(parseSince('930', now), null);
  assert.equal(parseSince('', now), null);
});

// --- backdated trackStart ---

test('trackStart: --ago backdates startedAt and firstStartedAt',
  withTempDir(async () => {
    const before = Date.now();
    await trackStart(['new task', '--ago', '45m']);
    const after = Date.now();

    const tracking = JSON.parse(readFileSync('.tally-tracking', 'utf-8'));
    const offset = 45 * 60 * 1000;
    assert.ok(tracking.startedAt >= before - offset - 50);
    assert.ok(tracking.startedAt <= after - offset);
    assert.equal(tracking.startedAt, tracking.firstStartedAt);
    assert.equal(tracking.accumulatedMs, 0);
    assert.equal(tracking.description, 'new task');
  })
);

test('trackStart: --ago and --since together → error, no tracking file',
  withTempDir(async () => {
    const exitCode = await captureExit(() =>
      trackStart(['task', '--ago', '45m', '--since', '9:30']));
    assert.equal(exitCode, 1);
    assert.ok(!existsSync('.tally-tracking'));
  })
);

test('trackStart: --since in the future → error, no tracking file',
  withTempDir(async () => {
    // Build a clock time guaranteed to be later than now.
    const future = new Date(Date.now() + 60 * 60 * 1000);
    const hh = String(future.getHours()).padStart(2, '0');
    const mm = String(future.getMinutes()).padStart(2, '0');

    const exitCode = await captureExit(() =>
      trackStart(['task', '--since', `${hh}:${mm}`]));
    assert.equal(exitCode, 1);
    assert.ok(!existsSync('.tally-tracking'));
  })
);

test('trackStart: invalid --ago → error, no tracking file',
  withTempDir(async () => {
    const exitCode = await captureExit(() =>
      trackStart(['task', '--ago', 'bogus']));
    assert.equal(exitCode, 1);
    assert.ok(!existsSync('.tally-tracking'));
  })
);

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
