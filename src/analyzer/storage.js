import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const DEFAULT_DIR = join(homedir(), ".openclaw", "smartmeter");
const ANALYSIS_FILE = "analysis.json";

/**
 * Write analysis JSON to ~/.openclaw/smartmeter/analysis.json.
 * Creates the directory if it doesn't exist.
 */
export async function writeAnalysis(analysis, dir = DEFAULT_DIR) {
  await mkdir(dir, { recursive: true });
  const filePath = join(dir, ANALYSIS_FILE);
  await writeFile(filePath, JSON.stringify(analysis, null, 2) + "\n");
  return filePath;
}

/**
 * Read previously stored analysis, or null if none exists.
 */
export async function readAnalysis(dir = DEFAULT_DIR) {
  const filePath = join(dir, ANALYSIS_FILE);
  try {
    const data = await readFile(filePath, "utf8");
    return JSON.parse(data);
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}
