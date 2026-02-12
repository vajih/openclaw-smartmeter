/**
 * Enriches an aggregated analysis object with recommendations.
 * Called after aggregate() — adds per-category recommendations,
 * summary savings projections, and caching advice.
 *
 * Returns a new object; does not mutate the input.
 */
export function recommend(analysis) {
  const result = structuredClone(analysis);

  if (!result.period || result.summary.totalTasks === 0) {
    return result;
  }

  // Per-category recommendations
  for (const [name, cat] of Object.entries(result.categories)) {
    cat.recommendation = buildCategoryRecommendation(cat);
  }

  // Caching recommendation
  result.caching.recommendation = buildCachingRecommendation(
    result.caching,
    result.temporal.patterns,
  );

  // Enriched summary
  const totalSavings = sumCategorySavings(result.categories);
  const days = result.period.days || 1;
  const monthlySavings = round((totalSavings / days) * 30);

  result.summary.potentialSavings = monthlySavings;
  result.summary.optimizedMonthlyCost = round(
    result.summary.currentMonthlyCost - monthlySavings,
  );
  result.summary.savingsPercentage =
    result.summary.currentMonthlyCost > 0
      ? round((monthlySavings / result.summary.currentMonthlyCost) * 100, 1)
      : 0;

  const avgConfidence = averageCategoryConfidence(result.categories);
  result.summary.confidence = confidenceLabel(avgConfidence);

  // Build top-level recommendations array for CLI evaluate/guide and dashboard
  result.recommendations = buildRecommendationsArray(result);

  return result;
}

// --- Category recommendation ---

function buildCategoryRecommendation(category) {
  const models = Object.entries(category.modelBreakdown);

  // Need at least 2 models and 3 total tasks to make a recommendation
  if (models.length < 2 || category.count < 3) {
    return null;
  }

  // Sort by avgCost descending to find most expensive (current) model
  models.sort((a, b) => b[1].avgCost - a[1].avgCost);
  const [currentModel, currentStats] = models[0];

  // Find cheapest model with sufficient usage (>= 5 tasks or >= 20% of category)
  const threshold = Math.max(5, Math.ceil(category.count * 0.2));
  let optimal = null;

  for (let i = models.length - 1; i >= 0; i--) {
    const [model, stats] = models[i];
    if (model === currentModel) continue;
    if (stats.count >= threshold) {
      optimal = [model, stats];
      break;
    }
  }

  // Also consider models with fewer tasks but still some evidence
  if (!optimal) {
    for (let i = models.length - 1; i >= 0; i--) {
      const [model, stats] = models[i];
      if (model === currentModel) continue;
      if (stats.count >= 2) {
        optimal = [model, stats];
        break;
      }
    }
  }

  if (!optimal || optimal[0] === currentModel) {
    return null;
  }

  const [optimalModel, optimalStats] = optimal;

  // Confidence: based on how many tasks used the cheaper model
  const confidence = round(Math.min(optimalStats.count / 30, 0.99), 2);

  // Potential savings: how much we'd save if the expensive-model tasks used the cheaper one
  const potentialSavings = round(
    (currentStats.avgCost - optimalStats.avgCost) * currentStats.count,
  );

  if (potentialSavings <= 0) return null;

  return {
    currentModel,
    optimalModel,
    confidence,
    potentialSavings,
  };
}

// --- Caching recommendation ---

function buildCachingRecommendation(caching, patterns) {
  if (patterns.burstUsage) {
    return "Enable long retention + 55min heartbeat";
  }
  if (caching.hitRate < 0.3) {
    return "Low cache hit rate — consider longer context reuse";
  }
  if (caching.hitRate >= 0.6) {
    return "Good cache utilization — maintain current approach";
  }
  return "Default caching configuration is adequate";
}

// --- Recommendations array builder ---

/**
 * Build a user-facing recommendations array from per-category analysis.
 * Each recommendation has: type, title, description, impact, details.
 */
function buildRecommendationsArray(analysis) {
  const recs = [];

  // 1. Per-category model switch recommendations
  for (const [name, cat] of Object.entries(analysis.categories)) {
    const rec = cat.recommendation;
    if (!rec || rec.potentialSavings <= 0) continue;

    recs.push({
      type: "model_switch",
      title: `Switch ${name} tasks to ${shortModelName(rec.optimalModel)}`,
      description:
        `${cat.count} ${name} tasks detected. ` +
        `${shortModelName(rec.optimalModel)} handles these at ` +
        `${round((1 - rec.confidence) * 100 + rec.confidence * 100, 0)}% confidence ` +
        `for a fraction of the cost of ${shortModelName(rec.currentModel)}.`,
      impact: `$${round(rec.potentialSavings / (analysis.period?.days || 1) * 30, 2)}/month`,
      details: [
        `Current: ${rec.currentModel}`,
        `Recommended: ${rec.optimalModel}`,
        `Confidence: ${round(rec.confidence * 100, 0)}%`,
        `Est. savings: $${round(rec.potentialSavings, 2)} over analysis period`,
      ],
    });
  }

  // 2. Caching recommendation
  const caching = analysis.caching || {};
  if (caching.hitRate < 0.5) {
    const targetRate = Math.min(caching.hitRate + 0.4, 0.65);
    recs.push({
      type: "cache_optimization",
      title: "Optimize Caching Strategy",
      description:
        `Current cache hit rate is ${round(caching.hitRate * 100, 1)}%. ` +
        `Enabling long retention and heartbeat intervals can improve this to ${round(targetRate * 100, 0)}%+.`,
      impact: caching.estimatedCacheSavings > 0
        ? `$${round(caching.estimatedCacheSavings, 2)}/month potential`
        : "Improved performance",
      details: [
        `Current hit rate: ${round(caching.hitRate * 100, 1)}%`,
        `Target hit rate: ${round(targetRate * 100, 0)}%`,
        `Enable: long_retention mode`,
        `Set: 55-minute heartbeat interval`,
      ],
    });
  }

  // 3. Budget controls
  const monthlyCost = analysis.summary.currentMonthlyCost || 0;
  if (monthlyCost > 0) {
    const dailyCap = round(monthlyCost / 30 * 1.2, 2);
    recs.push({
      type: "budget_control",
      title: "Add Budget Controls & Alerts",
      description:
        "Set daily spending caps and weekly alerts to prevent unexpected cost spikes.",
      impact: "Prevent overruns",
      details: [
        `Daily cap: $${dailyCap}`,
        `Weekly alert: at 75% ($${round(dailyCap * 7 * 0.75, 2)})`,
        `Monthly budget: $${round(monthlyCost, 2)}`,
        `Auto-pause: at 95% of budget`,
      ],
    });
  }

  // 4. Agent creation recommendations (for high-volume categories without agents)
  for (const [name, cat] of Object.entries(analysis.categories)) {
    if (name === "other") continue;
    if (cat.count >= 50) {
      const agentName = CATEGORY_AGENT_NAMES[name] || name;
      const cheapestModel = findCheapestModel(cat.modelBreakdown);
      recs.push({
        type: "agent_creation",
        title: `Create Specialized '${agentName}' Agent`,
        description:
          `${cat.count} ${name} tasks detected. A dedicated agent optimized for ` +
          `${name} work will reduce costs while improving response quality.`,
        impact: cat.recommendation?.potentialSavings > 0
          ? `$${round(cat.recommendation.potentialSavings / (analysis.period?.days || 1) * 30, 2)}/month`
          : "Performance boost",
        details: [
          `Optimized for: ${name} tasks`,
          `Primary model: ${cheapestModel || "auto-selected"}`,
          `Fallback: premium models on demand`,
          `Expected task volume: ${cat.count}/period`,
        ],
      });
    }
  }

  return recs;
}

const CATEGORY_AGENT_NAMES = {
  code: "code-reviewer",
  write: "writer",
  research: "researcher",
  config: "config-manager",
};

function shortModelName(model) {
  if (!model) return "Unknown";
  // "anthropic/claude-sonnet-4-5" → "Claude Sonnet 4.5"
  const parts = model.split("/");
  const name = parts[parts.length - 1];
  return name
    .split("-")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function findCheapestModel(modelBreakdown) {
  const entries = Object.entries(modelBreakdown || {});
  if (entries.length === 0) return null;
  entries.sort((a, b) => a[1].avgCost - b[1].avgCost);
  return entries[0][0];
}

// --- Summary helpers ---

function sumCategorySavings(categories) {
  let total = 0;
  for (const cat of Object.values(categories)) {
    if (cat.recommendation?.potentialSavings > 0) {
      total += cat.recommendation.potentialSavings;
    }
  }
  return total;
}

function averageCategoryConfidence(categories) {
  const confidences = [];
  for (const cat of Object.values(categories)) {
    if (cat.recommendation?.confidence != null) {
      confidences.push(cat.recommendation.confidence);
    }
  }
  if (confidences.length === 0) return 0;
  return confidences.reduce((s, c) => s + c, 0) / confidences.length;
}

function confidenceLabel(avgConfidence) {
  if (avgConfidence < 0.4) return "conservative";
  if (avgConfidence < 0.7) return "likely";
  return "optimistic";
}

// --- Helpers ---

function round(n, decimals = 4) {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}
