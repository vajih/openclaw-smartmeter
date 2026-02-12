#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Command } from "commander";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(
  readFileSync(join(__dirname, "../../package.json"), "utf8"),
);
import {
  cmdAnalyze,
  cmdShow,
  cmdPreview,
  cmdApply,
  cmdRollback,
  cmdStatus,
  cmdReport,
  cmdDashboard,
  cmdEvaluate,
  cmdGuide,
  cmdServe,
  cmdDiff,
  cmdCosts,
  cmdConfig,
  cmdHistory,
} from "./commands.js";

const program = new Command();

program
  .name("smartmeter")
  .description("Analyze OpenClaw usage and generate optimized configs to reduce AI costs")
  .version(packageJson.version)
  .action(() => {
    console.log(`
╔════════════════════════════════════════════════════════╗
║              Welcome to SmartMeter! 🎯                ║
╚════════════════════════════════════════════════════════╝

AI Cost Optimization for OpenClaw

📊 Quick Start:

  1️⃣  Analyze your usage and launch dashboard:
     $ smartmeter analyze

  2️⃣  Dashboard opens automatically in your browser
     • View cost savings
     • Apply optimizations
     • Export reports

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📚 Other Commands:

  evaluate  - Quick cost evaluation
  guide     - Step-by-step optimization guide
  preview   - Preview config changes
  apply     - Apply optimizations
  serve     - Start dashboard server
  status    - Show current analysis
  report    - Detailed cost breakdown

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 Need help with a specific command?
   $ smartmeter <command> --help

📖 Full documentation:
   https://github.com/vajih/openclaw-smartmeter
`);
  });

function dataDirOpts(cmdOpts) {
  if (!cmdOpts.dataDir) return {};
  return { baseDir: join(cmdOpts.dataDir, "agents") };
}

program
  .command("analyze")
  .description("Analyze usage patterns and launch interactive dashboard")
  .option("-d, --data-dir <path>", "OpenClaw data directory (default: ~/.openclaw)")
  .option("-p, --port <number>", "Dashboard port (default: 8080)")
  .option("--api-port <number>", "API server port (default: 3001)")
  .option("--no-dashboard", "Skip launching dashboard (analysis only)")
  .action((opts) => cmdAnalyze({ ...dataDirOpts(opts), port: opts.port ? Number(opts.port) : undefined, apiPort: opts.apiPort ? Number(opts.apiPort) : undefined, noDashboard: opts.noDashboard }));

program
  .command("show")
  .description("Display full optimized config")
  .option("-d, --data-dir <path>", "OpenClaw data directory (default: ~/.openclaw)")
  .action((opts) => cmdShow(dataDirOpts(opts)));

program
  .command("preview")
  .description("Show proposed config changes without applying")
  .option("-d, --data-dir <path>", "OpenClaw data directory (default: ~/.openclaw)")
  .action((opts) => cmdPreview(dataDirOpts(opts)));

program
  .command("apply")
  .description("Apply optimized config (creates backup first)")
  .option("-d, --data-dir <path>", "OpenClaw data directory (default: ~/.openclaw)")
  .action((opts) => cmdApply(dataDirOpts(opts)));

program
  .command("rollback")
  .description("Rollback to most recent backup config")
  .action(() => cmdRollback());

program
  .command("status")
  .description("Show current optimization status")
  .action(() => cmdStatus());

program
  .command("report")
  .description("Show detailed savings report")
  .action(() => cmdReport());

program
  .command("dashboard")
  .description("Deploy and open the SmartMeter web dashboard")
  .option("-p, --port <number>", "OpenClaw gateway port", "8080")
  .option("--no-open", "Do not open browser automatically")
  .action((opts) => cmdDashboard({ port: Number(opts.port), open: opts.open }));

program
  .command("evaluate")
  .description("Evaluate current configuration and show savings potential")
  .option("-d, --data-dir <path>", "OpenClaw data directory (default: ~/.openclaw)")
  .action((opts) => cmdEvaluate(dataDirOpts(opts)));

program
  .command("guide")
  .description("Interactive guide for optimizing your configuration")
  .option("-d, --data-dir <path>", "OpenClaw data directory (default: ~/.openclaw)")
  .action((opts) => cmdGuide(dataDirOpts(opts)));

program
  .command("serve")
  .description("Start dashboard + API server (full-featured web UI)")
  .option("-p, --port <number>", "Dashboard port", "8080")
  .option("--api-port <number>", "API server port", "3001")
  .option("--no-open", "Do not open browser automatically")
  .action((opts) => cmdServe({ 
    port: Number(opts.port), 
    apiPort: Number(opts.apiPort),
    open: opts.open 
  }));

program
  .command("diff")
  .description("Compare current config with optimized or a backup version")
  .option("-d, --data-dir <path>", "OpenClaw data directory (default: ~/.openclaw)")
  .option("--version <filename>", "Compare with specific backup file")
  .action((opts) => cmdDiff({ ...dataDirOpts(opts), version: opts.version }));

program
  .command("costs")
  .description("Show detailed cost breakdown by model and category")
  .option("-d, --data-dir <path>", "OpenClaw data directory (default: ~/.openclaw)")
  .action((opts) => cmdCosts(dataDirOpts(opts)));

program
  .command("config")
  .description("Get or set SmartMeter configuration")
  .argument("[key]", "Configuration key to get or set")
  .argument("[value]", "Value to set")
  .action((key, value) => cmdConfig({ key, value }));

program
  .command("history")
  .description("Show config backup/version history")
  .action(() => cmdHistory());

program.parse();
