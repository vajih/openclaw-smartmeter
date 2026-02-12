import test from "node:test";
import assert from "node:assert/strict";
import { aggregate } from "../src/analyzer/aggregator.js";

function makeTask(overrides = {}) {
  return {
    model: "anthropic/claude-sonnet-4-5",
    content: "",
    userPrompt: null,
    category: "code",
    usage: { input: 1000, output: 200, cacheRead: 5000, cacheWrite: 0 },
    cost: 0.01,
    timestamp: Date.now(),
    sourceFile: "test.jsonl",
    ...overrides,
  };
}

// --- Empty input ---

test("aggregate returns empty structure for no tasks", () => {
  const result = aggregate([]);
  assert.equal(result.period, null);
  assert.deepEqual(result.models, {});
  assert.deepEqual(result.categories, {});
  assert.equal(result.summary.totalTasks, 0);
  assert.equal(result.summary.totalCost, 0);
  assert.equal(result.caching.hitRate, 0);
});

// --- Models ---

test("aggregate computes per-model stats", () => {
  const tasks = [
    makeTask({ model: "anthropic/claude-sonnet-4-5", cost: 0.03, usage: { input: 1000, output: 200, cacheRead: 0, cacheWrite: 0 } }),
    makeTask({ model: "anthropic/claude-sonnet-4-5", cost: 0.05, usage: { input: 2000, output: 400, cacheRead: 0, cacheWrite: 0 } }),
    makeTask({ model: "anthropic/claude-opus-4-5", cost: 0.15, usage: { input: 5000, output: 1800, cacheRead: 0, cacheWrite: 0 } }),
  ];

  const result = aggregate(tasks);

  const sonnet = result.models["anthropic/claude-sonnet-4-5"];
  assert.equal(sonnet.count, 2);
  assert.equal(sonnet.tokens.input, 3000);
  assert.equal(sonnet.tokens.output, 600);
  assert.equal(sonnet.cost, 0.08);
  assert.equal(sonnet.avgCostPerTask, 0.04);

  const opus = result.models["anthropic/claude-opus-4-5"];
  assert.equal(opus.count, 1);
  assert.equal(opus.cost, 0.15);
});

// --- Categories ---

test("aggregate computes per-category stats with model breakdown", () => {
  const tasks = [
    makeTask({ category: "code", model: "sonnet", cost: 0.02 }),
    makeTask({ category: "code", model: "sonnet", cost: 0.04 }),
    makeTask({ category: "code", model: "opus", cost: 0.10 }),
    makeTask({ category: "write", model: "sonnet", cost: 0.03 }),
  ];

  const result = aggregate(tasks);

  assert.equal(result.categories.code.count, 3);
  assert.equal(result.categories.code.modelBreakdown.sonnet.count, 2);
  assert.equal(result.categories.code.modelBreakdown.sonnet.avgCost, 0.03);
  // successRate is now estimated heuristically (not null)
  assert.equal(typeof result.categories.code.modelBreakdown.sonnet.successRate, "number");
  assert.ok(result.categories.code.modelBreakdown.sonnet.successRate > 0);
  assert.ok(result.categories.code.modelBreakdown.sonnet.successRate <= 1);
  assert.deepEqual(result.categories.code.modelBreakdown.sonnet.avgTokens, { input: 1000, output: 200 });
  assert.equal(result.categories.code.modelBreakdown.opus.count, 1);
  assert.equal(result.categories.write.count, 1);
});

// --- Skills stub ---

test("aggregate includes skills stub", () => {
  const tasks = [makeTask()];
  const result = aggregate(tasks);
  assert.deepEqual(result.skills, { used: {}, unused: [] });
});

// --- Temporal ---

test("aggregate computes hourly and daily distribution", () => {
  // Create tasks at specific UTC times
  // 2025-02-05 08:00 UTC = Wednesday
  const wed8am = Date.UTC(2025, 1, 5, 8, 0, 0);
  // 2025-02-05 14:00 UTC = Wednesday
  const wed2pm = Date.UTC(2025, 1, 5, 14, 0, 0);
  // 2025-02-06 08:00 UTC = Thursday
  const thu8am = Date.UTC(2025, 1, 6, 8, 0, 0);

  const tasks = [
    makeTask({ timestamp: wed8am }),
    makeTask({ timestamp: wed2pm }),
    makeTask({ timestamp: thu8am }),
  ];

  const result = aggregate(tasks);

  assert.equal(result.temporal.hourly["08"], 2);
  assert.equal(result.temporal.hourly["14"], 1);
  assert.equal(result.temporal.daily["Wed"], 2);
  assert.equal(result.temporal.daily["Thu"], 1);
});

test("aggregate detects burst usage patterns", () => {
  // All tasks concentrated in hour 10 — high variance relative to mean
  const tasks = [];
  for (let i = 0; i < 50; i++) {
    tasks.push(makeTask({ timestamp: Date.UTC(2025, 1, 5, 10, i, 0) }));
  }

  const result = aggregate(tasks);
  assert.equal(result.temporal.patterns.burstUsage, true);
  assert.ok(result.temporal.patterns.peakHours.length > 0);
  assert.ok(result.temporal.patterns.quietHours.length > 0);
});

test("aggregate detects steady usage patterns", () => {
  // Spread tasks evenly across all 24 hours
  const tasks = [];
  for (let h = 0; h < 24; h++) {
    for (let i = 0; i < 5; i++) {
      tasks.push(makeTask({ timestamp: Date.UTC(2025, 1, 5, h, i * 10, 0) }));
    }
  }

  const result = aggregate(tasks);
  assert.equal(result.temporal.patterns.burstUsage, false);
  assert.deepEqual(result.temporal.patterns.quietHours, []);
});

// --- Caching ---

test("aggregate computes cache hit rate", () => {
  const tasks = [
    makeTask({ usage: { input: 1000, output: 200, cacheRead: 4000, cacheWrite: 0 }, cost: 0.01 }),
    makeTask({ usage: { input: 1000, output: 200, cacheRead: 6000, cacheWrite: 0 }, cost: 0.01 }),
  ];

  const result = aggregate(tasks);

  // totalCacheRead = 10000, totalInput = 2000
  // hitRate = 10000 / (2000 + 10000) = 0.8333
  assert.ok(Math.abs(result.caching.hitRate - 0.8333) < 0.001);
  assert.equal(result.caching.avgCacheRead, 5000);
  assert.ok(result.caching.estimatedCacheSavings > 0);
});

test("aggregate cache hit rate is 0 when no cache reads", () => {
  const tasks = [
    makeTask({ usage: { input: 1000, output: 200, cacheRead: 0, cacheWrite: 0 } }),
  ];
  const result = aggregate(tasks);
  assert.equal(result.caching.hitRate, 0);
  assert.equal(result.caching.avgCacheRead, 0);
});

// --- Summary ---

test("aggregate computes summary totals and monthly extrapolation", () => {
  // 2 tasks spanning 5 days
  const t1 = Date.UTC(2025, 1, 1, 10, 0, 0);
  const t2 = Date.UTC(2025, 1, 6, 10, 0, 0);

  const tasks = [
    makeTask({ timestamp: t1, cost: 1.0 }),
    makeTask({ timestamp: t2, cost: 1.5 }),
  ];

  const result = aggregate(tasks);

  assert.equal(result.summary.totalCost, 2.5);
  assert.equal(result.summary.totalTasks, 2);
  assert.equal(result.summary.avgCostPerTask, 1.25);
  // 5 days of data → monthly = (2.5 / 5) * 30 = 15.0
  assert.equal(result.summary.currentMonthlyCost, 15);
});

// --- Period ---

test("aggregate computes period from timestamps", () => {
  const t1 = Date.UTC(2025, 0, 20, 0, 0, 0);
  const t2 = Date.UTC(2025, 1, 5, 0, 0, 0);

  const tasks = [
    makeTask({ timestamp: t1 }),
    makeTask({ timestamp: t2 }),
  ];

  const result = aggregate(tasks);

  assert.ok(result.period);
  assert.equal(result.period.totalTasks, 2);
  assert.equal(result.period.days, 16);
  assert.ok(result.period.start.includes("2025-01-20"));
  assert.ok(result.period.end.includes("2025-02-05"));
});
