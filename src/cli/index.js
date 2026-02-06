#!/usr/bin/env node

import { join } from "node:path";
import { Command } from "commander";
import {
  cmdAnalyze,
  cmdShow,
  cmdPreview,
  cmdApply,
  cmdRollback,
  cmdStatus,
  cmdReport,
  cmdDashboard,
} from "./commands.js";

const program = new Command();

program
  .name("smartmeter")
  .description("Analyze OpenClaw usage and generate optimized configs to reduce AI costs")
  .version("1.0.0");

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

program.parse();
