import test from "node:test";
import assert from "node:assert/strict";
import { generateConfig } from "../src/generator/config-builder.js";
import { createAgents } from "../src/generator/agent-creator.js";
import { deepMerge } from "../src/generator/merger.js";
import { validate } from "../src/generator/validator.js";

// --- Test data helpers ---

function makeAnalysis(overrides = {}) {
  return {
    period: { start: "2025-01-20T00:00:00Z", end: "2025-02-05T00:00:00Z", days: 16, totalTasks: 200 },
    models: {
      "anthropic/claude-opus-4-5": { count: 60, tokens: { input: 300000, output: 80000 }, cost: 48, avgCostPerTask: 0.8 },
      "anthropic/claude-sonnet-4-5": { count: 140, tokens: { input: 700000, output: 180000 }, cost: 53.2, avgCostPerTask: 0.38 },
    },
    categories: {
      code: {
        count: 120,
        modelBreakdown: {
          "anthropic/claude-opus-4-5": { count: 30, totalCost: 24, avgCost: 0.8, avgTokens: { input: 5000, output: 1500 }, successRate: null },
          "anthropic/claude-sonnet-4-5": { count: 90, totalCost: 34.2, avgCost: 0.38, avgTokens: { input: 3500, output: 900 }, successRate: null },
        },
        recommendation: { currentModel: "anthropic/claude-opus-4-5", optimalModel: "anthropic/claude-sonnet-4-5", confidence: 0.99, potentialSavings: 12.6 },
      },
      write: {
        count: 80,
        modelBreakdown: {
          "anthropic/claude-sonnet-4-5": { count: 50, totalCost: 19, avgCost: 0.38, avgTokens: { input: 3000, output: 800 }, successRate: null },
          "anthropic/claude-opus-4-5": { count: 30, totalCost: 24, avgCost: 0.8, avgTokens: { input: 5000, output: 1500 }, successRate: null },
        },
        recommendation: { currentModel: "anthropic/claude-opus-4-5", optimalModel: "anthropic/claude-sonnet-4-5", confidence: 0.99, potentialSavings: 12.6 },
      },
    },
    skills: { used: {}, unused: [] },
    temporal: {
      hourly: { "08": 20, "09": 30, "10": 25, "14": 20, "15": 15 },
      daily: { Mon: 40, Tue: 45, Wed: 40, Thu: 35, Fri: 40 },
      patterns: { burstUsage: false, peakHours: ["08-11"], quietHours: ["00-07"] },
    },
    caching: { hitRate: 0.45, avgCacheRead: 40000, estimatedCacheSavings: 15, recommendation: "Default caching configuration is adequate" },
    summary: { totalCost: 101.2, totalTasks: 200, avgCostPerTask: 0.506, currentMonthlyCost: 189.75, potentialSavings: 47.25, optimizedMonthlyCost: 142.5, savingsPercentage: 24.9, confidence: "optimistic" },
    ...overrides,
  };
}

// ============================================
// config-builder
// ============================================

test("generateConfig produces a valid config from analysis", () => {
  const { config, validation } = generateConfig(makeAnalysis());
  assert.equal(validation.valid, true, validation.errors.join(", "));
  assert.ok(config.agents.defaults.model.primary);
  assert.ok(config.agents.defaults.budget.daily > 0);
});

test("generateConfig switches primary to optimal model", () => {
  const { config } = generateConfig(makeAnalysis());
  // Code is the dominant category (120 tasks) with high confidence
  assert.equal(config.agents.defaults.model.primary, "anthropic/claude-sonnet-4-5");
});

test("generateConfig adds fallback chain sorted by cost", () => {
  const { config } = generateConfig(makeAnalysis());
  // Primary is sonnet, so opus should be in fallback
  assert.ok(config.agents.defaults.model.fallback.includes("anthropic/claude-opus-4-5"));
});

test("generateConfig keeps existing primary when confidence is low", () => {
  const analysis = makeAnalysis();
  analysis.categories.code.recommendation.confidence = 0.3;
  analysis.categories.write.recommendation.confidence = 0.3;

  const existing = { agents: { defaults: { model: { primary: "my-custom-model" } } } };
  const { config } = generateConfig(analysis, existing);
  assert.equal(config.agents.defaults.model.primary, "my-custom-model");
});

test("generateConfig sets budget from monthly cost", () => {
  const { config } = generateConfig(makeAnalysis());
  // daily = ceil(189.75 / 30 * 1.2) = ceil(7.59) = 7.59 rounded up
  assert.ok(config.agents.defaults.budget.daily > 0);
  assert.ok(config.agents.defaults.budget.weekly >= config.agents.defaults.budget.daily);
  assert.equal(config.agents.defaults.budget.alert.threshold, 0.75);
});

test("generateConfig enables caching for burst usage", () => {
  const analysis = makeAnalysis();
  analysis.temporal.patterns.burstUsage = true;
  const { config } = generateConfig(analysis);

  const primary = config.agents.defaults.model.primary;
  assert.equal(config.models[primary].params.cacheRetention, "long");
  assert.ok(config.heartbeat);
  assert.equal(config.heartbeat.every, "55m");
});

test("generateConfig skips caching config for steady usage", () => {
  const analysis = makeAnalysis();
  analysis.temporal.patterns.burstUsage = false;
  const { config } = generateConfig(analysis);
  assert.equal(config.models, undefined);
  assert.equal(config.heartbeat, undefined);
});

test("generateConfig merges with existing user config", () => {
  const existing = {
    agents: {
      defaults: { model: { primary: "anthropic/claude-opus-4-5" } },
      "my-custom-agent": { model: { primary: "gpt-4" } },
    },
  };
  const { config } = generateConfig(makeAnalysis(), existing);
  // User's custom agent should survive the merge
  assert.ok(config.agents["my-custom-agent"]);
  assert.equal(config.agents["my-custom-agent"].model.primary, "gpt-4");
});

test("generateConfig returns backup of original config", () => {
  const existing = { agents: { defaults: { model: { primary: "opus" } } } };
  const { backup } = generateConfig(makeAnalysis(), existing);
  assert.deepEqual(backup, existing);
});

test("generateConfig adds _smartmeter metadata", () => {
  const { config } = generateConfig(makeAnalysis());
  assert.ok(config._smartmeter);
  assert.ok(config._smartmeter.generatedAt);
  assert.ok(config._smartmeter.comments);
});

test("generateConfig skill optimization is no-op with empty skills", () => {
  const { config } = generateConfig(makeAnalysis());
  // Skills stub is empty, so no skills section should be generated
  assert.equal(config.skills, undefined);
});

// ============================================
// agent-creator
// ============================================

test("createAgents creates agents for categories with >50 tasks", () => {
  const analysis = makeAnalysis();
  const agents = createAgents(analysis);
  // code=120, write=80, both > 50
  assert.ok(agents["code-reviewer"]);
  assert.ok(agents["writer"]);
});

test("createAgents skips categories with <= 50 tasks", () => {
  const analysis = makeAnalysis();
  analysis.categories.write.count = 30;
  const agents = createAgents(analysis);
  assert.ok(agents["code-reviewer"]);
  assert.equal(agents["writer"], undefined);
});

test("createAgents uses optimal model from recommendation", () => {
  const agents = createAgents(makeAnalysis());
  assert.equal(agents["code-reviewer"].model.primary, "anthropic/claude-sonnet-4-5");
});

test("createAgents sets proportional budget", () => {
  const agents = createAgents(makeAnalysis());
  assert.ok(agents["code-reviewer"].budget.daily > 0);
  // code has 120/200 = 60% of tasks, so its budget should be > write's
  assert.ok(agents["code-reviewer"].budget.daily > agents["writer"].budget.daily);
});

// ============================================
// merger
// ============================================

test("deepMerge merges nested objects", () => {
  const target = { a: { b: 1, c: 2 } };
  const source = { a: { c: 3, d: 4 } };
  const result = deepMerge(target, source);
  assert.deepEqual(result, { a: { b: 1, c: 3, d: 4 } });
});

test("deepMerge source overwrites primitives", () => {
  const result = deepMerge({ a: 1 }, { a: 2 });
  assert.equal(result.a, 2);
});

test("deepMerge arrays from source replace target arrays", () => {
  const result = deepMerge({ a: [1, 2] }, { a: [3] });
  assert.deepEqual(result.a, [3]);
});

test("deepMerge does not mutate inputs", () => {
  const target = { a: { b: 1 } };
  const source = { a: { c: 2 } };
  const targetStr = JSON.stringify(target);
  const sourceStr = JSON.stringify(source);
  deepMerge(target, source);
  assert.equal(JSON.stringify(target), targetStr);
  assert.equal(JSON.stringify(source), sourceStr);
});

// ============================================
// validator
// ============================================

test("validate passes a valid config", () => {
  const config = {
    agents: { defaults: { model: { primary: "sonnet" }, budget: { daily: 10, weekly: 70 } } },
  };
  const result = validate(config);
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("validate catches missing primary model", () => {
  const result = validate({ agents: {} });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("primary")));
});

test("validate catches invalid budget", () => {
  const config = {
    agents: { defaults: { model: { primary: "x" }, budget: { daily: -5 } } },
  };
  const result = validate(config);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("daily")));
});

test("validate catches weekly < daily", () => {
  const config = {
    agents: { defaults: { model: { primary: "x" }, budget: { daily: 10, weekly: 5 } } },
  };
  const result = validate(config);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("weekly")));
});

test("validate catches non-object input", () => {
  const result = validate(null);
  assert.equal(result.valid, false);
});
