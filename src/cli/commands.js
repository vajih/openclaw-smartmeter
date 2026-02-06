import { readFile, writeFile, readdir, copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

import { parseAllSessions } from "../analyzer/parser.js";
import { classifyTasks } from "../analyzer/classifier.js";
import { aggregate } from "../analyzer/aggregator.js";
import { recommend } from "../analyzer/recommender.js";
import { writeAnalysis, readAnalysis } from "../analyzer/storage.js";
import { generateConfig } from "../generator/config-builder.js";
import { CanvasDeployer } from "../canvas/deployer.js";
import {
  formatSummary,
  formatReport,
  formatPreview,
} from "./utils.js";

const OPENCLAW_DIR = join(homedir(), ".openclaw");
const SMARTMETER_DIR = join(OPENCLAW_DIR, "smartmeter");
const CONFIG_PATH = join(OPENCLAW_DIR, "openclaw.json");

/**
 * Run the full analysis pipeline.
 * Returns the enriched analysis object.
 */
async function runPipeline(opts = {}) {
  const baseDir = opts.baseDir || join(OPENCLAW_DIR, "agents");
  const { tasks, warnings } = await parseAllSessions({ baseDir });

  for (const w of warnings) {
    console.error(`Warning: ${w}`);
  }

  if (tasks.length === 0) {
    return null;
  }

  const classified = classifyTasks(tasks);
  const aggregated = aggregate(classified);
  const analysis = recommend(aggregated);
  return analysis;
}

/**
 * Read the current openclaw.json, or {} if missing.
 */
async function readCurrentConfig(configPath = CONFIG_PATH) {
  try {
    const data = await readFile(configPath, "utf8");
    return JSON.parse(data);
  } catch {
    return {};
  }
}

// --- Command handlers ---

export async function cmdAnalyze(opts = {}) {
  const analysis = await runPipeline(opts);
  if (!analysis) {
    console.log("No session data found. Nothing to analyze.");
    return null;
  }

  const storageDir = opts.storageDir || SMARTMETER_DIR;
  await writeAnalysis(analysis, storageDir);

  // Auto-update dashboard if canvas is deployed
  const deployer = new CanvasDeployer();
  if (await deployer.isDeployed()) {
    await deployer.generatePublicAnalysis(analysis);
    console.log("✓ Dashboard data updated");
  }

  console.log(formatSummary(analysis));
  console.log(`\nAnalysis saved to ${storageDir}/analysis.json`);
  return analysis;
}

export async function cmdShow(opts = {}) {
  const analysis = await runPipeline(opts);
  if (!analysis) {
    console.log("No session data found.");
    return null;
  }

  const currentConfig = await readCurrentConfig(opts.configPath);
  const { config } = generateConfig(analysis, currentConfig);
  console.log(JSON.stringify(config, null, 2));
  return config;
}

export async function cmdPreview(opts = {}) {
  const analysis = await runPipeline(opts);
  if (!analysis) {
    console.log("No session data found.");
    return null;
  }

  const currentConfig = await readCurrentConfig(opts.configPath);
  const { config } = generateConfig(analysis, currentConfig);
  console.log(formatPreview(config, currentConfig));
  return config;
}

export async function cmdApply(opts = {}) {
  const analysis = await runPipeline(opts);
  if (!analysis) {
    console.log("No session data found. Nothing to apply.");
    return null;
  }

  const configPath = opts.configPath || CONFIG_PATH;
  const currentConfig = await readCurrentConfig(configPath);
  const { config, validation } = generateConfig(analysis, currentConfig);

  if (!validation.valid) {
    console.error("Generated config failed validation:");
    for (const err of validation.errors) {
      console.error(`  - ${err}`);
    }
    return null;
  }

  // Backup existing config
  const backupDir = opts.backupDir || OPENCLAW_DIR;
  await mkdir(backupDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = join(backupDir, `openclaw.json.backup-${timestamp}`);

  if (Object.keys(currentConfig).length > 0) {
    await writeFile(backupPath, JSON.stringify(currentConfig, null, 2) + "\n");
    console.log(`Backup saved to ${backupPath}`);
  }

  // Write new config
  await mkdir(join(configPath, ".."), { recursive: true });
  await writeFile(configPath, JSON.stringify(config, null, 2) + "\n");
  console.log(`Config written to ${configPath}`);

  // Save analysis too
  const storageDir = opts.storageDir || SMARTMETER_DIR;
  await writeAnalysis(analysis, storageDir);

  console.log(formatPreview(config, currentConfig));
  return config;
}

export async function cmdRollback(opts = {}) {
  const backupDir = opts.backupDir || OPENCLAW_DIR;
  const configPath = opts.configPath || CONFIG_PATH;

  let entries;
  try {
    entries = await readdir(backupDir);
  } catch {
    console.log("No backup directory found.");
    return null;
  }

  const backups = entries
    .filter((f) => f.startsWith("openclaw.json.backup-"))
    .sort()
    .reverse();

  if (backups.length === 0) {
    console.log("No backups found. Nothing to rollback.");
    return null;
  }

  const latest = join(backupDir, backups[0]);
  await copyFile(latest, configPath);
  console.log(`Rolled back to ${backups[0]}`);
  return latest;
}

export async function cmdStatus(opts = {}) {
  const storageDir = opts.storageDir || SMARTMETER_DIR;
  const analysis = await readAnalysis(storageDir);

  if (!analysis) {
    console.log("No analysis found. Run `smartmeter analyze` first.");
    return null;
  }

  console.log(formatSummary(analysis));
  return analysis;
}

export async function cmdReport(opts = {}) {
  const storageDir = opts.storageDir || SMARTMETER_DIR;
  const analysis = await readAnalysis(storageDir);

  if (!analysis) {
    console.log("No analysis found. Run `smartmeter analyze` first.");
    return null;
  }

  console.log(formatReport(analysis));
  return analysis;
}

export async function cmdDashboard(opts = {}) {
  const port = opts.port || 8080;
  const shouldOpen = opts.open !== false;
  const storageDir = opts.storageDir || SMARTMETER_DIR;
  const deployer = new CanvasDeployer(opts.canvasOpts);

  console.log(`
╔════════════════════════════════════════════════════════╗
║          SmartMeter Dashboard Deployment              ║
╚════════════════════════════════════════════════════════╝

📦 Deploying SmartMeter Dashboard to OpenClaw Canvas...`);

  try {
    const copied = await deployer.deploy();
    console.log(`\n✓ Canvas directory ready: ${deployer.canvasDir}`);
    for (const file of copied) {
      console.log(`✓ Copied: ${file}`);
    }
    console.log("\n✅ Dashboard deployed successfully!");
  } catch (err) {
    console.error(`\nFailed to deploy dashboard: ${err.message}`);
    return null;
  }

  // Generate public analysis
  console.log("\n📊 Generating public analysis data...");
  const analysis = await readAnalysis(storageDir);

  if (analysis) {
    try {
      await deployer.generatePublicAnalysis(analysis);
      console.log("✓ Public analysis generated");
    } catch (err) {
      console.error(`Warning: Could not generate public analysis: ${err.message}`);
    }
  } else {
    console.log("⚠ No analysis data found. Dashboard will use sample data.");
    console.log("  Run `smartmeter analyze` first to populate with real data.");
  }

  const url = deployer.getCanvasUrl(port);
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Dashboard ready!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📂 Location: ${deployer.canvasDir}
🌐 URL: ${url}

💡 The dashboard auto-refreshes every 5 seconds
💡 Run \`smartmeter analyze\` to update with real data`);

  if (shouldOpen) {
    console.log("\n🌐 Opening dashboard in browser...");
    try {
      await deployer.openDashboard(port);
    } catch (err) {
      console.error(`Could not open browser: ${err.message}`);
      console.log(`  Open manually: ${url}`);
    }
  }

  return { url, canvasDir: deployer.canvasDir };
}
