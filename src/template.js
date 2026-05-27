import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { spawn } from "node:child_process";
import { CONFIG_DIR } from "./config.js";
import { DEFAULT_TEMPLATE } from "./default_template.js";

const TEMPLATE_PATH = `${CONFIG_DIR}/template.html`;

export async function ensureTemplate() {
  try {
    await stat(TEMPLATE_PATH);
  } catch {
    await mkdir(dirname(TEMPLATE_PATH), { recursive: true });
    await writeFile(TEMPLATE_PATH, DEFAULT_TEMPLATE);
  }
}

export async function resetTemplate() {
  await mkdir(dirname(TEMPLATE_PATH), { recursive: true });
  await writeFile(TEMPLATE_PATH, DEFAULT_TEMPLATE);
  console.log(`Template reset to default at ${TEMPLATE_PATH}`);
}

export async function openTemplate() {
  await ensureTemplate();
  const editor = process.env.EDITOR;
  if (!editor) {
    console.log(`Template file: ${TEMPLATE_PATH}`);
    console.log("Set $EDITOR to open it automatically.");
    return;
  }
  const child = spawn(editor, [TEMPLATE_PATH], { stdio: "inherit" });
  await new Promise((resolve) => child.on("close", resolve));
}

export async function loadTemplate() {
  // Check for local template first
  try {
    return await readFile("template.html", "utf-8");
  } catch { /* no local template */ }

  // Then global
  try {
    return await readFile(TEMPLATE_PATH, "utf-8");
  } catch {
    return undefined;
  }
}

export async function templateCommand(args) {
  if (args.includes("--reset")) {
    await resetTemplate();
  } else {
    await openTemplate();
  }
}
