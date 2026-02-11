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
} from "./commands.js";

const program = new Command();

program
  .name("smartmeter")
  .description("Analyze OpenClaw usage and generate optimized configs to reduce AI costs")
  .version(packageJson.version);

function dataDirOpts(cmdOpts) {
  if (!cmdOpts.dataDir) return {};
  return { baseDir: join(cmdOpts.dataDir, "agents") };
}

program
  .command("analyze")
  .description("Analyze usage patterns and generate report")
  .option("-d, --data-dir <path>", "OpenClaw data directory (default: ~/.openclaw)")
  .action((opts) => cmdAnalyze(dataDirOpts(opts)));

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

program.parse();
