export function formatCurrency(n) {
  return `$${Number(n).toFixed(2)}`;
}

export function formatPercent(n) {
  return `${Number(n).toFixed(1)}%`;
}

/**
 * Render an array of { label, value } rows as an aligned text table.
 */
export function formatTable(rows) {
  if (rows.length === 0) return "";
  const maxLabel = Math.max(...rows.map((r) => r.label.length));
  return rows
    .map((r) => `  ${r.label.padEnd(maxLabel)}  ${r.value}`)
    .join("\n");
}

/**
 * Compact summary of analysis results.
 */
export function formatSummary(analysis) {
  if (!analysis?.period) return "No analysis data available.";

  const s = analysis.summary;
  const lines = [
    `Analysis: ${analysis.period.start.slice(0, 10)} to ${analysis.period.end.slice(0, 10)} (${analysis.period.days} days)`,
    "",
    formatTable([
      { label: "Total tasks", value: String(analysis.period.totalTasks) },
      { label: "Total cost", value: formatCurrency(s.totalCost) },
      { label: "Monthly cost (projected)", value: formatCurrency(s.currentMonthlyCost) },
      { label: "Optimized monthly cost", value: formatCurrency(s.optimizedMonthlyCost ?? s.currentMonthlyCost) },
      { label: "Potential savings", value: `${formatCurrency(s.potentialSavings ?? 0)}/month (${formatPercent(s.savingsPercentage ?? 0)})` },
      { label: "Confidence", value: s.confidence ?? "n/a" },
    ]),
  ];

  return lines.join("\n");
}

/**
 * Detailed report: models, categories, temporal, caching.
 */
export function formatReport(analysis) {
  if (!analysis?.period) return "No analysis data available.";

  const sections = [formatSummary(analysis)];

  // Models
  const modelRows = Object.entries(analysis.models || {}).map(
    ([name, m]) => ({
      label: name,
      value: `${m.count} tasks, ${formatCurrency(m.cost)} total, ${formatCurrency(m.avgCostPerTask)}/task`,
    }),
  );
  if (modelRows.length > 0) {
    sections.push("\nModels:\n" + formatTable(modelRows));
  }

  // Categories
  const catRows = Object.entries(analysis.categories || {}).map(
    ([name, c]) => {
      const rec = c.recommendation;
      const recText = rec
        ? ` -> recommend ${rec.optimalModel} (saves ${formatCurrency(rec.potentialSavings)})`
        : "";
      return { label: name, value: `${c.count} tasks${recText}` };
    },
  );
  if (catRows.length > 0) {
    sections.push("\nCategories:\n" + formatTable(catRows));
  }

  // Temporal
  const patterns = analysis.temporal?.patterns || {};
  const temporalRows = [
    { label: "Usage pattern", value: patterns.burstUsage ? "Burst" : "Steady" },
  ];
  if (patterns.peakHours?.length > 0) {
    temporalRows.push({ label: "Peak hours", value: patterns.peakHours.join(", ") });
  }
  if (patterns.quietHours?.length > 0) {
    temporalRows.push({ label: "Quiet hours", value: patterns.quietHours.join(", ") });
  }
  sections.push("\nTemporal:\n" + formatTable(temporalRows));

  // Caching
  const caching = analysis.caching || {};
  const cacheRows = [
    { label: "Cache hit rate", value: formatPercent((caching.hitRate || 0) * 100) },
    { label: "Avg cache read", value: `${caching.avgCacheRead || 0} tokens` },
    { label: "Est. cache savings", value: formatCurrency(caching.estimatedCacheSavings || 0) },
  ];
  if (caching.recommendation) {
    cacheRows.push({ label: "Recommendation", value: caching.recommendation });
  }
  sections.push("\nCaching:\n" + formatTable(cacheRows));

  return sections.join("\n");
}

/**
 * Describe what a generated config would change.
 */
export function formatPreview(config, backup) {
  const changes = [];

  const newPrimary = config.agents?.defaults?.model?.primary;
  const oldPrimary = backup?.agents?.defaults?.model?.primary;
  if (newPrimary && newPrimary !== oldPrimary) {
    changes.push(`Primary model: ${oldPrimary || "(none)"} -> ${newPrimary}`);
  }

  const fallback = config.agents?.defaults?.model?.fallback;
  if (fallback?.length > 0) {
    changes.push(`Fallback chain: ${fallback.join(" -> ")}`);
  }

  // New agents (keys in config.agents that aren't in backup.agents and aren't "defaults")
  const newAgentNames = Object.keys(config.agents || {}).filter(
    (k) => k !== "defaults" && !backup?.agents?.[k],
  );
  if (newAgentNames.length > 0) {
    changes.push(`New agents: ${newAgentNames.join(", ")}`);
  }

  const budget = config.agents?.defaults?.budget;
  if (budget?.daily) {
    changes.push(`Budget: ${formatCurrency(budget.daily)}/day, ${formatCurrency(budget.weekly)}/week`);
  }

  if (config.models) {
    changes.push("Caching: long retention enabled");
  }
  if (config.heartbeat) {
    changes.push(`Heartbeat: every ${config.heartbeat.every} during ${config.heartbeat.schedule}`);
  }

  if (changes.length === 0) {
    return "No changes to apply.";
  }

  return "Proposed changes:\n" + changes.map((c) => `  - ${c}`).join("\n");
}
