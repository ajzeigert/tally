import { execFileSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { loadHistory, saveHistory, outstandingBalance, deleteInvoice, editInvoice, GLOBAL_HISTORY_PATH } from "./history.js";

const bold = (s) => `\x1b[1m${s}\x1b[22m`;
const dim = (s) => `\x1b[2m${s}\x1b[22m`;
const red = (s) => `\x1b[31m${s}\x1b[39m`;
const green = (s) => `\x1b[32m${s}\x1b[39m`;

const HISTORY_HELP = `${bold("tally history")} — manage invoice history

${bold("Usage:")}
  tally history                           Show all invoices across all clients
  tally history paid <n>                  Mark invoice #n as paid
  tally history unpaid <n>                Mark invoice #n as unpaid
  tally history delete <n>                Remove invoice #n from history
  tally history edit <n> --total <amt>    Override stored total on invoice #n
  tally history open                      Open history file in $EDITOR
  tally history --help                    Show this message`;

function dollars(n) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2 });
}

async function printAllInvoices() {
  const history = await loadHistory(GLOBAL_HISTORY_PATH);

  console.log(`${bold("Invoices")}  ${dim("(all clients)")}`);
  console.log();

  if (history.invoices.length === 0) {
    console.log(dim("  No invoices generated yet."));
    return;
  }

  const clientColWidth = 16;
  console.log(`${"#".padEnd(5)}${"Client".padEnd(clientColWidth)}${"Period".padEnd(22)}${"Total".padStart(12)}  ${"Status".padEnd(8)}  File`);
  console.log("-".repeat(88));

  for (const inv of history.invoices) {
    const status = inv.status === "paid" ? green("paid") : red("unpaid");
    console.log(`${String(inv.number).padEnd(5)}${(inv.client ?? "").padEnd(clientColWidth)}${inv.period.padEnd(22)}${dollars(inv.total).padStart(12)}  ${status.padEnd(8)}  ${dim(inv.file)}`);
  }

  const bal = outstandingBalance(history);
  if (bal > 0) console.log(`\n${bold("Outstanding:")} ${red(dollars(bal))}`);
}

async function setStatus(numberArg, newStatus) {
  const num = parseInt(numberArg, 10);
  if (isNaN(num)) { console.error(red("Invalid invoice number.")); process.exit(1); }

  const history = await loadHistory(GLOBAL_HISTORY_PATH);
  const inv = history.invoices.find((i) => i.number === num);
  if (!inv) { console.error(red(`Invoice #${num} not found.`)); process.exit(1); }

  if (inv.status === newStatus) { console.log(dim(`Invoice #${num} is already ${newStatus}.`)); return; }
  inv.status = newStatus;
  if (newStatus === "paid") {
    inv.paid_date = new Date().toISOString().slice(0, 10);
  } else {
    delete inv.paid_date;
  }
  await saveHistory(GLOBAL_HISTORY_PATH, history);
  console.log(green(`Invoice #${num} marked as ${newStatus}.`));
}

async function deleteCmd(numberArg) {
  const num = parseInt(numberArg, 10);
  if (isNaN(num)) { console.error(red("Invalid invoice number.")); process.exit(1); }

  const history = await loadHistory(GLOBAL_HISTORY_PATH);
  const inv = history.invoices.find((i) => i.number === num);
  if (!inv) { console.error(red(`Invoice #${num} not found.`)); process.exit(1); }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`Delete invoice #${num} (${inv.client}, ${inv.period}, ${dollars(inv.total)})? [y/N] `);
  rl.close();

  if (answer.trim().toLowerCase() !== "y") { console.log(dim("Cancelled.")); return; }

  const updated = deleteInvoice(history, num);
  await saveHistory(GLOBAL_HISTORY_PATH, updated);
  console.log(green(`Invoice #${num} deleted.`));
}

async function editCmd(numberArg, rest) {
  const num = parseInt(numberArg, 10);
  if (isNaN(num)) { console.error(red("Invalid invoice number.")); process.exit(1); }

  const totalIdx = rest.indexOf("--total");
  if (totalIdx === -1 || !rest[totalIdx + 1]) {
    console.error(red("Usage: tally history edit <n> --total <amount>"));
    process.exit(1);
  }
  const newTotal = parseFloat(rest[totalIdx + 1]);
  if (isNaN(newTotal) || newTotal < 0) { console.error(red("--total must be a non-negative number.")); process.exit(1); }

  const history = await loadHistory(GLOBAL_HISTORY_PATH);
  const updated = editInvoice(history, num, { total: newTotal });
  if (!updated) { console.error(red(`Invoice #${num} not found.`)); process.exit(1); }

  await saveHistory(GLOBAL_HISTORY_PATH, updated);
  console.log(green(`Invoice #${num} total updated to ${dollars(newTotal)}.`));
}

export async function historyCommand(args = []) {
  const [sub, ...rest] = args;

  if (!sub) { await printAllInvoices(); return; }
  if (sub === "--help" || sub === "-h") { console.log(HISTORY_HELP); return; }

  switch (sub) {
    case "paid":
      if (!rest[0]) { console.error(red("Usage: tally history paid <n>")); process.exit(1); }
      await setStatus(rest[0], "paid");
      break;
    case "unpaid":
      if (!rest[0]) { console.error(red("Usage: tally history unpaid <n>")); process.exit(1); }
      await setStatus(rest[0], "unpaid");
      break;
    case "delete":
      if (!rest[0]) { console.error(red("Usage: tally history delete <n>")); process.exit(1); }
      await deleteCmd(rest[0]);
      break;
    case "edit":
      if (!rest[0]) { console.error(red("Usage: tally history edit <n> --total <amount>")); process.exit(1); }
      await editCmd(rest[0], rest.slice(1));
      break;
    case "open": {
      const editor = process.env.EDITOR || process.env.VISUAL || "vi";
      execFileSync(editor, [GLOBAL_HISTORY_PATH], { stdio: "inherit" });
      break;
    }
    default:
      console.error(red(`Unknown history subcommand: ${sub}`));
      console.error(dim("Run: tally history --help"));
      process.exit(1);
  }
}
