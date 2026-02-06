import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  cmdAnalyze,
  cmdShow,
  cmdPreview,
  cmdApply,
  cmdRollback,
  cmdStatus,
  cmdReport,
} from "../src/cli/commands.js";

import {
  formatCurrency,
  formatPercent,
  formatTable,
  formatSummary,
  formatPreview,
} from "../src/cli/utils.js";

// --- Helpers ---

async function makeTempDir() {
  return mkdtemp(join(tmpdir(), "smartmeter-cli-"));
}

function makeAssistantLine(overrides = {}) {
  return JSON.stringify({
    type: "message",
    message: {
      role: "assistant",
      content: "I fixed the bug in the function and refactored the code.",
      model: "anthropic/claude-sonnet-4-5",
      usage: { input: 1000, output: 200, cacheRead: 5000, cacheWrite: 0, cost: { total: 0.01 } },
      timestamp: Date.now(),
      ...overrides,
    },
  });
}

function makeUserLine(content, ts) {
  return JSON.stringify({
    type: "message",
    message: { role: "user", content, timestamp: ts },
  });
}

async function setupTestSession(baseDir) {
  const sessionsDir = join(baseDir, "agent-a", "sessions");
  await mkdir(sessionsDir, { recursive: true });

  const now = Date.now();
  const lines = [
    makeUserLine("Fix the bug in auth.js", now - 100000),
    makeAssistantLine({ timestamp: now - 90000, model: "anthropic/claude-opus-4-5", usage: { input: 5000, output: 1800, cacheRead: 12000, cacheWrite: 0, cost: { total: 0.15 } } }),
    makeUserLine("Now add tests", now - 80000),
    makeAssistantLine({ timestamp: now - 70000 }),
    makeUserLine("Debug the error in login", now - 60000),
    makeAssistantLine({ timestamp: now - 50000 }),
  ];

  await writeFile(join(sessionsDir, "s1.jsonl"), lines.join("\n") + "\n");
}

// Silence console.log/error during tests
function silenceConsole() {
  const origLog = console.log;
  const origErr = console.error;
  const logs = [];
  const errs = [];
  console.log = (...args) => logs.push(args.join(" "));
  console.error = (...args) => errs.push(args.join(" "));
  return {
    restore() { console.log = origLog; console.error = origErr; },
    output() { return logs.join("\n"); },
    errors() { return errs.join("\n"); },
    all() { return [...errs, ...logs].join("\n"); },
  };
}

// ============================================
// Utils
// ============================================

test("formatCurrency formats dollars", () => {
  assert.equal(formatCurrency(12.5), "$12.50");
  assert.equal(formatCurrency(0), "$0.00");
  assert.equal(formatCurrency(1234.567), "$1234.57");
});

test("formatPercent formats percentages", () => {
  assert.equal(formatPercent(67.3), "67.3%");
  assert.equal(formatPercent(0), "0.0%");
  assert.equal(formatPercent(100), "100.0%");
});

test("formatTable aligns rows", () => {
  const result = formatTable([
    { label: "Short", value: "1" },
    { label: "Much longer", value: "2" },
  ]);
  assert.ok(result.includes("Short"));
  assert.ok(result.includes("Much longer"));
  // Both values should be at the same column
  const lines = result.split("\n");
  const pos1 = lines[0].indexOf("1");
  const pos2 = lines[1].indexOf("2");
  assert.equal(pos1, pos2);
});

test("formatSummary returns message for null analysis", () => {
  assert.equal(formatSummary(null), "No analysis data available.");
});

test("formatSummary formats valid analysis", () => {
  const analysis = {
    period: { start: "2025-01-20T00:00:00Z", end: "2025-02-05T00:00:00Z", days: 16, totalTasks: 100 },
    summary: { totalCost: 50, currentMonthlyCost: 94, optimizedMonthlyCost: 60, potentialSavings: 34, savingsPercentage: 36.2, confidence: "likely" },
  };
  const result = formatSummary(analysis);
  assert.ok(result.includes("100"));
  assert.ok(result.includes("$50.00"));
  assert.ok(result.includes("likely"));
});

test("formatPreview lists changes", () => {
  const config = {
    agents: {
      defaults: { model: { primary: "sonnet", fallback: ["opus"] }, budget: { daily: 10, weekly: 70 } },
      "code-reviewer": { model: { primary: "sonnet" } },
    },
  };
  const backup = {
    agents: { defaults: { model: { primary: "opus" } } },
  };
  const result = formatPreview(config, backup);
  assert.ok(result.includes("opus -> sonnet"));
  assert.ok(result.includes("code-reviewer"));
  assert.ok(result.includes("$10.00/day"));
});

test("formatPreview returns no-changes message", () => {
  const config = { agents: { defaults: { model: { primary: "sonnet" } } } };
  const result = formatPreview(config, config);
  assert.ok(result.includes("No changes"));
});

// ============================================
// Command handlers
// ============================================

test("cmdAnalyze runs pipeline and writes analysis", async () => {
  const tmp = await makeTempDir();
  const con = silenceConsole();
  try {
    await setupTestSession(tmp);
    const storageDir = join(tmp, "storage");
    const analysis = await cmdAnalyze({ baseDir: tmp, storageDir });

    assert.ok(analysis);
    assert.ok(analysis.period);
    assert.ok(analysis.summary.totalCost > 0);

    // Check file was written
    const stored = JSON.parse(await readFile(join(storageDir, "analysis.json"), "utf8"));
    assert.equal(stored.period.totalTasks, analysis.period.totalTasks);
  } finally {
    con.restore();
    await rm(tmp, { recursive: true });
  }
});

test("cmdAnalyze returns null with no session data", async () => {
  const tmp = await makeTempDir();
  const con = silenceConsole();
  try {
    const result = await cmdAnalyze({ baseDir: tmp, storageDir: join(tmp, "s") });
    assert.equal(result, null);
    assert.ok(con.output().includes("No session data"));
  } finally {
    con.restore();
    await rm(tmp, { recursive: true });
  }
});

test("cmdShow outputs valid JSON config", async () => {
  const tmp = await makeTempDir();
  const con = silenceConsole();
  try {
    await setupTestSession(tmp);
    const config = await cmdShow({ baseDir: tmp, configPath: join(tmp, "openclaw.json") });
    assert.ok(config);
    assert.ok(config.agents.defaults.model.primary);

    // Output should be parseable JSON
    const output = con.output();
    const parsed = JSON.parse(output);
    assert.ok(parsed.agents);
  } finally {
    con.restore();
    await rm(tmp, { recursive: true });
  }
});

test("cmdApply writes config and backup", async () => {
  const tmp = await makeTempDir();
  const con = silenceConsole();
  try {
    await setupTestSession(tmp);

    // Write an existing config to be backed up
    const configPath = join(tmp, "openclaw.json");
    await writeFile(configPath, JSON.stringify({ agents: { defaults: { model: { primary: "old-model" } } } }));

    const config = await cmdApply({
      baseDir: tmp,
      configPath,
      backupDir: tmp,
      storageDir: join(tmp, "storage"),
    });

    assert.ok(config);

    // Config was written
    const written = JSON.parse(await readFile(configPath, "utf8"));
    assert.ok(written.agents.defaults.model.primary);

    // Backup was created
    const { readdir: rd } = await import("node:fs/promises");
    const files = await rd(tmp);
    assert.ok(files.some((f) => f.startsWith("openclaw.json.backup-")));
  } finally {
    con.restore();
    await rm(tmp, { recursive: true });
  }
});

test("cmdRollback restores from backup", async () => {
  const tmp = await makeTempDir();
  const con = silenceConsole();
  try {
    const configPath = join(tmp, "openclaw.json");
    const backupPath = join(tmp, "openclaw.json.backup-2025-01-01");

    // Write a backup and a current config
    await writeFile(backupPath, JSON.stringify({ restored: true }));
    await writeFile(configPath, JSON.stringify({ current: true }));

    const result = await cmdRollback({ backupDir: tmp, configPath });
    assert.ok(result);

    const restored = JSON.parse(await readFile(configPath, "utf8"));
    assert.equal(restored.restored, true);
  } finally {
    con.restore();
    await rm(tmp, { recursive: true });
  }
});

test("cmdRollback reports when no backups exist", async () => {
  const tmp = await makeTempDir();
  const con = silenceConsole();
  try {
    const result = await cmdRollback({ backupDir: tmp, configPath: join(tmp, "x.json") });
    assert.equal(result, null);
    assert.ok(con.output().includes("No backups found"));
  } finally {
    con.restore();
    await rm(tmp, { recursive: true });
  }
});

test("cmdStatus reads stored analysis", async () => {
  const tmp = await makeTempDir();
  const con = silenceConsole();
  try {
    // First analyze to create stored data
    await setupTestSession(tmp);
    const storageDir = join(tmp, "storage");
    await cmdAnalyze({ baseDir: tmp, storageDir });

    // Now check status
    const analysis = await cmdStatus({ storageDir });
    assert.ok(analysis);
    assert.ok(analysis.period);
  } finally {
    con.restore();
    await rm(tmp, { recursive: true });
  }
});

test("cmdStatus prompts when no analysis exists", async () => {
  const tmp = await makeTempDir();
  const con = silenceConsole();
  try {
    const result = await cmdStatus({ storageDir: tmp });
    assert.equal(result, null);
    assert.ok(con.output().includes("No analysis found"));
  } finally {
    con.restore();
    await rm(tmp, { recursive: true });
  }
});

test("cmdReport shows detailed output", async () => {
  const tmp = await makeTempDir();
  const con = silenceConsole();
  try {
    await setupTestSession(tmp);
    const storageDir = join(tmp, "storage");
    await cmdAnalyze({ baseDir: tmp, storageDir });

    const analysis = await cmdReport({ storageDir });
    assert.ok(analysis);
    const output = con.output();
    assert.ok(output.includes("Models:"));
    assert.ok(output.includes("Categories:"));
  } finally {
    con.restore();
    await rm(tmp, { recursive: true });
  }
});
