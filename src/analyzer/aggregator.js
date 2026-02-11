/**
 * Cost Calculation Engine - Design & Assumptions
 * 
 * This module aggregates task-level cost and usage data into a comprehensive analysis.
 * 
 * ROUNDING STRATEGY:
 * - All cost values are rounded to 4 decimal places (e.g., $0.0001)
 * - This provides precision to 1/100th of a cent while preventing floating-point drift
 * - Token counts are rounded to integers (no fractional tokens)
 * - Percentages are rounded to 1 decimal (e.g., 42.7%)
 * 
 * CACHE SAVINGS ESTIMATION:
 * - Assumption: Cached tokens cost ~10% of regular input token price
 * - For mixed input/cache: Calculate price per input token from actual costs,
 *   then estimate savings as: cacheRead × pricePerInputToken × 0.9
 * - For 100% cached (no input): Current cost represents ~10% of full price,
 *   so savings = currentCost × 9
 * - This is conservative; actual cache pricing may vary by provider
 * 
 * MONTHLY EXTRAPOLATION:
 * - Formula: (totalCost / daysInSample) × 30
 * - Minimum sample period: 1 day (prevents division by zero)
 * - Assumes consistent usage patterns; may be inaccurate for bursty workloads
 * 
 * COST ATTRIBUTION:
 * - Each task must have a `cost` field (pre-calculated by provider)
 * - Costs are summed at model/category/summary levels
 * - No assumptions about per-token pricing (provider-agnostic)
 */

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Aggregate classified tasks into a full analysis object.
 * Expects tasks to have `category` set (via classifyTasks).
 */
export function aggregate(tasks) {
  if (tasks.length === 0) {
    return {
      period: null,
      models: {},
      categories: {},
      skills: { used: {}, unused: [] },
      temporal: { hourly: {}, daily: {}, patterns: {} },
      caching: { hitRate: 0, avgCacheRead: 0, estimatedCacheSavings: 0 },
      summary: { totalCost: 0, totalTasks: 0, avgCostPerTask: 0, currentMonthlyCost: 0 },
    };
  }

  return {
    period: computePeriod(tasks),
    models: aggregateModels(tasks),
    categories: aggregateCategories(tasks),
    skills: { used: {}, unused: [] }, // Stub — awaiting skill log format
    temporal: aggregateTemporal(tasks),
    caching: aggregateCaching(tasks),
    summary: computeSummary(tasks),
  };
}

// --- Period ---

function computePeriod(tasks) {
  const timestamps = tasks.map((t) => t.timestamp).filter((t) => t != null);
  if (timestamps.length === 0) return null;

  timestamps.sort((a, b) => a - b);
  const start = new Date(timestamps[0]);
  const end = new Date(timestamps[timestamps.length - 1]);
  const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) || 1;

  return {
    start: start.toISOString(),
    end: end.toISOString(),
    days,
    totalTasks: tasks.length,
  };
}

// --- Models ---

function aggregateModels(tasks) {
  const models = {};

  for (const task of tasks) {
    const m = task.model;
    if (!models[m]) {
      models[m] = { count: 0, tokens: { input: 0, output: 0 }, cost: 0 };
    }
    models[m].count++;
    models[m].tokens.input += task.usage.input;
    models[m].tokens.output += task.usage.output;
    models[m].cost += task.cost;
  }

  // Round costs and compute averages
  for (const m of Object.values(models)) {
    m.cost = round(m.cost);
    m.avgCostPerTask = round(m.cost / m.count);
  }

  return models;
}

// --- Categories ---

function aggregateCategories(tasks) {
  const categories = {};

  for (const task of tasks) {
    const cat = task.category || "other";
    if (!categories[cat]) {
      categories[cat] = { count: 0, modelBreakdown: {} };
    }
    categories[cat].count++;

    const mb = categories[cat].modelBreakdown;
    if (!mb[task.model]) {
      mb[task.model] = { count: 0, totalCost: 0, totalTokensIn: 0, totalTokensOut: 0 };
    }
    mb[task.model].count++;
    mb[task.model].totalCost += task.cost;
    mb[task.model].totalTokensIn += task.usage.input;
    mb[task.model].totalTokensOut += task.usage.output;
  }

  // Compute derived fields per model within each category
  for (const cat of Object.values(categories)) {
    for (const m of Object.values(cat.modelBreakdown)) {
      m.avgCost = round(m.totalCost / m.count);
      m.totalCost = round(m.totalCost);
      m.avgTokens = {
        input: Math.round(m.totalTokensIn / m.count),
        output: Math.round(m.totalTokensOut / m.count),
      };
      // Stubbed — requires re-prompt timing analysis (see docs/backlog.md)
      m.successRate = null;
      delete m.totalTokensIn;
      delete m.totalTokensOut;
    }
  }

  return categories;
}

// --- Temporal ---

function aggregateTemporal(tasks) {
  const hourly = {};
  const daily = {};

  for (const task of tasks) {
    if (task.timestamp == null) continue;
    const d = new Date(task.timestamp);
    const hour = String(d.getUTCHours()).padStart(2, "0");
    const day = DAY_NAMES[d.getUTCDay()];

    hourly[hour] = (hourly[hour] || 0) + 1;
    daily[day] = (daily[day] || 0) + 1;
  }

  return {
    hourly,
    daily,
    patterns: detectPatterns(hourly),
  };
}

function detectPatterns(hourly) {
  // Build full 24-hour array
  const counts = [];
  for (let h = 0; h < 24; h++) {
    const key = String(h).padStart(2, "0");
    counts.push(hourly[key] || 0);
  }

  const total = counts.reduce((s, c) => s + c, 0);
  if (total === 0) return { burstUsage: false, peakHours: [], quietHours: [] };

  const mean = total / 24;
  const variance = counts.reduce((s, c) => s + (c - mean) ** 2, 0) / 24;
  const stddev = Math.sqrt(variance);

  // Burst = high variation relative to mean
  const burstUsage = mean > 0 && stddev / mean > 1.5;

  // Peak hours: consecutive ranges above average
  const peakHours = findRanges(counts, (c) => c > mean);

  // Quiet hours: consecutive ranges with zero usage
  const quietHours = findRanges(counts, (c) => c === 0);

  return { burstUsage, peakHours, quietHours };
}

/**
 * Find consecutive hour ranges where predicate is true.
 * Returns array of strings like "08-10", "14-16".
 */
function findRanges(counts, predicate) {
  const ranges = [];
  let start = null;

  for (let h = 0; h < 24; h++) {
    if (predicate(counts[h])) {
      if (start === null) start = h;
    } else {
      if (start !== null) {
        ranges.push(formatRange(start, h));
        start = null;
      }
    }
  }
  if (start !== null) {
    ranges.push(formatRange(start, 24));
  }

  return ranges;
}

function formatRange(start, end) {
  const s = String(start).padStart(2, "0");
  const e = String(end % 24).padStart(2, "0");
  return `${s}-${e}`;
}

// --- Caching ---

function aggregateCaching(tasks) {
  let totalInput = 0;
  let totalCacheRead = 0;
  let totalCost = 0;

  for (const task of tasks) {
    totalInput += task.usage.input;
    totalCacheRead += task.usage.cacheRead;
    totalCost += task.cost;
  }

  const totalTokens = totalInput + totalCacheRead;
  const hitRate = totalTokens > 0 ? round(totalCacheRead / totalTokens) : 0;
  const avgCacheRead = tasks.length > 0 ? Math.round(totalCacheRead / tasks.length) : 0;

  // Estimate savings: cached tokens cost ~10% of input price.
  // If they weren't cached, they'd cost full input price.
  // Savings = cacheRead * (inputPricePerToken * 0.9)
  let estimatedCacheSavings = 0;
  
  if (totalCacheRead > 0) {
    if (totalInput > 0) {
      // Normal case: mix of input and cached tokens
      // We estimate inputPricePerToken from actual cost / actual input tokens
      const pricePerInputToken = totalCost / (totalInput + totalCacheRead * 0.1);
      estimatedCacheSavings = round(totalCacheRead * pricePerInputToken * 0.9);
    } else if (totalCost > 0) {
      // Edge case: all tokens are cached (totalInput = 0)
      // Current cost represents cached tokens at ~10% of regular price
      // Estimated full-price cost would be: totalCost / 0.1
      // Savings = (totalCost / 0.1) - totalCost = totalCost * 9
      estimatedCacheSavings = round(totalCost * 9);
    }
  }

  return { hitRate, avgCacheRead, estimatedCacheSavings };
}

// --- Summary ---

function computeSummary(tasks) {
  let totalCost = 0;
  for (const task of tasks) {
    totalCost += task.cost;
  }

  const totalTasks = tasks.length;
  const avgCostPerTask = totalTasks > 0 ? round(totalCost / totalTasks) : 0;

  // Extrapolate monthly cost from the data period
  const period = computePeriod(tasks);
  const days = period?.days || 1;
  const currentMonthlyCost = round((totalCost / days) * 30);

  return {
    totalCost: round(totalCost),
    totalTasks,
    avgCostPerTask,
    currentMonthlyCost,
  };
}

// --- Helpers ---

function round(n, decimals = 4) {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}
