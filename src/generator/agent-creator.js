const CATEGORY_AGENT_NAMES = {
  code: "code-reviewer",
  write: "writer",
  research: "researcher",
  config: "config-manager",
};

const MIN_TASKS_FOR_AGENT = 50;

/**
 * Create specialized agent configs for high-volume task categories.
 * Returns an object of { agentName: agentConfig }.
 */
export function createAgents(analysis) {
  const agents = {};
  const dailyBudget =
    analysis.summary.currentMonthlyCost > 0
      ? analysis.summary.currentMonthlyCost / 30
      : 0;

  for (const [category, data] of Object.entries(analysis.categories)) {
    if (data.count < MIN_TASKS_FOR_AGENT) continue;
    if (category === "other") continue;

    const name = CATEGORY_AGENT_NAMES[category] || category;
    const model = pickModel(data, analysis.models);

    // Budget proportional to this category's share of total tasks
    const share = data.count / (analysis.summary.totalTasks || 1);
    const agentDailyBudget = round(dailyBudget * share * 1.2);

    agents[name] = {
      model: { primary: model },
      budget: { daily: agentDailyBudget },
    };
  }

  return agents;
}

/**
 * Pick the best model for a category:
 * - Use recommendation.optimalModel if available
 * - Otherwise pick the cheapest model in the breakdown
 */
function pickModel(categoryData, models) {
  if (categoryData.recommendation?.optimalModel) {
    return categoryData.recommendation.optimalModel;
  }

  // Cheapest model by avgCost in this category
  const entries = Object.entries(categoryData.modelBreakdown);
  if (entries.length === 0) return "unknown";

  entries.sort((a, b) => a[1].avgCost - b[1].avgCost);
  return entries[0][0];
}

function round(n) {
  return Math.round(n * 100) / 100;
}
