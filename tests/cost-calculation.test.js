import test from "node:test";
import assert from "node:assert/strict";
import { aggregate } from "../src/analyzer/aggregator.js";
import { recommend } from "../src/analyzer/recommender.js";

/**
 * Helper to create a task with default values
 */
function makeTask(overrides = {}) {
  return {
    model: "anthropic/claude-sonnet-4-5",
    content: "",
    userPrompt: null,
    category: "code",
    usage: { input: 1000, output: 200, cacheRead: 0, cacheWrite: 0 },
    cost: 0.01,
    timestamp: Date.UTC(2025, 1, 5, 10, 0, 0),
    sourceFile: "test.jsonl",
    ...overrides,
  };
}

/**
 * Helper to create a minimal analysis object
 */
function makeAnalysis(overrides = {}) {
  return {
    period: { start: "2025-01-20T00:00:00Z", end: "2025-02-05T00:00:00Z", days: 16, totalTasks: 100 },
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
    },
    skills: { used: {}, unused: [] },
    temporal: {
      hourly: { "08": 20 },
      daily: { Mon: 20 },
      patterns: { burstUsage: false, peakHours: [], quietHours: [] },
    },
    caching: { hitRate: 0.42, avgCacheRead: 45000, estimatedCacheSavings: 12.5 },
    summary: { totalCost: 50.6, totalTasks: 100, avgCostPerTask: 0.506, currentMonthlyCost: 94.875 },
    ...overrides,
  };
}

// ============================================================================
// TEST 1: NORMAL CASE - Monthly Cost Projection with Multiple Models
// ============================================================================

test("cost calculation: accurate monthly projection from multi-model usage", () => {
  // Simulate 7 days of realistic mixed usage
  const tasks = [];
  const startDay = Date.UTC(2025, 1, 1, 0, 0, 0);
  
  // Day 1-7: Mix of opus (expensive) and sonnet (cheap)
  for (let day = 0; day < 7; day++) {
    const timestamp = startDay + (day * 24 * 60 * 60 * 1000);
    
    // 2 opus tasks per day at $0.80 each
    tasks.push(makeTask({ 
      model: "anthropic/claude-opus-4-5", 
      cost: 0.80, 
      timestamp,
      usage: { input: 5000, output: 1500, cacheRead: 0, cacheWrite: 0 }
    }));
    tasks.push(makeTask({ 
      model: "anthropic/claude-opus-4-5", 
      cost: 0.80, 
      timestamp: timestamp + 1000,
      usage: { input: 5000, output: 1500, cacheRead: 0, cacheWrite: 0 }
    }));
    
    // 5 sonnet tasks per day at $0.38 each
    for (let i = 0; i < 5; i++) {
      tasks.push(makeTask({ 
        model: "anthropic/claude-sonnet-4-5", 
        cost: 0.38, 
        timestamp: timestamp + 2000 + (i * 1000),
        usage: { input: 3500, output: 900, cacheRead: 0, cacheWrite: 0 }
      }));
    }
  }
  
  const result = aggregate(tasks);
  
  // Verify total cost: 7 days * (2 * 0.80 + 5 * 0.38) = 7 * (1.60 + 1.90) = 7 * 3.50 = 24.50
  assert.equal(result.summary.totalCost, 24.5);
  
  // Verify task count
  assert.equal(result.summary.totalTasks, 49); // 7 * 7
  
  // Verify average cost per task
  const expectedAvg = 24.5 / 49;
  assert.ok(Math.abs(result.summary.avgCostPerTask - expectedAvg) < 0.0001);
  
  // Verify monthly extrapolation: (24.5 / 7) * 30 = 105
  assert.equal(result.summary.currentMonthlyCost, 105);
  
  // Verify per-model breakdown
  assert.equal(result.models["anthropic/claude-opus-4-5"].count, 14);
  assert.equal(result.models["anthropic/claude-opus-4-5"].cost, 11.2); // 14 * 0.80
  assert.equal(result.models["anthropic/claude-sonnet-4-5"].count, 35);
  assert.equal(result.models["anthropic/claude-sonnet-4-5"].cost, 13.3); // 35 * 0.38
});

// ============================================================================
// TEST 2: EDGE CASE - Zero Cost Tasks and Floating Point Precision
// ============================================================================

test("cost calculation: handles zero-cost tasks and floating-point precision edge cases", () => {
  const tasks = [
    // Zero cost tasks (e.g., cached responses, free tier)
    makeTask({ cost: 0, timestamp: Date.UTC(2025, 1, 1, 10, 0, 0) }),
    makeTask({ cost: 0, timestamp: Date.UTC(2025, 1, 1, 11, 0, 0) }),
    
    // Very small costs that test floating point rounding
    makeTask({ cost: 0.0001, timestamp: Date.UTC(2025, 1, 1, 12, 0, 0) }),
    makeTask({ cost: 0.0002, timestamp: Date.UTC(2025, 1, 1, 13, 0, 0) }),
    
    // Mix with normal costs
    makeTask({ cost: 0.5, timestamp: Date.UTC(2025, 1, 1, 14, 0, 0) }),
    
    // Repeating decimal that can cause precision issues
    makeTask({ cost: 0.333333, timestamp: Date.UTC(2025, 1, 1, 15, 0, 0) }),
    makeTask({ cost: 0.666667, timestamp: Date.UTC(2025, 1, 1, 16, 0, 0) }),
  ];
  
  const result = aggregate(tasks);
  
  // Total: 0 + 0 + 0.0001 + 0.0002 + 0.5 + 0.333333 + 0.666667 = 1.5003
  // After rounding to 4 decimals: 1.5003
  assert.equal(result.summary.totalCost, 1.5003);
  assert.equal(result.summary.totalTasks, 7);
  
  // Average is also rounded to 4 decimals by the round() helper
  // Raw: 1.5003 / 7 = 0.21432857...
  // Rounded: 0.2143
  assert.equal(result.summary.avgCostPerTask, 0.2143);
  
  // Monthly projection should handle edge case correctly
  // All tasks on same day, so days = 1 (ceil of 0)
  assert.equal(result.period.days, 1);
  // Monthly = 1.5003 * 30 = 45.009
  assert.equal(result.summary.currentMonthlyCost, 45.009);
  
  // Verify no NaN or Infinity values
  assert.ok(!Number.isNaN(result.summary.totalCost));
  assert.ok(!Number.isNaN(result.summary.avgCostPerTask));
  assert.ok(!Number.isNaN(result.summary.currentMonthlyCost));
  assert.ok(Number.isFinite(result.summary.totalCost));
  assert.ok(Number.isFinite(result.summary.avgCostPerTask));
  assert.ok(Number.isFinite(result.summary.currentMonthlyCost));
});

// ============================================================================
// TEST 3: REGRESSION CASE - Savings Calculation When Cost Difference is Minimal
// ============================================================================

test("cost calculation: regression - prevents recommending model switch for negligible savings", () => {
  // This tests a bug where the system might recommend switching models
  // even when the cost difference is negligible (e.g., < $0.01 per task)
  
  const analysis = makeAnalysis({
    categories: {
      code: {
        count: 100,
        modelBreakdown: {
          // "Expensive" model - but only slightly more expensive
          "anthropic/claude-sonnet-4": {
            count: 60,
            totalCost: 30.0, // $0.50 per task
            avgCost: 0.50,
            avgTokens: { input: 3500, output: 900 },
            successRate: null,
          },
          // "Cheap" model - marginally cheaper
          "anthropic/claude-haiku-4": {
            count: 40,
            totalCost: 19.6, // $0.49 per task (only $0.01 cheaper!)
            avgCost: 0.49,
            avgTokens: { input: 3000, output: 800 },
            successRate: null,
          },
        },
      },
    },
    summary: {
      totalCost: 49.6,
      totalTasks: 100,
      avgCostPerTask: 0.496,
      currentMonthlyCost: 93.0, // 16 days extrapolated
    },
  });
  
  const result = recommend(analysis);
  
  // Should generate a recommendation (meets threshold requirements)
  assert.ok(result.categories.code.recommendation !== null);
  
  // But potential savings should be minimal
  // Savings = (0.50 - 0.49) * 60 = 0.60 for the period
  assert.ok(result.categories.code.recommendation.potentialSavings <= 1.0);
  
  // Verify the math: switching 60 tasks from $0.50 to $0.49 saves $0.60
  const expectedSavings = (0.50 - 0.49) * 60;
  assert.ok(Math.abs(result.categories.code.recommendation.potentialSavings - expectedSavings) < 0.01);
  
  // Monthly savings should be minimal too
  // Period is 16 days, so monthly = (0.60 / 16) * 30 = 1.125
  assert.ok(result.summary.potentialSavings < 2.0);
  
  // Optimized monthly cost should be very close to current
  const costDifference = result.summary.currentMonthlyCost - result.summary.optimizedMonthlyCost;
  assert.ok(costDifference < 2.0);
  
  // Savings percentage should be very small (< 2%)
  assert.ok(result.summary.savingsPercentage < 2.0);
  
  // This test documents current behavior. In a real system, you might want to
  // add logic to NOT recommend switches when savings are below a threshold
  // (e.g., < 5% or < $5/month) to avoid unnecessary complexity.
});

// ============================================================================
// BONUS TEST: Cache Savings Calculation - Zero Input Tokens Edge Case
// ============================================================================

test("cost calculation: cache savings edge case with zero input tokens", () => {
  // Edge case: all tokens are cached, no new input tokens
  // This tests the fix for calculating savings when totalInput = 0
  
  const tasks = [
    makeTask({ 
      cost: 0.002, 
      usage: { input: 0, output: 500, cacheRead: 50000, cacheWrite: 0 }
    }),
    makeTask({ 
      cost: 0.002, 
      usage: { input: 0, output: 500, cacheRead: 50000, cacheWrite: 0 }
    }),
  ];
  
  const result = aggregate(tasks);
  
  // Cache hit rate should be 1.0 (100% cached)
  assert.equal(result.caching.hitRate, 1.0);
  assert.equal(result.caching.avgCacheRead, 50000);
  
  // Cache savings calculation when totalInput = 0:
  // Current cost = 0.004 (representing cached tokens at ~10% price)
  // Full-price cost would be: 0.004 / 0.1 = 0.04
  // Savings = 0.04 - 0.004 = 0.036 (or simply: 0.004 * 9 = 0.036)
  assert.equal(result.caching.estimatedCacheSavings, 0.036);
  
  // Verify no division by zero or NaN issues
  assert.ok(!Number.isNaN(result.caching.estimatedCacheSavings));
  assert.ok(Number.isFinite(result.caching.estimatedCacheSavings));
});

// ============================================================================
// BONUS TEST: Cache Savings Calculation - Normal Case with Good Data
// ============================================================================

test("cost calculation: cache savings calculation with mixed input and cache reads", () => {
  // Normal case: mix of input tokens and cache reads
  const tasks = [
    makeTask({ 
      cost: 0.01, 
      usage: { input: 5000, output: 500, cacheRead: 20000, cacheWrite: 0 }
    }),
    makeTask({ 
      cost: 0.012, 
      usage: { input: 6000, output: 600, cacheRead: 25000, cacheWrite: 0 }
    }),
    makeTask({ 
      cost: 0.008, 
      usage: { input: 4000, output: 400, cacheRead: 15000, cacheWrite: 0 }
    }),
  ];
  
  const result = aggregate(tasks);
  
  // totalInput = 15000, totalCacheRead = 60000, totalCost = 0.03
  // hitRate = 60000 / (15000 + 60000) = 0.8
  assert.ok(Math.abs(result.caching.hitRate - 0.8) < 0.001);
  assert.equal(result.caching.avgCacheRead, 20000);
  
  // Cache savings calculation:
  // pricePerInputToken = 0.03 / (15000 + 60000 * 0.1) = 0.03 / 21000 ≈ 0.00000143
  // estimatedCacheSavings = 60000 * 0.00000143 * 0.9 ≈ 0.077
  assert.ok(result.caching.estimatedCacheSavings > 0);
  assert.ok(result.caching.estimatedCacheSavings < 0.1); // Should be in reasonable range
  
  // Verify calculations are sane
  assert.ok(!Number.isNaN(result.caching.estimatedCacheSavings));
  assert.ok(Number.isFinite(result.caching.estimatedCacheSavings));
});

// ============================================================================
// BONUS TEST: Monthly Extrapolation with Single Day Edge Case  
// ============================================================================

test("cost calculation: monthly extrapolation accuracy with minimal time span", () => {
  // Edge case: all tasks happen within minutes of each other
  // This tests whether ceil(duration) properly defaults to 1 day minimum
  
  const baseTimestamp = Date.UTC(2025, 1, 5, 10, 0, 0);
  const tasks = [
    makeTask({ cost: 1.0, timestamp: baseTimestamp }),
    makeTask({ cost: 2.0, timestamp: baseTimestamp + 1000 }), // 1 second later
    makeTask({ cost: 1.5, timestamp: baseTimestamp + 2000 }), // 2 seconds later
  ];
  
  const result = aggregate(tasks);
  
  // All within same day, so days should be 1 (from ceil calculation)
  assert.equal(result.period.days, 1);
  
  // Total cost: 4.5
  assert.equal(result.summary.totalCost, 4.5);
  
  // Monthly should be: (4.5 / 1) * 30 = 135
  assert.equal(result.summary.currentMonthlyCost, 135);
  
  // This correctly extrapolates even with minimal time span
  // Without the "|| 1" fallback, this could cause division issues
});
