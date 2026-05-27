import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";
import yaml from "js-yaml";

export const CONFIG_DIR = `${homedir()}/.config/tally`;
export const CONFIG_PATH = `${CONFIG_DIR}/config.yml`;

export async function loadConfig(path = CONFIG_PATH) {
  let raw;
  try {
    raw = await readFile(path, "utf-8");
  } catch {
    throw new Error(
      `No global config found at ${path}. Run \`tally init\` to create one.`,
    );
  }
  const config = yaml.load(raw);
  if (!config.name) {
    throw new Error(`Config at ${path} is missing required field: name`);
  }
  return config;
}

export async function writeConfig(path = CONFIG_PATH, config) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, yaml.dump(config));
}

export async function configCommand() {
  try {
    await stat(CONFIG_PATH);
  } catch {
    throw new Error(
      `No global config found at ${CONFIG_PATH}. Run \`tally init\` to create one.`,
    );
  }

  const editor = process.env.EDITOR || process.env.VISUAL || "vi";
  execFileSync(editor, [CONFIG_PATH], { stdio: "inherit" });
}
