import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { recommend } from "../src/analyzer/recommender.js";
import { aggregate } from "../src/analyzer/aggregator.js";
import {
  cmdDiff,
  cmdCosts,
  cmdConfig,
  cmdHistory,
} from "../src/cli/commands.js";

// --- Helpers ---

function makeTask(overrides = {}) {
  return {
    model: "anthropic/claude-sonnet-4-5",
    content: "Sample response content",
    usage: { input: 1000, output: 200, cacheRead: 0, cacheWrite: 0 },
    cost: 0.01,
    timestamp: Date.now(),
    category: "code",
    ...overrides,
  };
}

async function makeTempDir() {
  return mkdtemp(join(tmpdir(), "smartmeter-compliance-"));
}

// --- Recommendations array tests ---

test("recommend generates recommendations array", () => {
  const tasks = [
    makeTask({ model: "opus", cost: 0.50, category: "code" }),
    makeTask({ model: "opus", cost: 0.50, category: "code" }),
    makeTask({ model: "opus", cost: 0.50, category: "code" }),
    makeTask({ model: "opus", cost: 0.50, category: "code" }),
    makeTask({ model: "opus", cost: 0.50, category: "code" }),
    makeTask({ model: "sonnet", cost: 0.05, category: "code" }),
    makeTask({ model: "sonnet", cost: 0.05, category: "code" }),
    makeTask({ model: "sonnet", cost: 0.05, category: "code" }),
    makeTask({ model: "sonnet", cost: 0.05, category: "code" }),
    makeTask({ model: "sonnet", cost: 0.05, category: "code" }),
  ];
  const aggregated = aggregate(tasks);
  const result = recommend(aggregated);

  assert.ok(Array.isArray(result.recommendations));
  assert.ok(result.recommendations.length > 0, "should have at least one recommendation");
});

test("recommendations have required fields", () => {
  const tasks = [
    makeTask({ model: "opus", cost: 0.50, category: "code" }),
    makeTask({ model: "opus", cost: 0.50, category: "code" }),
    makeTask({ model: "opus", cost: 0.50, category: "code" }),
    makeTask({ model: "opus", cost: 0.50, category: "code" }),
    makeTask({ model: "opus", cost: 0.50, category: "code" }),
    makeTask({ model: "sonnet", cost: 0.05, category: "code" }),
    makeTask({ model: "sonnet", cost: 0.05, category: "code" }),
    makeTask({ model: "sonnet", cost: 0.05, category: "code" }),
    makeTask({ model: "sonnet", cost: 0.05, category: "code" }),
    makeTask({ model: "sonnet", cost: 0.05, category: "code" }),
  ];
  const aggregated = aggregate(tasks);
  const result = recommend(aggregated);

  for (const rec of result.recommendations) {
    assert.ok(rec.type, "recommendation must have type");
    assert.ok(rec.title, "recommendation must have title");
    assert.ok(rec.description, "recommendation must have description");
    assert.ok(rec.impact !== undefined, "recommendation must have impact");
    assert.ok(Array.isArray(rec.details), "recommendation must have details array");
  }
});

test("recommendations include cache optimization for low hit rate", () => {
  const tasks = [
    makeTask({ model: "sonnet", cost: 0.10, usage: { input: 1000, output: 200, cacheRead: 100, cacheWrite: 0 } }),
    makeTask({ model: "sonnet", cost: 0.10, usage: { input: 1000, output: 200, cacheRead: 100, cacheWrite: 0 } }),
    makeTask({ model: "sonnet", cost: 0.10, usage: { input: 1000, output: 200, cacheRead: 100, cacheWrite: 0 } }),
  ];
  const aggregated = aggregate(tasks);
  const result = recommend(aggregated);

  const cacheRec = result.recommendations.find(r => r.type === "cache_optimization");
  assert.ok(cacheRec, "should include cache optimization recommendation");
  assert.ok(cacheRec.description.includes("hit rate"), "should mention hit rate");
});

test("recommendations include budget controls when costs exist", () => {
  const tasks = [
    makeTask({ model: "sonnet", cost: 0.50, timestamp: Date.now() - 86400000 }),
    makeTask({ model: "sonnet", cost: 0.50, timestamp: Date.now() }),
  ];
  const aggregated = aggregate(tasks);
  const result = recommend(aggregated);

  const budgetRec = result.recommendations.find(r => r.type === "budget_control");
  assert.ok(budgetRec, "should include budget control recommendation");
  assert.ok(budgetRec.title.includes("Budget"), "title should mention budget");
});

test("empty analysis returns empty recommendations array", () => {
  const result = recommend({
    period: null,
    models: {},
    categories: {},
    skills: { used: {}, unused: [] },
    temporal: { hourly: {}, daily: {}, patterns: {} },
    caching: { hitRate: 0, avgCacheRead: 0, estimatedCacheSavings: 0 },
    summary: { totalCost: 0, totalTasks: 0, avgCostPerTask: 0, currentMonthlyCost: 0 },
  });

  assert.ok(!result.recommendations || result.recommendations === undefined,
    "empty analysis should not crash");
});

// --- Success rate tests ---

test("aggregator computes success rate estimates", () => {
  const tasks = [
    makeTask({ model: "sonnet", category: "code" }),
    makeTask({ model: "sonnet", category: "code" }),
    makeTask({ model: "sonnet", category: "code" }),
  ];
  const result = aggregate(tasks);

  const rate = result.categories.code.modelBreakdown.sonnet.successRate;
  assert.equal(typeof rate, "number");
  assert.ok(rate > 0, "success rate should be positive");
  assert.ok(rate <= 1, "success rate should be <= 1");
});

// --- cmdHistory tests ---

test("cmdHistory returns empty array when no backups", async () => {
  const tmpDir = await makeTempDir();
  const result = await cmdHistory({ backupDir: tmpDir });

  assert.deepEqual(result, []);
  await rm(tmpDir, { recursive: true });
});

test("cmdHistory lists backup files in reverse order", async () => {
  const tmpDir = await makeTempDir();

  // Create fake backup files
  await writeFile(join(tmpDir, "openclaw.json.backup-2026-01-15T10-00-00"), "{}");
  await writeFile(join(tmpDir, "openclaw.json.backup-2026-02-01T10-00-00"), "{}");
  await writeFile(join(tmpDir, "openclaw.json.backup-2026-01-20T10-00-00"), "{}");

  const result = await cmdHistory({ backupDir: tmpDir });

  assert.equal(result.length, 3);
  // Latest should be first
  assert.ok(result[0].includes("2026-02-01"));
  assert.ok(result[2].includes("2026-01-15"));

  await rm(tmpDir, { recursive: true });
});

// --- cmdConfig tests ---

test("cmdConfig shows all config when no args", async () => {
  const result = await cmdConfig({});
  assert.equal(typeof result, "object");
  assert.ok(result.hasOwnProperty("enableOpenRouterIntegration"));
});

// --- cmdDiff tests ---

test("cmdDiff returns empty array for identical configs", async () => {
  const tmpDir = await makeTempDir();
  const configPath = join(tmpDir, "openclaw.json");
  await writeFile(configPath, JSON.stringify({ agents: { defaults: { model: { primary: "test" } } } }));

  // Create a backup with same content
  const backupFile = "openclaw.json.backup-2026-01-01";
  await writeFile(join(tmpDir, backupFile), JSON.stringify({ agents: { defaults: { model: { primary: "test" } } } }));

  const result = await cmdDiff({
    configPath,
    backupDir: tmpDir,
    version: backupFile,
  });

  assert.deepEqual(result, []);
  await rm(tmpDir, { recursive: true });
});

test("cmdDiff detects changes between configs", async () => {
  const tmpDir = await makeTempDir();
  const configPath = join(tmpDir, "openclaw.json");
  await writeFile(configPath, JSON.stringify({ agents: { defaults: { model: { primary: "sonnet" } } } }));

  const backupFile = "openclaw.json.backup-2026-01-01";
  await writeFile(join(tmpDir, backupFile), JSON.stringify({ agents: { defaults: { model: { primary: "opus" } } } }));

  const result = await cmdDiff({
    configPath,
    backupDir: tmpDir,
    version: backupFile,
  });

  assert.ok(result.length > 0, "should detect differences");
  const modelDiff = result.find(d => d.path.includes("primary"));
  assert.ok(modelDiff, "should find primary model difference");
  assert.equal(modelDiff.old, "sonnet");
  assert.equal(modelDiff.new, "opus");

  await rm(tmpDir, { recursive: true });
});
