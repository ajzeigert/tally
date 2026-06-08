import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { homedir } from "node:os";
import yaml from "js-yaml";

export const GLOBAL_HISTORY_PATH = `${homedir()}/.config/tally/history.yml`;

export async function loadHistory(path = GLOBAL_HISTORY_PATH) {
  try {
    const raw = await readFile(path, "utf-8");
    const parsed = yaml.load(raw);
    if (parsed && Array.isArray(parsed.invoices)) {
      return {
        invoices: parsed.invoices.map((inv) => ({
          number: Number(inv.number),
          client: String(inv.client ?? ""),
          dirs: Array.isArray(inv.dirs) ? inv.dirs.map(String) : [],
          period: String(inv.period),
          generated: String(inv.generated),
          total: Number(inv.total),
          status: inv.status === "paid" ? "paid" : "unpaid",
          ...(inv.paid_date ? { paid_date: String(inv.paid_date) } : {}),
          file: String(inv.file),
        })),
      };
    }
    return { invoices: [] };
  } catch {
    return { invoices: [] };
  }
}

export async function saveHistory(path = GLOBAL_HISTORY_PATH, history) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, yaml.dump({ invoices: history.invoices }));
}

export function nextInvoiceNumber(history) {
  if (history.invoices.length === 0) return 1;
  return Math.max(...history.invoices.map((i) => i.number)) + 1;
}

export function findByPeriodAndClient(history, period, client) {
  return history.invoices.find((i) => i.period === period && i.client === client);
}

export function filterByClient(history, client) {
  return { invoices: history.invoices.filter((i) => i.client === client) };
}

export function outstandingBalance(history) {
  return history.invoices
    .filter((i) => i.status === "unpaid")
    .reduce((sum, i) => sum + i.total, 0);
}

// Unpaid balance for a client from invoices OTHER than the one being generated.
// Excluding currentNumber prevents a regenerated invoice from counting itself.
export function priorOutstanding(history, client, currentNumber) {
  const prior = history.invoices.filter(
    (i) => i.client === client && i.number !== currentNumber,
  );
  return outstandingBalance({ invoices: prior });
}

export function deleteInvoice(history, number) {
  const idx = history.invoices.findIndex((i) => i.number === number);
  if (idx === -1) return null;
  return { invoices: history.invoices.filter((i) => i.number !== number) };
}

export function editInvoice(history, number, fields) {
  const idx = history.invoices.findIndex((i) => i.number === number);
  if (idx === -1) return null;
  const invoices = [...history.invoices];
  invoices[idx] = { ...invoices[idx], ...fields };
  return { invoices };
}

export async function migrateLocalHistory(globalPath, localPath, clientSlug, dir) {
  let local;
  try {
    const raw = await readFile(localPath, "utf-8");
    const parsed = yaml.load(raw);
    if (!parsed || !Array.isArray(parsed.invoices) || parsed.invoices.length === 0) return;
    local = parsed.invoices;
  } catch {
    return;
  }

  const global = await loadHistory(globalPath);
  const existingNumbers = new Set(global.invoices.map((i) => i.number));

  const toAdd = local
    .filter((inv) => !existingNumbers.has(Number(inv.number)))
    .map((inv) => ({
      number: Number(inv.number),
      client: clientSlug,
      dirs: [dir],
      period: String(inv.period),
      generated: String(inv.generated),
      total: Number(inv.total),
      status: inv.status === "paid" ? "paid" : "unpaid",
      file: String(inv.file),
    }));

  if (toAdd.length === 0) return;

  global.invoices.push(...toAdd);
  global.invoices.sort((a, b) => a.number - b.number);
  await saveHistory(globalPath, global);
}
