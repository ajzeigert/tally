import { readFile } from "node:fs/promises";
import { parseTimesheet, clientSlug } from "./timesheet.js";
import { loadHistory, filterByClient, outstandingBalance, migrateLocalHistory, GLOBAL_HISTORY_PATH } from "./history.js";

const bold = (s) => `\x1b[1m${s}\x1b[22m`;
const dim = (s) => `\x1b[2m${s}\x1b[22m`;
const red = (s) => `\x1b[31m${s}\x1b[39m`;
const green = (s) => `\x1b[32m${s}\x1b[39m`;

function dollars(n) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2 });
}

export async function listCommand() {
  let timesheet = null;
  let slug = null;
  try {
    const raw = await readFile("tally.yml", "utf-8");
    timesheet = parseTimesheet(raw);
    slug = clientSlug(timesheet.client);
  } catch {
    console.log(dim("No tally.yml found. Run tally init to set up a project."));
    console.log(dim("Use tally history to view invoices across all clients."));
    return;
  }

  await migrateLocalHistory(GLOBAL_HISTORY_PATH, "tally-history.yml", slug, process.cwd());

  console.log(bold(`Timesheet: ${timesheet.client}`));
  if (timesheet.mode === "rate") {
    console.log(dim(`Mode: rate @ ${dollars(timesheet.rate)}/hr`));
  } else {
    console.log(dim(`Mode: fee — ${dollars(timesheet.fee)}`));
  }
  console.log();

  if (timesheet.entries.length === 0) {
    console.log(dim("  No entries recorded."));
  } else {
    console.log(`${"Date".padEnd(13)}${"Hours".padStart(6)}  Description`);
    console.log("-".repeat(60));
    let totalHours = 0;
    for (const e of timesheet.entries) {
      const hrs = e.hours.toFixed(1).padStart(6);
      console.log(`${e.date.padEnd(13)}${hrs}  ${e.description}`);
      totalHours += e.hours;
    }
    console.log("-".repeat(60));
    const summary = `${totalHours.toFixed(1)} hrs`;
    if (timesheet.mode === "rate") {
      console.log(`${"Total".padEnd(13)}${summary.padStart(6)}  ${dim(dollars(totalHours * timesheet.rate))}`);
    } else {
      console.log(`${"Total".padEnd(13)}${summary.padStart(6)}  ${dim(dollars(timesheet.fee))} (flat fee)`);
    }
  }
  console.log();

  const allHistory = await loadHistory(GLOBAL_HISTORY_PATH);
  const history = filterByClient(allHistory, slug);

  console.log(`${bold("Invoices")}  ${dim(`(${slug})`)}`);
  console.log();

  if (history.invoices.length === 0) {
    console.log(dim("  No invoices generated yet."));
  } else {
    console.log(`${"#".padEnd(5)}${"Period".padEnd(22)}${"Total".padStart(12)}  ${"Status".padEnd(8)}  File`);
    console.log("-".repeat(72));
    for (const inv of history.invoices) {
      const status = inv.status === "paid" ? green("paid") : red("unpaid");
      console.log(`${String(inv.number).padEnd(5)}${inv.period.padEnd(22)}${dollars(inv.total).padStart(12)}  ${status.padEnd(8)}  ${dim(inv.file)}`);
    }
    const bal = outstandingBalance(history);
    if (bal > 0) console.log(`\n${bold("Outstanding:")} ${red(dollars(bal))}`);
  }
}
