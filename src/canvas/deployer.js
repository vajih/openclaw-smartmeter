import { mkdir, copyFile, readFile, writeFile, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = join(__dirname, "..", "..", "canvas-template");
const CANVAS_DIR = join(homedir(), ".openclaw", "canvas", "smartmeter");
const TEMPLATE_FILES = ["index.html", "app.js", "styles.css"];

export class CanvasDeployer {
  constructor(opts = {}) {
    this.canvasDir = opts.canvasDir || CANVAS_DIR;
    this.templateDir = opts.templateDir || TEMPLATE_DIR;
  }

  /**
   * Copy template files (index.html, app.js, styles.css) to the canvas directory.
   * Returns an array of copied filenames.
   */
  async deploy() {
    await mkdir(this.canvasDir, { recursive: true });

    const copied = [];
    for (const file of TEMPLATE_FILES) {
      await copyFile(join(this.templateDir, file), join(this.canvasDir, file));
      copied.push(file);
    }
    return copied;
  }

  /**
   * Generate a sanitized analysis.public.json from the full analysis object.
   * Strips file paths and session details; keeps stats, costs, and recommendations.
   */
  async generatePublicAnalysis(analysis) {
    const s = analysis.summary || {};
    const totalCost = s.totalCost || 0;
    const days = analysis.period?.days || 1;

    // Model breakdown
    const modelBreakdown = Object.entries(analysis.models || {}).map(
      ([name, m]) => ({
        model: prettifyModelName(name),
        tasks: m.count,
        cost: round(m.cost, 2),
        avg_cost_per_task: round(m.avgCostPerTask, 3),
        percentage: round((m.cost / (totalCost || 1)) * 100, 1),
      }),
    );

    // Task / category breakdown
    const taskBreakdown = Object.entries(analysis.categories || {}).map(
      ([name, c]) => {
        const catCost = Object.values(c.modelBreakdown || {}).reduce(
          (sum, m) => sum + (m.totalCost || 0),
          0,
        );
        return {
          type: capitalize(name),
          count: c.count,
          percentage: round(
            (c.count / (analysis.period?.totalTasks || 1)) * 100,
            1,
          ),
          avg_cost: round(catCost / (c.count || 1), 3),
        };
      },
    );

    // Recommendations
    const recommendations = buildRecommendations(analysis);

    // Cache stats
    const caching = analysis.caching || {};
    const cacheStats = {
      total_requests: analysis.period?.totalTasks || 0,
      cache_hits: Math.round(
        (caching.hitRate || 0) * (analysis.period?.totalTasks || 0),
      ),
      cache_misses: Math.round(
        (1 - (caching.hitRate || 0)) * (analysis.period?.totalTasks || 0),
      ),
      hit_rate: round(caching.hitRate || 0, 3),
      savings_from_cache: round(caching.estimatedCacheSavings || 0, 2),
    };

    // Cost timeline (split evenly across period)
    const costTimeline = [];
    if (analysis.period) {
      const start = analysis.period.start.slice(0, 10);
      const end = analysis.period.end.slice(0, 10);
      if (start === end) {
        costTimeline.push({ date: start, cost: round(totalCost, 2), tasks: analysis.period.totalTasks });
      } else {
        const half = Math.ceil(analysis.period.totalTasks / 2);
        costTimeline.push({ date: start, cost: round(totalCost / 2, 2), tasks: half });
        costTimeline.push({ date: end, cost: round(totalCost / 2, 2), tasks: analysis.period.totalTasks - half });
      }
    }

    // Agent suggestions
    const agentSuggestions = Object.entries(analysis.categories || {})
      .filter(([, c]) => c.recommendation?.optimalModel)
      .map(([name, c]) => ({
        name: categoryToAgentName(name),
        purpose: categoryToPurpose(name),
        primary_model: c.recommendation.optimalModel,
        fallback_chain: [],
        estimated_tasks_per_month: Math.round(
          (c.count / days) * 30,
        ),
        estimated_monthly_savings: round(
          (c.recommendation.potentialSavings / days) * 30,
          2,
        ),
      }));

    // Warnings
    const warnings = [];
    if (days < 14) {
      warnings.push(
        `Only ${days} days of data analyzed - confidence is optimistic`,
      );
      warnings.push(
        "Run analysis again after 14+ days for production-grade recommendations",
      );
    }
    if ((caching.hitRate || 0) < 0.6) {
      warnings.push(
        `Cache hit rate is below optimal (${round((caching.hitRate || 0) * 100, 0)}% vs 60%+ target)`,
      );
    }

    const publicData = {
      version: "0.1.0",
      generated_at: new Date().toISOString(),
      start_date: analysis.period?.start?.slice(0, 10) || "",
      end_date: analysis.period?.end?.slice(0, 10) || "",
      days_analyzed: days,
      confidence_level: capitalize(s.confidence || "unknown"),
      total_tasks: analysis.period?.totalTasks || 0,
      daily_average: round(totalCost / days, 2),
      weekly_projected: round((totalCost / days) * 7, 2),
      monthly_projected_current: round(s.currentMonthlyCost || 0, 2),
      monthly_projected_optimized: round(s.optimizedMonthlyCost || s.currentMonthlyCost || 0, 2),
      cache_hit_rate: round(caching.hitRate || 0, 3),
      model_breakdown: modelBreakdown,
      task_breakdown: taskBreakdown,
      recommendations,
      cache_stats: cacheStats,
      cost_timeline: costTimeline,
      agent_suggestions: agentSuggestions,
      warnings,
    };

    const outPath = join(this.canvasDir, "analysis.public.json");
    await writeFile(outPath, JSON.stringify(publicData, null, 2) + "\n");
    return outPath;
  }

  /**
   * Return the canvas URL for the given gateway port.
   */
  getCanvasUrl(port = 8080) {
    return `http://localhost:${port}`;
  }

  /**
   * Open the dashboard in the default browser.
   */
  async openDashboard(port = 8080) {
    const open = (await import("open")).default;
    await open(this.getCanvasUrl(port));
  }

  /**
   * Check whether the canvas has been deployed (directory exists with index.html).
   */
  async isDeployed() {
    try {
      await access(join(this.canvasDir, "index.html"));
      return true;
    } catch {
      return false;
    }
  }
}

// --- Helpers ---

function round(n, decimals) {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function prettifyModelName(id) {
  const map = {
    "deepseek/deepseek-chat": "DeepSeek Chat",
    "anthropic/claude-sonnet-4.5": "Claude Sonnet 4.5",
    "anthropic/claude-opus-4.5": "Claude Opus 4.5",
    "delivery-mirror": "Delivery Mirror",
  };
  return map[id] || id;
}

const AGENT_NAME_MAP = {
  code: "code-reviewer",
  write: "writer",
  research: "researcher",
  config: "config-manager",
};

function categoryToAgentName(cat) {
  return AGENT_NAME_MAP[cat] || cat;
}

function categoryToPurpose(cat) {
  const map = {
    code: "Code reviews, debugging, refactoring",
    write: "Writing, documentation, content",
    research: "Research, analysis, comparisons",
    config: "Configuration, deployment, infrastructure",
  };
  return map[cat] || cat;
}

function buildRecommendations(analysis) {
  const recs = [];
  const s = analysis.summary || {};
  const caching = analysis.caching || {};
  const days = analysis.period?.days || 1;

  // Model switch recommendation
  const catEntries = Object.entries(analysis.categories || {});
  const totalSavings = catEntries.reduce(
    (sum, [, c]) => sum + (c.recommendation?.potentialSavings || 0),
    0,
  );
  if (totalSavings > 0) {
    const monthlySavings = round((totalSavings / days) * 30, 0);
    const topCat = catEntries
      .filter(([, c]) => c.recommendation?.optimalModel)
      .sort((a, b) => (b[1].recommendation?.potentialSavings || 0) - (a[1].recommendation?.potentialSavings || 0))[0];

    if (topCat) {
      const optModel = prettifyModelName(topCat[1].recommendation.optimalModel);
      recs.push({
        type: "model_switch",
        title: `Switch Primary Model to ${optModel}`,
        description: `${optModel} handles the majority of tasks at significantly lower cost. Ideal for your workload mix.`,
        impact: `$${monthlySavings}/month`,
        details: [
          `Recommended: ${optModel} for most tasks`,
          "Quality maintained with smart fallbacks",
        ],
      });
    }
  }

  // Agent creation
  const bigCats = catEntries.filter(([, c]) => c.count > 50 && c.recommendation?.optimalModel);
  for (const [name, c] of bigCats) {
    const agentName = categoryToAgentName(name);
    const monthlyTaskSavings = round((c.recommendation.potentialSavings / days) * 30, 0);
    recs.push({
      type: "agent_creation",
      title: `Create Specialized '${agentName}' Agent`,
      description: `${c.count} ${name} tasks detected. A dedicated agent optimized for ${categoryToPurpose(name).toLowerCase()} will reduce costs.`,
      impact: `$${monthlyTaskSavings}/month`,
      details: [
        `Optimized for: ${categoryToPurpose(name)}`,
        `Primary model: ${prettifyModelName(c.recommendation.optimalModel)}`,
      ],
    });
  }

  // Cache optimization
  if ((caching.hitRate || 0) < 0.6) {
    const targetRate = 0.65;
    const potentialMonthly = round(
      ((targetRate - (caching.hitRate || 0)) * (s.currentMonthlyCost || 0)) * 0.3,
      0,
    );
    recs.push({
      type: "cache_optimization",
      title: "Optimize Caching Strategy",
      description: `Current cache hit rate is only ${round((caching.hitRate || 0) * 100, 1)}%. Enabling long retention and heartbeat can improve this to 65%+.`,
      impact: `$${potentialMonthly}/month`,
      details: [
        `Current hit rate: ${round((caching.hitRate || 0) * 100, 1)}%`,
        "Target hit rate: 65%",
        "Enable: long_retention mode",
        "Set: 55-minute heartbeat interval",
      ],
    });
  }

  // Budget controls
  if (s.currentMonthlyCost > 0) {
    const dailyCap = round((s.optimizedMonthlyCost || s.currentMonthlyCost) / 30, 2);
    recs.push({
      type: "budget_control",
      title: "Add Budget Controls & Alerts",
      description: "Set daily spending caps and weekly alerts to prevent unexpected cost spikes.",
      impact: "Prevent overruns",
      details: [
        `Daily cap: $${dailyCap}`,
        `Weekly alert: at 75% ($${round(dailyCap * 7 * 0.75, 2)})`,
        `Monthly budget: $${round(s.optimizedMonthlyCost || s.currentMonthlyCost, 0)}`,
        "Auto-pause: at 95% of budget",
      ],
    });
  }

  return recs;
}
