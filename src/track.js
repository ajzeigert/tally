import { readFile, writeFile, unlink, stat } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { loadConfig } from "./config.js";

const TRACKING_FILE = ".tally-tracking";

const bold = (s) => `\x1b[1m${s}\x1b[22m`;
const dim = (s) => `\x1b[2m${s}\x1b[22m`;
const red = (s) => `\x1b[31m${s}\x1b[39m`;
const green = (s) => `\x1b[32m${s}\x1b[39m`;

export function formatElapsedLong(ms) {
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const parts = [];
  if (d > 0) parts.push(`${d} day${d !== 1 ? 's' : ''}`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0 || parts.length === 0) parts.push(`${m}m`);
  return parts.join(', ');
}

function formatElapsed(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

// Parse a relative duration like "45m", "2h", "2h30m", "90m" into milliseconds.
// Returns null for anything unrecognized (bare numbers, wrong order, junk).
export function parseAgo(str) {
  const m = /^(?:(\d+)h)?(?:(\d+)m)?$/.exec(str.trim());
  if (!m || (!m[1] && !m[2])) return null;
  const hours = Number(m[1] || 0);
  const minutes = Number(m[2] || 0);
  return (hours * 60 + minutes) * 60 * 1000;
}

// Parse a 24-hour clock time "H:MM"/"HH:MM" into a timestamp on `now`'s date.
// Returns null for unparseable strings or out-of-range hour/minute. Does not
// reject times in the future — the caller compares against `now`.
export function parseSince(str, now) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(str.trim());
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours > 23 || minutes > 59) return null;
  const d = new Date(now);
  d.setHours(hours, minutes, 0, 0);
  return d.getTime();
}

function roundHours(hours, incrementMinutes) {
  const increments = hours * 60 / incrementMinutes;
  return Math.ceil(increments) * incrementMinutes / 60;
}

async function loadTracking() {
  try {
    const raw = await readFile(TRACKING_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function saveTracking(data) {
  await writeFile(TRACKING_FILE, JSON.stringify(data));
}

async function removeTracking() {
  try { await unlink(TRACKING_FILE); } catch { /* already gone */ }
}

async function hasTimesheet() {
  try { await stat("tally.yml"); return true; } catch { return false; }
}

async function appendEntry(date, hours, description) {
  const raw = await readFile("tally.yml", "utf-8");
  const entry = `  - date: ${date}\n    hours: ${hours}\n    description: ${description}\n`;

  if (raw.includes("entries:")) {
    // Append after the entries key
    const updated = raw.trimEnd() + "\n" + entry;
    await writeFile("tally.yml", updated);
  } else {
    // No entries section yet — shouldn't happen with a valid timesheet, but handle it
    await writeFile("tally.yml", raw.trimEnd() + "\nentries:\n" + entry);
  }
}

function elapsedFrom(tracking) {
  const running = tracking.startedAt ? Date.now() - tracking.startedAt : 0;
  return (tracking.accumulatedMs || 0) + running;
}

async function resolveStaleSession(existing, ask) {
  const rl = ask ? null : createInterface({ input: process.stdin, output: process.stdout });
  const prompt = ask ?? ((q) => rl.question(q));
  const elapsed = elapsedFrom(existing);

  try {
    while (true) {
      const answer = await prompt(
        `Found open timer: "${existing.description}" (running for ${formatElapsedLong(elapsed)})\n` +
        `How many hours did you actually work? (or 'd' to discard): `
      );
      const trimmed = answer.trim().toLowerCase();

      if (trimmed === 'd') {
        await removeTracking();
        return;
      }

      const hours = Number(answer.trim());
      if (!isNaN(hours) && hours > 0) {
        if (!(await hasTimesheet())) {
          console.error(red("No tally.yml found — can't save hours without a timesheet."));
          while (true) {
            const ans2 = await prompt(`Enter 'd' to discard and continue, or 'q' to quit (keep session open): `);
            const t2 = ans2.trim().toLowerCase();
            if (t2 === 'd') { await removeTracking(); return; }
            if (t2 === 'q') { process.exit(1); }
          }
        }
        const date = new Date(existing.firstStartedAt ?? existing.startedAt ?? Date.now())
          .toISOString().slice(0, 10);
        await appendEntry(date, hours, existing.description);
        await removeTracking();
        return;
      }
      // Invalid input — loop continues
    }
  } finally {
    rl?.close();
  }
}

export async function trackStart(args, _ask = null) {
  const existing = await loadTracking();
  if (existing) {
    await resolveStaleSession(existing, _ask);
  }

  // Parse --description, --live, --ago, and --since flags
  let description = "";
  let live = false;
  let ago = null;
  let since = null;
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "--description" || args[i] === "-d") && args[i + 1]) {
      description = args[++i];
    } else if (args[i] === "--live" || args[i] === "-l") {
      live = true;
    } else if (args[i] === "--ago" && args[i + 1] !== undefined) {
      ago = args[++i];
    } else if (args[i] === "--since" && args[i + 1] !== undefined) {
      since = args[++i];
    } else if (!args[i].startsWith("-")) {
      description = args[i];
    }
  }

  if (!description) {
    console.error(red("Description required."));
    console.error(dim("Usage: tally track start --description \"Working on feature\""));
    process.exit(1);
  }

  const now = Date.now();
  let startedAt = now;

  if (ago !== null && since !== null) {
    console.error(red("Use only one of --ago or --since, not both."));
    process.exit(1);
  } else if (ago !== null) {
    const offset = parseAgo(ago);
    if (offset === null) {
      console.error(red(`Invalid --ago duration: "${ago}"`));
      console.error(dim("Examples: 45m, 2h, 2h30m"));
      process.exit(1);
    }
    startedAt = now - offset;
  } else if (since !== null) {
    const ts = parseSince(since, now);
    if (ts === null) {
      console.error(red(`Invalid --since time: "${since}"`));
      console.error(dim("Use 24-hour H:MM, e.g. 9:30 or 14:00"));
      process.exit(1);
    }
    if (ts > now) {
      console.error(red(`--since time "${since}" is in the future.`));
      process.exit(1);
    }
    startedAt = ts;
  }

  const data = { startedAt, firstStartedAt: startedAt, accumulatedMs: 0, description };
  await saveTracking(data);
  console.log(green(`Timer started: "${description}"`));

  if (live) {
    runLiveTimer(data);
  }
}

function runLiveTimer(data) {
  process.on("SIGINT", () => {
    console.log("\n" + dim("Timer still running. Use `tally track stop` to save, or `tally track discard` to cancel."));
    process.exit(0);
  });

  const render = () => {
    const elapsed = elapsedFrom(data);
    process.stdout.write(`\r  ${formatElapsed(elapsed)}  ${dim(data.description)}  `);
  };

  console.log(dim("Press Ctrl+C to exit (timer keeps running in background)\n"));
  render();
  setInterval(render, 1000);
}

async function promptConfirmHours(rounded, description, ask) {
  const rl = ask ? null : createInterface({ input: process.stdin, output: process.stdout });
  const prompt = ask ?? ((q) => rl.question(q));
  try {
    while (true) {
      const answer = await prompt(
        `Log ${rounded}h for "${description}"? [y / d / corrected hours]: `
      );
      const trimmed = answer.trim().toLowerCase();
      if (trimmed === 'y') return { action: 'log', hours: rounded };
      if (trimmed === 'd') return { action: 'discard' };
      const hours = Number(answer.trim());
      if (!isNaN(hours) && hours > 0) return { action: 'log', hours };
    }
  } finally {
    rl?.close();
  }
}

export async function trackStop(noConfirm = false, _ask = null) {
  const tracking = await loadTracking();
  if (!tracking) {
    console.error(red("No timer running."));
    console.error(dim("Start one with `tally track start --description \"...\"`"));
    process.exit(1);
  }

  if (!(await hasTimesheet())) {
    console.error(red("No tally.yml found in current directory."));
    console.error(dim("Run `tally init` to create one, then stop the timer."));
    process.exit(1);
  }

  const elapsed = elapsedFrom(tracking);
  const rawHours = elapsed / (1000 * 60 * 60);

  let rounding = 15;
  try {
    const config = await loadConfig();
    if (config.rounding !== undefined) rounding = Number(config.rounding);
  } catch { /* use default */ }

  const hours = roundHours(rawHours, rounding);
  const startMs = tracking.firstStartedAt || tracking.startedAt || Date.now();
  const date = new Date(startMs).toISOString().slice(0, 10);

  let finalHours = hours;
  if (!noConfirm) {
    const result = await promptConfirmHours(hours, tracking.description, _ask);
    if (result.action === 'discard') {
      await removeTracking();
      console.log(dim(`Discarded timer (${formatElapsed(elapsed)}): "${tracking.description}"`));
      return;
    }
    finalHours = result.hours;
  }

  await appendEntry(date, finalHours, tracking.description);
  await removeTracking();

  console.log(green(`Tracked ${bold(String(finalHours) + "h")} (${formatElapsed(elapsed)} elapsed, rounded to ${rounding}min) — "${tracking.description}"`));
  console.log(dim(`Written to tally.yml`));
}

export async function trackStatus() {
  const tracking = await loadTracking();
  if (!tracking) {
    console.log(dim("No timer running."));
    return;
  }

  const elapsed = elapsedFrom(tracking);
  const label = tracking.startedAt ? "" : dim(" (paused)");
  console.log(`  ${bold(formatElapsed(elapsed))}${label}  ${tracking.description}`);
}

export async function trackPause() {
  const tracking = await loadTracking();
  if (!tracking) {
    console.error(red("No timer running."));
    process.exit(1);
  }
  if (!tracking.startedAt) {
    console.log(dim(`Timer already paused (${formatElapsed(elapsedFrom(tracking))}): "${tracking.description}"`));
    return;
  }

  tracking.accumulatedMs = (tracking.accumulatedMs || 0) + (Date.now() - tracking.startedAt);
  tracking.startedAt = null;
  await saveTracking(tracking);
  console.log(green(`Timer paused (${formatElapsed(tracking.accumulatedMs)}): "${tracking.description}"`));
  console.log(dim("Resume with `tally track resume`."));
}

export async function trackResume() {
  const tracking = await loadTracking();
  if (!tracking) {
    console.error(red("No timer to resume."));
    console.error(dim("Start one with `tally track start --description \"...\"`"));
    process.exit(1);
  }
  if (tracking.startedAt) {
    console.log(dim(`Timer already running (${formatElapsed(elapsedFrom(tracking))}): "${tracking.description}"`));
    return;
  }

  tracking.startedAt = Date.now();
  await saveTracking(tracking);
  console.log(green(`Timer resumed (${formatElapsed(tracking.accumulatedMs || 0)} so far): "${tracking.description}"`));
}

export async function trackDiscard() {
  const tracking = await loadTracking();
  if (!tracking) {
    console.log(dim("No timer running."));
    return;
  }

  const elapsed = elapsedFrom(tracking);
  await removeTracking();
  console.log(dim(`Discarded timer (${formatElapsed(elapsed)}): "${tracking.description}"`));
}

export async function trackCommand(args) {
  const sub = args[0];
  switch (sub) {
    case "start": await trackStart(args.slice(1)); break;
    case "stop": await trackStop(args.slice(1).includes('--no-confirm')); break;
    case "status": await trackStatus(); break;
    case "pause": await trackPause(); break;
    case "resume": await trackResume(); break;
    case "discard": await trackDiscard(); break;
    default:
      console.log(`${bold("tally track")} — time tracking

${bold("Usage:")}
  tally track start -d "description" [--live]   Start a timer
    [--ago 2h30m]                               ...as if it began that long ago
    [--since 9:30]                              ...as if it began at that time today
  tally track pause                             Pause the running timer
  tally track resume                            Resume a paused timer
  tally track stop                              Stop and write to tally.yml
  tally track status                            Show elapsed time
  tally track discard                           Cancel without saving`);
      if (sub) process.exit(1);
  }
}
