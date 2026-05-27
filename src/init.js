import { stat, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { loadConfig, writeConfig, CONFIG_PATH } from "./config.js";
import { ensureTemplate } from "./template.js";
import { getGitDir, addToGlobalGitignore, addToRepoExclude, addToRepoGitignore } from "./gitexclude.js";

async function prompt(rl, message, defaultValue) {
  const suffix = defaultValue ? ` [${defaultValue}]` : "";
  const answer = await rl.question(`${message}${suffix}: `);
  return answer.trim() || defaultValue || "";
}

async function promptGitExcludeGlobal(rl) {
  const answer = (await rl.question(
    "\nTally files can contain sensitive billing details. Include them in git's ignore list? [Y/n] "
  )).trim().toLowerCase();

  if (answer === "n" || answer === "no") return "none";

  console.log();
  console.log("  1) Global  — add to ~/.config/git/ignore (applies to all repos on this machine)");
  console.log("  2) Per repo — tally init will prompt when setting up each project");
  const choice = (await rl.question("  Choice [1]: ")).trim();

  if (choice === "2") {
    console.log("  tally init will prompt for .git/info/exclude or .gitignore when setting up each project.");
    return "repo";
  }

  return "global";
}

async function promptGitExcludeRepo(rl) {
  console.log("  (Run tally init --global to set this preference once for all repos.)");
  const answer = (await rl.question(
    "\nAdd tally files to git's ignore list for this repo? [Y/n] "
  )).trim().toLowerCase();

  if (answer === "n" || answer === "no") return;

  console.log();
  console.log("  1) .git/info/exclude — local to your clone only, not committed (recommended)");
  console.log("  2) .gitignore         — committed to the repo, shared with collaborators");
  const choice = (await rl.question("  Choice [1]: ")).trim();

  if (choice === "2") {
    await addToRepoGitignore();
  } else {
    await addToRepoExclude();
  }
}

async function initGlobalConfig() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log("Setting up global tally config...\n");

  try {
    const name = await prompt(rl, "Your name");
    if (!name) { console.error("Name is required."); process.exit(1); }

    const email = await prompt(rl, "Email");
    const phone = await prompt(rl, "Phone");
    const location = await prompt(rl, "Location (e.g., Bend, OR)");
    const payment_terms = await prompt(rl, "Default payment terms", "Net 30");
    const rateStr = await prompt(rl, "Default hourly rate (leave blank to set per-client)");

    const config = { name };
    if (email) config.email = email;
    if (phone) config.phone = phone;
    if (location) config.location = location;
    if (payment_terms) config.payment_terms = payment_terms;
    const rateNum = parseFloat(rateStr);
    if (!isNaN(rateNum) && rateNum > 0) config.rate = rateNum;

    const gitExclude = await promptGitExcludeGlobal(rl);
    config.git_exclude = gitExclude;

    await writeConfig(CONFIG_PATH, config);
    await ensureTemplate();

    if (gitExclude === "global") {
      await addToGlobalGitignore();
    }

    console.log(`\nGlobal config saved to ${CONFIG_PATH}`);
  } finally {
    rl.close();
  }
}

async function initTimesheet(config) {
  try {
    await stat("tally.yml");
    console.error("tally.yml already exists in this directory.");
    process.exit(1);
  } catch { /* doesn't exist, good */ }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log("\nCreating local timesheet...\n");

  try {
    const clientName = await prompt(rl, "Client name");
    if (!clientName) { console.error("Client name is required."); process.exit(1); }

    let modeAnswer = "";
    while (modeAnswer !== "rate" && modeAnswer !== "fee") {
      modeAnswer = (await prompt(rl, "Billing mode? [rate/fee]")).toLowerCase().trim();
      if (modeAnswer !== "rate" && modeAnswer !== "fee") {
        console.log("Please enter 'rate' or 'fee'.");
      }
    }

    let billingLine = "";
    if (modeAnswer === "rate") {
      if (config.rate) {
        const override = (await prompt(rl, `Override rate for this client? Global is $${config.rate}/hr [y/N]`)).toLowerCase();
        if (override === "y" || override === "yes") {
          const newRate = await prompt(rl, "Rate ($/hr)");
          billingLine = `rate: ${parseFloat(newRate) || config.rate}`;
        } else {
          billingLine = `rate: ${config.rate}`;
        }
      } else {
        const rateVal = await prompt(rl, "Rate ($/hr)");
        billingLine = `rate: ${parseFloat(rateVal) || 0}`;
      }
    } else {
      const feeVal = await prompt(rl, "Flat fee ($)");
      billingLine = `fee: ${parseFloat(feeVal) || 0}`;
    }

    const today = new Date().toISOString().slice(0, 10);
    const content = `client: ${clientName}
mode: ${modeAnswer}
${billingLine}

# --- global config overrides (uncomment to activate) ---
# name: ${config.name}
# email: ${config.email || "your@email.com"}
# phone: ${config.phone || "555-1234"}
# location: ${config.location || "City, ST"}
# payment_terms: ${config.payment_terms || "Net 30"}

entries:
  - date: ${today}
    hours: 1
    description: Example entry — replace or delete this
`;

    await writeFile("tally.yml", content);
    console.log("Created tally.yml — edit entries to get started.");

    const gitDir = getGitDir();
    if (gitDir && config.git_exclude !== "global" && config.git_exclude !== "none") {
      await promptGitExcludeRepo(rl);
    }
  } finally {
    rl.close();
  }
}

export async function initCommand(args = []) {
  if (args.includes("--global")) {
    await initGlobalConfig();
    return;
  }

  let config;
  try {
    config = await loadConfig();
  } catch {
    await initGlobalConfig();
    config = await loadConfig();
  }

  await initTimesheet(config);
}
