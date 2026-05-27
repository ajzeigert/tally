import { rm } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { CONFIG_DIR, loadConfig } from "./config.js";
import { removeFromGlobalGitignore } from "./gitexclude.js";

const bold = (s) => `\x1b[1m${s}\x1b[22m`;
const dim = (s) => `\x1b[2m${s}\x1b[22m`;
const red = (s) => `\x1b[31m${s}\x1b[39m`;

export async function resetCommand() {
  let config = null;
  try {
    config = await loadConfig();
  } catch {
    console.log(dim("No global config found — nothing to reset."));
    return;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(
      `${red(`This will remove your global tally config at ${CONFIG_DIR}.`)} Continue? [y/N] `
    );
    if (answer.trim().toLowerCase() !== "y" && answer.trim().toLowerCase() !== "yes") {
      console.log("Aborted.");
      return;
    }
  } finally {
    rl.close();
  }

  if (config.git_exclude === "global") {
    await removeFromGlobalGitignore();
  }

  await rm(CONFIG_DIR, { recursive: true, force: true });
  console.log(`Removed ${CONFIG_DIR}`);
  console.log(bold("Run tally init to start fresh."));
}
