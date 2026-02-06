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
