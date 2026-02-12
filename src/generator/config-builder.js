import { createAgents } from "./agent-creator.js";
import { deepMerge } from "./merger.js";
import { validate } from "./validator.js";

/**
 * Generate an optimized openclaw.json config from analysis data.
 *
 * @param {object} analysis - Enriched analysis from recommend()
 * @param {object} currentConfig - Existing openclaw.json (or {} for fresh)
 * @returns {{ config: object, validation: object, backup: object }}
 */
export function generateConfig(analysis, currentConfig = {}) {
  const backup = structuredClone(currentConfig);
  const comments = {};

  // Start from a scaffold, then merge with existing config
  let config = deepMerge(scaffold(), currentConfig);

  // 1. Primary model optimization
  const { primary, oldPrimary } = optimizePrimary(analysis, config);
  config.agents.defaults.model.primary = primary;
  if (oldPrimary && oldPrimary !== primary) {
    comments["agents.defaults.model.primary"] =
      `SMARTMETER: Changed from ${oldPrimary}. ` +
      `Saves ~$${analysis.summary.potentialSavings}/month`;
  }

  // 2. Specialized agents
  const agents = createAgents(analysis);
  for (const [name, agentConfig] of Object.entries(agents)) {
    config.agents[name] = agentConfig;
    comments[`agents.${name}`] =
      `SMARTMETER: Auto-created for ${name} workload`;
  }

  // 3. Skill optimization (no-op while skills are stubbed)
  const usedSkillNames = Object.keys(analysis.skills.used || {});
  if (usedSkillNames.length > 0 && usedSkillNames.length < 20) {
    config.skills = {
      allowBundled: false,
      allow: usedSkillNames,
    };
    const unusedCount = (analysis.skills.unused || []).length;
    comments["skills"] =
      `SMARTMETER: Disabled ${unusedCount} unused skills. ` +
      `Saves ~${unusedCount * 200} tokens/request`;
  }

  // 4. Caching configuration
  const patterns = analysis.temporal?.patterns || {};
  if (patterns.burstUsage) {
    const primaryModel = config.agents.defaults.model.primary;
    config.models = config.models || {};
    config.models[primaryModel] = deepMerge(
      config.models[primaryModel] || {},
      { params: { cacheRetention: "long" } },
    );

    if (patterns.quietHours?.length > 0) {
      const quietRange = patterns.quietHours[0]; // e.g. "00-06"
      config.heartbeat = {
        every: "55m",
        schedule: quietRange,
      };
    }

    comments["models"] = "SMARTMETER: Long cache retention for burst usage";
  }

  // 5. Budget controls
  // Use minimum budget values when costs are zero or very low to ensure valid config
  const MIN_DAILY_BUDGET = 1.00;  // $1/day minimum
  const MIN_WEEKLY_BUDGET = 5.00; // $5/week minimum
  
  const dailyAvg = (analysis.summary.currentMonthlyCost || 0) / 30;
  const calculatedDaily = Math.ceil(dailyAvg * 1.2 * 100) / 100;
  const dailyBudget = Math.max(calculatedDaily, MIN_DAILY_BUDGET);
  const weeklyBudget = Math.max(Math.ceil(dailyBudget * 7 * 100) / 100, MIN_WEEKLY_BUDGET);

  config.agents.defaults.budget = deepMerge(
    config.agents.defaults.budget || {},
    {
      daily: dailyBudget,
      weekly: weeklyBudget,
      alert: { telegram: true, threshold: 0.75 },
    },
  );

  // 6. Fallback chain
  const fallback = buildFallbackChain(
    analysis.models,
    config.agents.defaults.model.primary,
  );
  if (fallback.length > 0) {
    config.agents.defaults.model.fallback = fallback;
  }

  // Metadata
  config._smartmeter = {
    generatedAt: new Date().toISOString(),
    analysisperiod: analysis.period,
    comments,
  };

  const validation = validate(config);

  return { config, validation, backup };
}

// --- Internals ---

function scaffold() {
  return {
    agents: {
      defaults: {
        model: { primary: "unknown" },
        budget: {},
      },
    },
  };
}

/**
 * Determine the optimal primary model.
 * Strategy: find the dominant category (most tasks), use its recommendation.
 */
function optimizePrimary(analysis, config) {
  const oldPrimary = config.agents?.defaults?.model?.primary;

  // Find the category with the most tasks that has a recommendation
  let bestCategory = null;
  let bestCount = 0;
  for (const [name, cat] of Object.entries(analysis.categories || {})) {
    if (cat.recommendation && cat.count > bestCount) {
      bestCount = cat.count;
      bestCategory = cat;
    }
  }

  if (bestCategory?.recommendation?.confidence >= 0.7) {
    return {
      primary: bestCategory.recommendation.optimalModel,
      oldPrimary,
    };
  }

  // No strong recommendation — keep existing or pick the most-used model
  if (oldPrimary && oldPrimary !== "unknown") {
    return { primary: oldPrimary, oldPrimary: null };
  }

  const models = Object.entries(analysis.models || {});
  if (models.length === 0) return { primary: "unknown", oldPrimary: null };

  models.sort((a, b) => b[1].count - a[1].count);
  return { primary: models[0][0], oldPrimary: null };
}

/**
 * Build fallback chain: all models sorted by avgCostPerTask ascending,
 * excluding the primary.
 */
function buildFallbackChain(models, primary) {
  return Object.entries(models || {})
    .filter(([name]) => name !== primary)
    .sort((a, b) => a[1].avgCostPerTask - b[1].avgCostPerTask)
    .map(([name]) => name);
}
