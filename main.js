#!/usr/bin/env node

import { readFile, stat } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { loadConfig, configCommand } from "./src/config.js";
import { listCommand } from "./src/list.js";
import { parseTimesheet, filterByRange, clientSlug } from "./src/timesheet.js";
import { loadHistory, saveHistory, nextInvoiceNumber, findByPeriodAndClient, outstandingBalance, filterByClient, migrateLocalHistory, GLOBAL_HISTORY_PATH } from "./src/history.js";
import { renderInvoice } from "./src/html.js";
import { htmlToPdf } from "./src/pdf.js";
import { loadTemplate, templateCommand } from "./src/template.js";
import { initCommand } from "./src/init.js";
import { trackCommand } from "./src/track.js";
import { resolvePeriod } from "./src/period.js";
import { historyCommand } from "./src/history-cmd.js";
import { ensureExclude } from "./src/gitexclude.js";
import { resetCommand } from "./src/reset.js";

// Simple ANSI helpers — no dependency needed
const bold = (s) => `\x1b[1m${s}\x1b[22m`;
const dim = (s) => `\x1b[2m${s}\x1b[22m`;
const red = (s) => `\x1b[31m${s}\x1b[39m`;
const green = (s) => `\x1b[32m${s}\x1b[39m`;

const USAGE = `${bold("tally")} — time tracking and invoicing from YAML timesheets

${bold("Usage:")}
  tally init                    Set up global config then create a tally.yml
  tally init --global           Re-run the global config setup wizard
  tally config                  Open global config in your editor
  tally list                    Show timesheet entries and invoice history for current project
  tally history [sub]           Manage invoice history  (--help for subcommands)
  tally template                Open or reset the invoice HTML template
  tally invoice --period <p>    Generate invoice for a period (in current dir)
  tally invoice --period <p> --dirs <path...>              Generate across multiple repos
  tally invoice --period <p> --include-hours|--no-hours    Skip hours prompt (fee mode)
  tally track <sub>             Time tracking (start, pause, resume, stop, status, discard)
  tally status                  Show current timer status
  tally edit                    Open tally.yml in your editor
  tally reset                   Remove global tally config and template

${bold("Period formats:")}
  last-month  this-month  last-week  this-week
  2026-05                 (full calendar month)
  2026-05-01,2026-05-31   (explicit date range)

`;


const OVERRIDE_FIELDS = ["name", "email", "phone", "location", "payment_terms"];

async function generate(periodInput, dirs, flags = []) {
  let period;
  try {
    period = resolvePeriod(periodInput);
  } catch (e) {
    console.error(red(e.message)); process.exit(1);
  }

  const config = await loadConfig();

  // Load timesheet from each dir; use first for client/mode/rate
  const resolvedDirs = dirs.map((d) => resolve(d));
  const timesheets = [];
  for (const dir of resolvedDirs) {
    let raw;
    try {
      raw = await readFile(`${dir}/tally.yml`, "utf-8");
    } catch {
      console.error(red(`No tally.yml found in ${dir}.`)); process.exit(1);
    }
    timesheets.push(parseTimesheet(raw));
  }

  const primary = timesheets[0];
  const effectiveConfig = { ...config };
  for (const field of OVERRIDE_FIELDS) {
    if (primary.overrides[field] !== undefined) effectiveConfig[field] = primary.overrides[field];
  }

  const slug = clientSlug(primary.client);

  // Migrate any local history before reading global
  await migrateLocalHistory(GLOBAL_HISTORY_PATH, "tally-history.yml", slug, resolvedDirs[0]);

  // Merge and sort entries from all dirs
  const allEntries = timesheets
    .flatMap((ts) => filterByRange(ts.entries, period.start, period.end))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (allEntries.length === 0) {
    console.log(dim(`No entries found for ${period.label}.`));
    return;
  }

  const history = await loadHistory(GLOBAL_HISTORY_PATH);

  // Duplicate detection
  const existing = findByPeriodAndClient(history, period.label, slug);
  if (existing) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const prompt = existing.status === "paid"
      ? red(`WARNING: Invoice #${existing.number} for ${period.label} has already been marked paid. Regenerate anyway? [y/N] `)
      : `Invoice #${existing.number} already exists for ${period.label}. Regenerate? [y/N] `;
    const answer = await rl.question(prompt);
    rl.close();
    if (answer.trim().toLowerCase() !== "y" && answer.trim().toLowerCase() !== "yes") {
      console.log("Aborted.");
      return;
    }
  }

  const invoiceNumber = existing?.number ?? nextInvoiceNumber(history);
  const clientHistory = filterByClient(history, slug);
  const outstanding = outstandingBalance(clientHistory);
  const today = new Date().toISOString().slice(0, 10);

  let invoiceData;

  if (primary.mode === "rate") {
    const rate = primary.rate;
    const entries = allEntries.map((e) => ({
      date: e.date, hours: e.hours, description: e.description,
      amount: e.hours * rate,
    }));
    const totalHours = entries.reduce((s, e) => s + e.hours, 0);
    invoiceData = {
      freelancer: effectiveConfig, client: primary.client, invoiceNumber,
      periodLabel: period.humanLabel, generatedDate: today,
      mode: "rate", rate, entries, totalHours,
      totalAmount: totalHours * rate,
      outstandingBalance: outstanding, paymentTerms: effectiveConfig.payment_terms,
    };
  } else {
    let includeHours = false;
    if (flags.includes("--include-hours")) {
      includeHours = true;
    } else if (!flags.includes("--no-hours")) {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const answer = await rl.question("Include hours breakdown in invoice? [y/N] ");
      rl.close();
      includeHours = answer.trim().toLowerCase() === "y" || answer.trim().toLowerCase() === "yes";
    }
    invoiceData = {
      freelancer: effectiveConfig, client: primary.client, invoiceNumber,
      periodLabel: period.humanLabel, generatedDate: today,
      mode: "fee", fee: primary.fee, includeHours,
      entries: includeHours ? allEntries.map((e) => ({ date: e.date, hours: e.hours, description: e.description })) : [],
      totalHours: allEntries.reduce((s, e) => s + e.hours, 0),
      totalAmount: primary.fee,
      outstandingBalance: outstanding, paymentTerms: effectiveConfig.payment_terms,
    };
  }

  await ensureExclude(config.git_exclude);

  const customTemplate = await loadTemplate();
  const html = renderInvoice(invoiceData, customTemplate);

  const filename = `${slug}-${invoiceNumber}-${period.label.replace(/\s/g, "-").replace(",", "")}-tally-invoice.pdf`;
  console.log(dim(`Generating ${filename}...`));
  await htmlToPdf(html, filename);

  const record = {
    number: invoiceNumber, client: slug, dirs: resolvedDirs,
    period: period.label, generated: today,
    total: invoiceData.totalAmount,
    status: existing?.status ?? "unpaid",
    ...(existing?.paid_date ? { paid_date: existing.paid_date } : {}),
    file: filename,
  };

  if (existing) {
    const idx = history.invoices.findIndex((i) => i.number === existing.number);
    history.invoices[idx] = record;
  } else {
    history.invoices.push(record);
  }
  await saveHistory(GLOBAL_HISTORY_PATH, history);

  console.log(green(`${bold(filename)} generated — Invoice #${invoiceNumber}`));
}

// --- CLI dispatch ---
const [command, ...args] = process.argv.slice(2);

switch (command) {
  case "init": await initCommand(args); break;
  case "config": await configCommand(); break;
  case "list": await listCommand(args); break;
  case "template": await templateCommand(args); break;
  case "invoice": {
    const periodIdx = args.indexOf("--period");
    if (periodIdx === -1 || !args[periodIdx + 1]) {
      console.error(red("Usage: tally invoice --period <period> [--dirs <path...>] [--include-hours|--no-hours]"));
      console.error(dim("Period: last-month, this-month, last-week, this-week, YYYY-MM, or YYYY-MM-DD,YYYY-MM-DD"));
      process.exit(1);
    }
    const periodInput = args[periodIdx + 1];

    const dirsIdx = args.indexOf("--dirs");
    let dirs = ["."];
    if (dirsIdx !== -1) {
      dirs = [];
      for (let i = dirsIdx + 1; i < args.length; i++) {
        if (args[i].startsWith("--")) break;
        dirs.push(args[i]);
      }
      if (dirs.length === 0) {
        console.error(red("--dirs requires at least one path.")); process.exit(1);
      }
    }

    const flags = args.filter((a) => a.startsWith("--") && a !== "--period" && a !== "--dirs");
    await generate(periodInput, dirs, flags);
    break;
  }
  case "track": await trackCommand(args); break;
  case "status": await trackCommand(["status"]); break;
  case "history": await historyCommand(args); break;
  case "reset": await resetCommand(); break;
  case "edit": {
    try {
      await stat("tally.yml");
    } catch {
      console.error(red("No tally.yml found. Run tally init to create one."));
      process.exit(1);
    }
    const editor = process.env.EDITOR || process.env.VISUAL || "vi";
    execFileSync(editor, ["tally.yml"], { stdio: "inherit" });
    break;
  }
  default:
    console.log(USAGE);
    process.exit(command ? 1 : 0);
}
