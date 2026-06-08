import { appendFile, readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";

const ENTRIES = ["tally.yml", "*-tally-invoice.pdf", "*-tally-invoice.xlsx", ".tally-tracking"];

export function getGitDir() {
  try {
    return execFileSync("git", ["rev-parse", "--git-dir"], { encoding: "utf-8" }).trim();
  } catch {
    return null;
  }
}

function globalExcludesPath() {
  try {
    const p = execFileSync("git", ["config", "--global", "core.excludesFile"], { encoding: "utf-8" }).trim();
    if (p) return p.replace(/^~/, homedir());
  } catch {}
  return `${homedir()}/.config/git/ignore`;
}

async function appendMissing(filePath, mkdirPath, label) {
  let existing = "";
  try { existing = await readFile(filePath, "utf-8"); } catch {}
  const lines = existing.split("\n");
  const missing = ENTRIES.filter((e) => !lines.some((l) => l.trim() === e));
  if (missing.length === 0) return;
  if (mkdirPath) await mkdir(mkdirPath, { recursive: true });
  const addition = (existing && !existing.endsWith("\n") ? "\n" : "") +
    "# tally\n" + missing.join("\n") + "\n";
  await appendFile(filePath, addition);
  console.log(`Updated ${label}: added ${missing.join(", ")}`);
}

export async function addToGlobalGitignore() {
  const path = globalExcludesPath();
  await appendMissing(path, dirname(path), "~/.config/git/ignore");
}

export async function addToRepoExclude() {
  const gitDir = getGitDir();
  if (!gitDir) return;
  await appendMissing(`${gitDir}/info/exclude`, `${gitDir}/info`, ".git/info/exclude");
}

export async function addToRepoGitignore() {
  await appendMissing(".gitignore", null, ".gitignore");
}

export async function removeFromGlobalGitignore() {
  const path = globalExcludesPath();
  let content;
  try { content = await readFile(path, "utf-8"); } catch { return; }

  const lines = content.split("\n");
  const result = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].trim() === "# tally") {
      i++;
      while (i < lines.length && ENTRIES.includes(lines[i].trim())) i++;
    } else {
      result.push(lines[i]);
      i++;
    }
  }

  await writeFile(path, result.join("\n").replace(/\n{3,}/g, "\n\n"));
  console.log("Removed tally entries from ~/.config/git/ignore");
}

// Used by invoice — silently ensures .git/info/exclude is current
export async function ensureExclude(gitExclude) {
  if (gitExclude === "global" || gitExclude === "none") return;
  const gitDir = getGitDir();
  if (!gitDir) return;
  await appendMissing(`${gitDir}/info/exclude`, `${gitDir}/info`, ".git/info/exclude");
}
