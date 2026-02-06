import test from "node:test";
import assert from "node:assert/strict";
import { recommend } from "../src/analyzer/recommender.js";

/**
 * Build a minimal analysis object matching aggregator output shape.
 */
function makeAnalysis(overrides = {}) {
  const t1 = Date.UTC(2025, 0, 20);
  const t2 = Date.UTC(2025, 1, 5);

  return {
    period: { start: new Date(t1).toISOString(), end: new Date(t2).toISOString(), days: 16, totalTasks: 100 },
    models: {
      opus: { count: 30, tokens: { input: 150000, output: 40000 }, cost: 24, avgCostPerTask: 0.8 },
      sonnet: { count: 70, tokens: { input: 350000, output: 90000 }, cost: 26.6, avgCostPerTask: 0.38 },
    },
    categories: {
      code: {
        count: 60,
        modelBreakdown: {
          opus: { count: 20, totalCost: 16, avgCost: 0.8, avgTokens: { input: 5000, output: 1500 }, successRate: null },
          sonnet: { count: 40, totalCost: 15.2, avgCost: 0.38, avgTokens: { input: 3500, output: 900 }, successRate: null },
        },
      },
      write: {
        count: 40,
        modelBreakdown: {
          sonnet: { count: 30, totalCost: 11.4, avgCost: 0.38, avgTokens: { input: 3000, output: 800 }, successRate: null },
          opus: { count: 10, totalCost: 8, avgCost: 0.8, avgTokens: { input: 5000, output: 1500 }, successRate: null },
        },
      },
    },
    skills: { used: {}, unused: [] },
    temporal: {
      hourly: { "08": 20, "09": 25, "10": 30, "14": 15, "15": 10 },
      daily: { Mon: 20, Tue: 25, Wed: 20, Thu: 15, Fri: 20 },
      patterns: { burstUsage: false, peakHours: ["08-11", "14-16"], quietHours: ["00-07"] },
    },
    caching: { hitRate: 0.42, avgCacheRead: 45000, estimatedCacheSavings: 12.5 },
    summary: { totalCost: 50.6, totalTasks: 100, avgCostPerTask: 0.506, currentMonthlyCost: 94.875 },
    ...overrides,
  };
}

// --- Does not mutate input ---

test("recommend returns a new object, does not mutate input", () => {
  const analysis = makeAnalysis();
  const original = JSON.stringify(analysis);
  recommend(analysis);
  assert.equal(JSON.stringify(analysis), original);
});

// --- Category recommendations ---

test("recommend adds recommendation to category with multiple models", () => {
  const result = recommend(makeAnalysis());

  assert.ok(result.categories.code.recommendation);
  assert.equal(result.categories.code.recommendation.currentModel, "opus");
  assert.equal(result.categories.code.recommendation.optimalModel, "sonnet");
  assert.ok(result.categories.code.recommendation.confidence > 0);
  assert.ok(result.categories.code.recommendation.potentialSavings > 0);
});

test("recommend sets recommendation null for single-model categories", () => {
  const analysis = makeAnalysis();
  analysis.categories.code.modelBreakdown = {
    sonnet: { count: 60, totalCost: 22.8, avgCost: 0.38, avgTokens: { input: 3000, output: 800 }, successRate: null },
  };
  const result = recommend(analysis);
  assert.equal(result.categories.code.recommendation, null);
});

test("recommend sets recommendation null for low-count categories", () => {
  const analysis = makeAnalysis();
  analysis.categories.code.count = 2;
  const result = recommend(analysis);
  assert.equal(result.categories.code.recommendation, null);
});

test("recommend no savings when cheaper model has insufficient data", () => {
  const analysis = makeAnalysis();
  // Only 1 task on sonnet — below minimum threshold
  analysis.categories.code.modelBreakdown.sonnet.count = 1;
  const result = recommend(analysis);
  // Should still try with count >= 2 fallback, but 1 isn't enough
  assert.equal(result.categories.code.recommendation, null);
});

// --- Summary enrichment ---

test("recommend computes summary savings fields", () => {
  const result = recommend(makeAnalysis());

  assert.ok(result.summary.potentialSavings >= 0);
  assert.ok(result.summary.optimizedMonthlyCost <= result.summary.currentMonthlyCost);
  assert.ok(result.summary.savingsPercentage >= 0);
  assert.ok(["conservative", "likely", "optimistic"].includes(result.summary.confidence));
});

test("recommend summary savings percentage is correct", () => {
  const result = recommend(makeAnalysis());

  const expected = (result.summary.potentialSavings / result.summary.currentMonthlyCost) * 100;
  assert.ok(Math.abs(result.summary.savingsPercentage - expected) < 0.2);
});

// --- Confidence levels ---

test("recommend sets confidence label based on average", () => {
  // With 40 tasks on sonnet per category, confidence = min(40/30, 0.99) = 0.99
  // Average across categories with recommendations → "optimistic"
  const result = recommend(makeAnalysis());
  // Both code and write have enough data for high confidence
  assert.equal(result.summary.confidence, "optimistic");
});

test("recommend conservative confidence with low sample size", () => {
  const analysis = makeAnalysis();
  // Make sonnet have only 3 tasks in each category
  analysis.categories.code.modelBreakdown.sonnet.count = 3;
  analysis.categories.write.modelBreakdown.sonnet.count = 3;
  const result = recommend(analysis);
  assert.equal(result.summary.confidence, "conservative");
});

// --- Caching recommendation ---

test("recommend caching text for burst usage", () => {
  const analysis = makeAnalysis();
  analysis.temporal.patterns.burstUsage = true;
  const result = recommend(analysis);
  assert.equal(result.caching.recommendation, "Enable long retention + 55min heartbeat");
});

test("recommend caching text for low hit rate", () => {
  const analysis = makeAnalysis();
  analysis.caching.hitRate = 0.15;
  const result = recommend(analysis);
  assert.ok(result.caching.recommendation.includes("Low cache hit rate"));
});

test("recommend caching text for good hit rate", () => {
  const analysis = makeAnalysis();
  analysis.caching.hitRate = 0.75;
  const result = recommend(analysis);
  assert.ok(result.caching.recommendation.includes("Good cache utilization"));
});

test("recommend caching text for default case", () => {
  const analysis = makeAnalysis();
  analysis.caching.hitRate = 0.45;
  const result = recommend(analysis);
  assert.ok(result.caching.recommendation.includes("Default caching"));
});

// --- Empty / no-op cases ---

test("recommend handles empty analysis gracefully", () => {
  const empty = {
    period: null,
    models: {},
    categories: {},
    skills: { used: {}, unused: [] },
    temporal: { hourly: {}, daily: {}, patterns: {} },
    caching: { hitRate: 0, avgCacheRead: 0, estimatedCacheSavings: 0 },
    summary: { totalCost: 0, totalTasks: 0, avgCostPerTask: 0, currentMonthlyCost: 0 },
  };
  const result = recommend(empty);
  assert.equal(result.summary.totalTasks, 0);
  // Should return without crashing
  assert.ok(result);
});
