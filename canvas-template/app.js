/**
 * SmartMeter Dashboard — app.js
 * Fully redesigned: sidebar nav, editable recommendations, modern UI
 */

/* ─── Globals ─── */
const API_BASE_URL = `http://localhost:${window.__SMARTMETER_API_PORT || 3001}`;
let analysisData = null;
let modelChart = null;
let taskChart = null;
let autoRefreshTimer = null;
let editedRecommendations = {}; // keyed by index
let selectedModels = {};        // keyed by category, stores chosen model id
let budgetState = {};           // current budget control values

/* ─── Init ─── */
document.addEventListener('DOMContentLoaded', () => {
  initializeDashboard();
});

async function initializeDashboard() {
  try {
    // Try to load data from local file first (works when served statically)
    await loadAnalysisData();
    hideLoading();
    initGetStartedCard();
    checkOpenRouterConfig();
    startAutoRefresh();
  } catch (err) {
    console.error('Init error:', err);
    hideLoading();
    showToast('Failed to load dashboard data');
  }
}

/* ─── Data Loading ─── */
async function loadAnalysisData() {
  try {
    // First try the API
    const res = await fetch(`${API_BASE_URL}/api/status`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const json = await res.json();
      if (json.success && json.analysis) {
        analysisData = normalizeApiData(json.analysis);
        renderAll();
        return;
      }
    }
  } catch {
    // API not available — try local file
  }

  // Fallback: load public JSON
  try {
    const res = await fetch('analysis.public.json');
    if (res.ok) {
      analysisData = await res.json();
      renderAll();
      return;
    }
  } catch {
    // noop
  }

  console.warn('No analysis data available');
}

function normalizeApiData(api) {
  // Reshape API /status data → same shape as analysis.public.json
  const s = api.summary || {};
  const p = api.period || {};
  return {
    version: api.version || '0.1.0',
    generated_at: new Date().toISOString(),
    start_date: p.start || '--',
    end_date: p.end || '--',
    days_analyzed: p.days || 0,
    confidence_level: s.confidence || api.confidence || 'Unknown',
    total_tasks: s.totalTasks || 0,
    daily_average: s.dailyAverage || 0,
    monthly_projected_current: s.currentMonthlyCost || 0,
    monthly_projected_optimized: s.optimizedMonthlyCost || 0,
    cache_hit_rate: api.caching?.hitRate || 0,
    model_breakdown: Object.entries(api.models || {}).map(([model, m]) => ({
      model,
      tasks: m.count || 0,
      cost: m.cost || 0,
      avg_cost_per_task: m.avgCostPerTask || 0,
      percentage: 0 // calculated later
    })),
    task_breakdown: Object.entries(api.taskTypes || {}).map(([type, t]) => ({
      type,
      count: t.count || 0,
      percentage: 0,
      avg_cost: t.avgCost || 0
    })),
    recommendations: (api.recommendations || []).map(r => ({
      type: r.type || 'general',
      title: r.title,
      description: r.description,
      impact: r.impact || r.estimatedSavings || '--',
      details: r.details || []
    })),
    cache_stats: api.caching || {},
    cost_timeline: api.costTimeline || [],
    model_alternatives: api.modelAlternatives || api.model_alternatives || [],
    budget_defaults: api.budgetDefaults || api.budget_defaults || {},
    warnings: api.warnings || []
  };
}

/* ─── Render All ─── */
function renderAll() {
  if (!analysisData) return;
  const safe = fn => { try { fn(); } catch (e) { console.error(`[SmartMeter] ${fn.name} error:`, e); } };
  safe(updateKPIs);
  safe(updateMetrics);
  safe(updateCharts);
  safe(updateRecommendations);
  safe(updateModelRecommendations);
  safe(updateOtherRecommendations);
  safe(updateBudgetControls);
  safe(updateModelDetails);
  safe(updateLastUpdated);
  safe(checkCostDataNotice);
  safe(() => populateStepPanel(activeStep));
}

/* ─── KPIs ─── */
function updateKPIs() {
  const d = analysisData;
  const current = d.monthly_projected_current || 0;
  const optimized = d.monthly_projected_optimized || 0;
  const savings = current - optimized;
  const pct = current > 0 ? ((savings / current) * 100) : 0;

  setText('currentCost', `$${current.toFixed(2)}<small>/mo</small>`);
  setText('optimizedCost', `$${optimized.toFixed(2)}<small>/mo</small>`);
  setText('savingsAmount', `$${savings.toFixed(2)}`);
  setText('savingsPercentage', pct > 0 ? `↓ ${pct.toFixed(1)}% reduction` : '--');
}

/* ─── Metrics ─── */
function updateMetrics() {
  const d = analysisData;
  setText('analysisPeriod', `${d.days_analyzed || 0} days`);
  setText('totalTasks', String(d.total_tasks || 0));
  setText('cacheHitRate', `${((d.cache_hit_rate || 0) * 100).toFixed(1)}%`);
  const daily = d.daily_average ? (d.daily_average * (d.monthly_projected_current / (d.total_tasks || 1))) : 0;
  setText('dailySpend', `$${daily.toFixed(2)}`);

  const conf = d.confidence_level || 'Unknown';
  const badge = document.getElementById('confidenceBadge');
  if (badge) {
    badge.querySelector('.confidence-text').textContent = `Confidence: ${conf}`;
  }
}

/* ─── Charts ─── */
function updateCharts() {
  updateModelChart();
  updateTaskChart();
}

function updateModelChart() {
  const ctx = document.getElementById('modelChart')?.getContext('2d');
  if (!ctx) return;

  const models = analysisData.model_breakdown || [];
  const labels = models.map(m => m.model);
  const costData = models.map(m => m.cost);
  const taskData = models.map(m => m.tasks);
  const colors = ['#6366f1', '#22c55e', '#f59e0b', '#38bdf8', '#ef4444', '#a78bfa'];

  if (modelChart) modelChart.destroy();
  modelChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Cost ($)',
          data: costData,
          backgroundColor: colors.slice(0, labels.length).map(c => c + '55'),
          borderColor: colors.slice(0, labels.length),
          borderWidth: 1.5,
          borderRadius: 6,
          yAxisID: 'y'
        },
        {
          label: 'Tasks',
          data: taskData,
          type: 'line',
          borderColor: '#38bdf8',
          backgroundColor: 'rgba(56,189,248,.1)',
          pointBackgroundColor: '#38bdf8',
          pointRadius: 4,
          tension: .3,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: true, position: 'top', labels: { color: '#8b90a5', font: { size: 11 }, boxWidth: 12, padding: 12 } }
      },
      scales: {
        x: { ticks: { color: '#5d6178', font: { size: 10, family: "'JetBrains Mono', monospace" } }, grid: { color: 'rgba(42,46,63,.4)' } },
        y: { position: 'left', ticks: { color: '#8b90a5', font: { size: 10 }, callback: v => '$' + v.toFixed(2) }, grid: { color: 'rgba(42,46,63,.3)' } },
        y1: { position: 'right', ticks: { color: '#38bdf8', font: { size: 10 } }, grid: { drawOnChartArea: false } }
      }
    }
  });
}

function updateTaskChart() {
  const ctx = document.getElementById('taskChart')?.getContext('2d');
  if (!ctx) return;

  const tasks = analysisData.task_breakdown || [];
  const labels = tasks.map(t => t.type);
  const data = tasks.map(t => t.count);
  const colors = ['#6366f1', '#22c55e', '#f59e0b', '#38bdf8', '#ef4444'];

  if (taskChart) taskChart.destroy();
  taskChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors.slice(0, labels.length),
        borderColor: '#1c1f2e',
        borderWidth: 3,
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '60%',
      plugins: {
        legend: { position: 'bottom', labels: { color: '#8b90a5', font: { size: 11 }, padding: 14, boxWidth: 12 } }
      }
    }
  });
}

/* ─── Recommendations (Savings Banner) ─── */
function updateRecommendations() {
  const d = analysisData;
  if (!d) return;
  const current = d.monthly_projected_current || 0;
  const optimized = computeOptimizedCost();
  const savings = current - optimized;

  setText('totalSavingsEstimate', `$${savings.toFixed(2)}/mo`);
  setText('bannerCurrentCost', `$${current.toFixed(2)}`);
  setText('bannerOptimizedCost', `$${optimized.toFixed(2)}`);
}

function computeOptimizedCost() {
  const d = analysisData;
  if (!d) return 0;
  const alternatives = d.model_alternatives || [];
  const monthlyCurrent = d.monthly_projected_current || 0;
  const totalTasks = d.total_tasks || 0;

  // Estimate tier distribution
  const tierDist = { high: 0.10, medium: 0.55, low: 0.35 };
  const tasks = d.task_breakdown || [];
  if (tasks.length > 0) {
    const total = tasks.reduce((s, t) => s + t.count, 0) || 1;
    const research = tasks.filter(t => /research/i.test(t.type)).reduce((s, t) => s + t.count, 0);
    const code = tasks.filter(t => /code/i.test(t.type)).reduce((s, t) => s + t.count, 0);
    const writing = tasks.filter(t => /writ/i.test(t.type)).reduce((s, t) => s + t.count, 0);
    tierDist.high = Math.max(0.05, (research * 1.5 + code * 0.1) / total);
    tierDist.medium = Math.max(0.20, (code * 0.6 + writing * 0.7) / total);
    tierDist.low = Math.max(0.10, 1 - tierDist.high - tierDist.medium);
  }

  // Current cost per tier
  const models = d.model_breakdown || [];
  const modelsSortedByCost = [...models].sort((a, b) => b.avg_cost_per_task - a.avg_cost_per_task);
  const currentModels = {
    high: modelsSortedByCost[0] || null,
    medium: modelsSortedByCost[1] || modelsSortedByCost[0] || null,
    low: modelsSortedByCost[modelsSortedByCost.length - 1] || null
  };

  let total = 0;
  for (const tier of TASK_TIERS) {
    const tierTasks = Math.round(totalTasks * tierDist[tier.id]);
    const chosenId = selectedModels[tier.id];
    if (chosenId) {
      const alt = alternatives.find(a => a.id === chosenId);
      if (alt) {
        total += tierTasks * alt.avg_cost_per_task;
        continue;
      }
    }
    // No selection — use current model cost for this tier
    const cm = currentModels[tier.id];
    if (cm) {
      total += tierTasks * cm.avg_cost_per_task;
    } else {
      total += monthlyCurrent * tierDist[tier.id];
    }
  }

  // Apply cache savings if applicable
  const cacheBoost = (d.cache_hit_rate || 0) < 0.5 ? 0.85 : 1;
  return total * cacheBoost;
}

/* ─── Task Complexity Tiers ─── */
const TASK_TIERS = [
  {
    id: 'high',
    label: 'High-Complexity Tasks',
    icon: '🧠',
    description: 'Architecture design, complex reasoning, multi-step research, difficult debugging. These tasks need the highest-quality models.',
    color: 'var(--red)',
    colorSubtle: 'var(--red-subtle)',
    borderColor: 'rgba(239,68,68,.25)',
    sort: (a, b) => b.quality_score - a.quality_score  // quality first
  },
  {
    id: 'medium',
    label: 'Medium-Complexity Tasks',
    icon: '⚙️',
    description: 'Standard coding, writing, code reviews, feature implementation. A good balance of quality and cost.',
    color: 'var(--amber)',
    colorSubtle: 'var(--amber-subtle)',
    borderColor: 'rgba(245,158,11,.25)',
    sort: (a, b) => (b.quality_score * 0.5 - b.avg_cost_per_task * 100) - (a.quality_score * 0.5 - a.avg_cost_per_task * 100)  // value
  },
  {
    id: 'low',
    label: 'Low-Complexity Tasks',
    icon: '⚡',
    description: 'Simple queries, quick fixes, boilerplate generation, formatting. Speed and low cost matter most.',
    color: 'var(--green)',
    colorSubtle: 'var(--green-subtle)',
    borderColor: 'rgba(34,197,94,.25)',
    sort: (a, b) => a.avg_cost_per_task - b.avg_cost_per_task  // cheapest first
  }
];

/* ─── Model Recommendations by Tier ─── */
function updateModelRecommendations() {
  const container = document.getElementById('modelRecommendationsList');
  if (!container) return;

  const d = analysisData;
  const alternatives = d.model_alternatives || [];
  const totalTasks = d.total_tasks || 0;
  const monthlyCurrent = d.monthly_projected_current || 0;

  if (alternatives.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>No model data available. Connect your OpenRouter API key to see recommendations.</p></div>';
    return;
  }

  // Estimate task distribution across tiers
  const tierDistribution = { high: 0.10, medium: 0.55, low: 0.35 };
  // Refine from task_breakdown if available
  const tasks = d.task_breakdown || [];
  if (tasks.length > 0) {
    const total = tasks.reduce((s, t) => s + t.count, 0) || 1;
    const research = tasks.filter(t => /research/i.test(t.type)).reduce((s, t) => s + t.count, 0);
    const code = tasks.filter(t => /code/i.test(t.type)).reduce((s, t) => s + t.count, 0);
    const writing = tasks.filter(t => /writ/i.test(t.type)).reduce((s, t) => s + t.count, 0);
    tierDistribution.high = Math.max(0.05, (research * 1.5 + code * 0.1) / total);
    tierDistribution.medium = Math.max(0.20, (code * 0.6 + writing * 0.7) / total);
    tierDistribution.low = Math.max(0.10, 1 - tierDistribution.high - tierDistribution.medium);
  }

  // Identify which model is currently used for each tier (best guess from model_breakdown)
  const models = d.model_breakdown || [];
  const modelsSortedByCost = [...models].sort((a, b) => b.avg_cost_per_task - a.avg_cost_per_task);
  const currentPerTier = {
    high: modelsSortedByCost[0]?.model || null, // most expensive = high
    medium: modelsSortedByCost[1]?.model || modelsSortedByCost[0]?.model || null,
    low: modelsSortedByCost[modelsSortedByCost.length - 1]?.model || null // cheapest = low
  };

  const cards = TASK_TIERS.map((tier, tierIdx) => {
    const chosenId = selectedModels[tier.id] || null;
    const tierTasks = Math.round(totalTasks * tierDistribution[tier.id]);
    const tierCostShare = monthlyCurrent * tierDistribution[tier.id];
    const currentModel = currentPerTier[tier.id];
    const currentAlt = alternatives.find(a => a.name === currentModel);
    const currentCostPerTask = currentAlt?.avg_cost_per_task || (tierCostShare / (tierTasks || 1));

    // Sort alternatives by tier preference
    const sorted = [...alternatives].sort(tier.sort);

    // Build options with projected costs
    const opts = sorted.map((alt, rank) => {
      const projCost = tierTasks * alt.avg_cost_per_task;
      const currentTierCost = tierTasks * currentCostPerTask;
      const savings = currentTierCost - projCost;
      const isCurrent = alt.name === currentModel;
      const isChosen = chosenId === alt.id;
      const isRecommended = rank === 0 && !isCurrent;
      return { ...alt, projCost, savings, isCurrent, isChosen, isRecommended };
    });

    const chosen = opts.find(o => o.isChosen);
    const chosenSavings = chosen ? chosen.savings : 0;

    return `
      <div class="model-rec-card ${chosenId ? 'has-selection' : ''}" style="border-color: ${tier.borderColor}">
        <div class="model-rec-header">
          <div class="model-rec-current">
            <div class="tier-badge" style="background: ${tier.colorSubtle}; color: ${tier.color}">
              <span>${tier.icon}</span> ${escHtml(tier.label)}
            </div>
            <div class="model-rec-tier-desc">${escHtml(tier.description)}</div>
            <div class="model-rec-stats">~${tierTasks} tasks/mo · ~$${tierCostShare.toFixed(2)}/mo${currentModel ? ' · Currently: ' + escHtml(currentModel) : ''}</div>
          </div>
          ${chosenSavings > 0 ? `
          <div class="model-rec-savings-badge">
            <span class="savings-arrow">↓</span> $${chosenSavings.toFixed(2)}/mo
          </div>` : ''}
        </div>

        <div class="model-alt-label">Select a model for this tier:</div>
        <div class="model-alt-list">
          ${opts.map(alt => `
            <label class="model-alt-option ${alt.isChosen ? 'selected' : ''} ${alt.isCurrent ? 'current' : ''}" onclick="selectModelAlternative('${tier.id}', '${alt.id}')">
              <div class="model-alt-radio">
                <input type="radio" name="tier-${tierIdx}" ${alt.isChosen || (!chosenId && alt.isCurrent) ? 'checked' : ''}>
              </div>
              <div class="model-alt-info">
                <div class="model-alt-name">
                  ${escHtml(alt.name)}
                  ${alt.isCurrent ? '<span class="model-tag current-tag">CURRENT</span>' : ''}
                  ${alt.isRecommended ? '<span class="model-tag best-tag">RECOMMENDED</span>' : ''}
                </div>
                <div class="model-alt-meta">
                  Quality: ${renderQualityDots(alt.quality_score)} · ${escHtml(alt.speed || '')} · Best for: ${(alt.best_for || []).join(', ')}
                </div>
              </div>
              <div class="model-alt-cost">
                <div class="model-alt-price">$${alt.projCost.toFixed(2)}<small>/mo</small></div>
                ${!alt.isCurrent ? `<div class="model-alt-delta ${alt.savings > 0 ? 'delta-positive' : alt.savings < 0 ? 'delta-negative' : ''}">
                  ${alt.savings > 0 ? '↓' : alt.savings < 0 ? '↑' : '='} ${alt.savings !== 0 ? '$' + Math.abs(alt.savings).toFixed(2) : 'same'}
                </div>` : '<div class="model-alt-delta">—</div>'}
              </div>
            </label>
          `).join('')}
        </div>
      </div>`;
  });

  container.innerHTML = cards.join('');
}

function renderQualityDots(score) {
  const filled = Math.round(score / 20);
  let dots = '';
  for (let i = 0; i < 5; i++) {
    dots += `<span class="quality-dot ${i < filled ? 'filled' : ''}"></span>`;
  }
  return `<span class="quality-dots">${dots}</span> ${score}`;
}

function selectModelAlternative(tierId, modelId) {
  // Toggle: if clicking already-chosen, deselect
  if (selectedModels[tierId] === modelId) {
    delete selectedModels[tierId];
  } else {
    selectedModels[tierId] = modelId;
  }
  updateModelRecommendations();
  updateRecommendations(); // recalculate savings banner
}

/* ─── Other Recommendations (non-model) ─── */
function updateOtherRecommendations() {
  const container = document.getElementById('otherRecommendationsList');
  if (!container) return;

  const recs = (analysisData.recommendations || []).filter(r => r.type !== 'model_switch' && r.type !== 'budget_control');
  if (recs.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>No additional recommendations.</p></div>';
    return;
  }

  container.innerHTML = recs.map((rec, i) => {
    const edited = editedRecommendations[i];
    const desc = edited?.description ?? rec.description;
    const impact = rec.impact || '--';
    const impactClass = getImpactClass(impact);
    const isSelected = edited?.selected || false;
    const isEditing = edited?.editing || false;
    const isExpanded = edited?.expanded || false;

    return `
      <div class="rec-card ${isSelected ? 'selected' : ''} ${isEditing ? 'editing' : ''} ${isExpanded ? 'expanded' : ''}" data-index="${i}">
        <div class="rec-header">
          <input type="checkbox" class="rec-checkbox" ${isSelected ? 'checked' : ''} onchange="toggleRecSelection(${i})" title="Select for apply">
          <div class="rec-title-wrap" onclick="toggleRecExpand(${i})">
            <div class="rec-title">${escHtml(rec.title)}</div>
            <div class="rec-meta">${escHtml(rec.type)} · Impact: ${escHtml(impact)}</div>
          </div>
          <span class="rec-impact-badge ${impactClass}">${escHtml(impact)}</span>
          <div class="rec-actions">
            <button class="btn btn-sm btn-outline" onclick="toggleRecEdit(${i})" title="Edit recommendation">✏️</button>
          </div>
        </div>
        <div class="rec-body">
          <p class="rec-description">${escHtml(desc)}</p>
          <div class="rec-edit-area">
            <textarea class="rec-edit-textarea" id="recEdit${i}" oninput="recDirty(${i})">${escHtml(desc)}</textarea>
            <div class="rec-edit-actions">
              <button class="btn btn-sm btn-success" onclick="saveRecEdit(${i})">Save</button>
              <button class="btn btn-sm btn-ghost" onclick="cancelRecEdit(${i})">Cancel</button>
            </div>
          </div>
          ${renderRecDetails(rec.details || [])}
        </div>
      </div>`;
  }).join('');
}

/* ─── Budget Controls ─── */
function updateBudgetControls() {
  const d = analysisData;
  if (!d) return;
  const defaults = d.budget_defaults || {};
  const budgetRec = (d.recommendations || []).find(r => r.type === 'budget_control');

  // Initialize budget state from defaults or recommendation data
  if (!budgetState.initialized) {
    budgetState = {
      initialized: true,
      dailyCap: defaults.daily_cap || parseFloat(extractBudgetValue(budgetRec, 'Daily cap')) || 2.00,
      weeklyAlert: defaults.weekly_alert_pct || 75,
      monthly: defaults.monthly_budget || parseFloat(extractBudgetValue(budgetRec, 'Monthly budget')) || 40,
      autoPause: defaults.auto_pause_pct || 95
    };
  }

  // Set input values
  setInputVal('budgetDailyCap', budgetState.dailyCap);
  setInputVal('budgetDailyCapSlider', budgetState.dailyCap);
  setInputVal('budgetWeeklyAlert', budgetState.weeklyAlert);
  setInputVal('budgetWeeklyAlertSlider', budgetState.weeklyAlert);
  setInputVal('budgetMonthly', budgetState.monthly);
  setInputVal('budgetMonthlySlider', budgetState.monthly);
  setInputVal('budgetAutoPause', budgetState.autoPause);
  setInputVal('budgetAutoPauseSlider', budgetState.autoPause);

  updateBudgetImpact();
}

function extractBudgetValue(rec, prefix) {
  if (!rec || !rec.details) return '';
  const detail = rec.details.find(d => d.startsWith(prefix));
  if (!detail) return '';
  const match = detail.match(/\$?([\d.]+)/);
  return match ? match[1] : '';
}

function setInputVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}

function syncBudgetSlider(inputId, value) {
  const input = document.getElementById(inputId);
  if (input) input.value = value;
  onBudgetChange();
}

function onBudgetChange() {
  const daily = parseFloat(document.getElementById('budgetDailyCap')?.value) || 0;
  const weekly = parseFloat(document.getElementById('budgetWeeklyAlert')?.value) || 0;
  const monthly = parseFloat(document.getElementById('budgetMonthly')?.value) || 0;
  const autoPause = parseFloat(document.getElementById('budgetAutoPause')?.value) || 0;

  budgetState.dailyCap = daily;
  budgetState.weeklyAlert = weekly;
  budgetState.monthly = monthly;
  budgetState.autoPause = autoPause;

  // Sync sliders
  setInputVal('budgetDailyCapSlider', daily);
  setInputVal('budgetWeeklyAlertSlider', weekly);
  setInputVal('budgetMonthlySlider', monthly);
  setInputVal('budgetAutoPauseSlider', autoPause);

  updateBudgetImpact();
}

function updateBudgetImpact() {
  const grid = document.getElementById('budgetImpactGrid');
  if (!grid) return;

  const d = analysisData;
  const current = d?.monthly_projected_current || 0;
  const daily = budgetState.dailyCap || 0;
  const monthly = budgetState.monthly || 0;
  const weeklyPct = budgetState.weeklyAlert || 75;
  const autoPausePct = budgetState.autoPause || 95;

  const weeklyBudget = monthly / 4.33;
  const weeklyAlertAt = weeklyBudget * (weeklyPct / 100);
  const autoPauseAt = monthly * (autoPausePct / 100);
  const maxDailySpend = daily * 30;
  const effectiveCap = Math.min(monthly, maxDailySpend);
  const headroom = effectiveCap - current;

  grid.innerHTML = `
    <div class="impact-item">
      <div class="impact-label">Max daily spend</div>
      <div class="impact-value">$${daily.toFixed(2)}</div>
    </div>
    <div class="impact-item">
      <div class="impact-label">Weekly alert at</div>
      <div class="impact-value">$${weeklyAlertAt.toFixed(2)} <small>(${weeklyPct}%)</small></div>
    </div>
    <div class="impact-item">
      <div class="impact-label">Auto-pause at</div>
      <div class="impact-value">$${autoPauseAt.toFixed(2)} <small>(${autoPausePct}%)</small></div>
    </div>
    <div class="impact-item ${headroom >= 0 ? 'impact-safe' : 'impact-warning'}">
      <div class="impact-label">Budget headroom</div>
      <div class="impact-value">${headroom >= 0 ? '+' : ''}$${headroom.toFixed(2)}/mo</div>
    </div>
  `;
}

function resetBudgetDefaults() {
  const d = analysisData;
  const defaults = d?.budget_defaults || {};
  budgetState = {
    initialized: true,
    dailyCap: defaults.daily_cap || 2.40,
    weeklyAlert: defaults.weekly_alert_pct || 75,
    monthly: defaults.monthly_budget || 40,
    autoPause: defaults.auto_pause_pct || 95
  };
  updateBudgetControls();
  showToast('Budget controls reset to defaults');
}

async function applyBudgetControls() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        confirm: true,
        budget: {
          daily: budgetState.dailyCap,
          weekly_alert_pct: budgetState.weeklyAlert,
          monthly: budgetState.monthly,
          auto_pause_pct: budgetState.autoPause
        }
      })
    });
    const json = await res.json();
    if (json.success) {
      showToast('✅ Budget controls saved!');
    } else {
      showToast(`Error: ${json.error || 'Save failed'}`);
    }
  } catch {
    // Offline mode — save to local state
    showToast('✅ Budget controls saved locally (API offline)');
  }
}

function renderRecDetails(details) {
  if (!details.length) return '';
  return `
    <div class="rec-details">
      ${details.map(d => `
        <div class="rec-detail-item">
          <div class="rec-detail-value">${escHtml(d)}</div>
        </div>`).join('')}
    </div>`;
}

function getImpactClass(impact) {
  if (!impact) return 'impact-low';
  const s = impact.toLowerCase();
  if (s.includes('$') && parseInt(s.replace(/[^0-9]/g, '')) >= 20) return 'impact-high';
  if (s.includes('$') && parseInt(s.replace(/[^0-9]/g, '')) >= 10) return 'impact-medium';
  if (s.includes('prevent') || s.includes('control')) return 'impact-medium';
  return 'impact-low';
}

function toggleRecExpand(i) {
  const card = document.querySelector(`.rec-card[data-index="${i}"]`);
  if (!card) return;
  card.classList.toggle('expanded');
  if (!editedRecommendations[i]) editedRecommendations[i] = {};
  editedRecommendations[i].expanded = card.classList.contains('expanded');
}

function toggleRecSelection(i) {
  if (!editedRecommendations[i]) editedRecommendations[i] = {};
  editedRecommendations[i].selected = !editedRecommendations[i].selected;
  const card = document.querySelector(`.rec-card[data-index="${i}"]`);
  if (card) card.classList.toggle('selected', editedRecommendations[i].selected);
}

function toggleRecEdit(i) {
  const card = document.querySelector(`.rec-card[data-index="${i}"]`);
  if (!card) return;
  if (!editedRecommendations[i]) editedRecommendations[i] = {};
  const isEditing = !editedRecommendations[i].editing;
  editedRecommendations[i].editing = isEditing;
  card.classList.toggle('editing', isEditing);
  // Also expand if not already
  if (isEditing && !card.classList.contains('expanded')) {
    card.classList.add('expanded');
    editedRecommendations[i].expanded = true;
  }
}

function saveRecEdit(i) {
  const textarea = document.getElementById(`recEdit${i}`);
  if (!textarea) return;
  if (!editedRecommendations[i]) editedRecommendations[i] = {};
  editedRecommendations[i].description = textarea.value;
  editedRecommendations[i].editing = false;
  updateRecommendations();
  showToast('Recommendation updated');
}

function cancelRecEdit(i) {
  if (!editedRecommendations[i]) editedRecommendations[i] = {};
  editedRecommendations[i].editing = false;
  // Reset textarea to last saved description
  const textarea = document.getElementById(`recEdit${i}`);
  const orig = editedRecommendations[i].description ?? analysisData.recommendations[i]?.description ?? '';
  if (textarea) textarea.value = orig;
  updateRecommendations();
}

function recDirty(i) {
  // Mark as dirty — visual feedback could go here
}

function resetAllEdits() {
  editedRecommendations = {};
  updateRecommendations();
  showToast('All edits reset');
}

async function applySelectedRecommendations() {
  const selected = Object.entries(editedRecommendations)
    .filter(([_, v]) => v.selected)
    .map(([i]) => parseInt(i));

  if (selected.length === 0) {
    showToast('Select at least one recommendation to apply');
    return;
  }

  const confirmed = confirm(`Apply ${selected.length} selected recommendation(s)? This will update your OpenClaw configuration.`);
  if (!confirmed) return;

  try {
    const res = await fetch(`${API_BASE_URL}/api/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: true })
    });
    const json = await res.json();
    if (json.success) {
      showToast(`✅ ${selected.length} optimization(s) applied!`);
      // Uncheck applied items
      selected.forEach(i => {
        if (editedRecommendations[i]) editedRecommendations[i].selected = false;
      });
      updateRecommendations();
    } else {
      showToast(`Error: ${json.error || 'Apply failed'}`);
    }
  } catch (err) {
    showToast(`Network error: ${err.message}`);
  }
}

/* ─── Model Details ─── */
function updateModelDetails() {
  const container = document.getElementById('modelDetailsCard');
  if (!container) return;

  const models = analysisData.model_breakdown || [];
  if (models.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>No model data available yet.</p></div>';
    return;
  }

  const totalCost = models.reduce((s, m) => s + m.cost, 0);
  container.innerHTML = `
    <table class="model-table">
      <thead>
        <tr>
          <th>Model</th>
          <th>Tasks</th>
          <th>Cost</th>
          <th>Avg/Task</th>
          <th>Share</th>
        </tr>
      </thead>
      <tbody>
        ${models.map(m => {
          const share = totalCost > 0 ? ((m.cost / totalCost) * 100).toFixed(1) : '0.0';
          return `<tr>
            <td><span class="model-name">${escHtml(m.model)}</span></td>
            <td>${m.tasks}</td>
            <td>$${m.cost.toFixed(2)}</td>
            <td>$${m.avg_cost_per_task.toFixed(3)}</td>
            <td>${share}%</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

/* ─── Inline API Key (Get Started Card) ─── */
async function validateInlineApiKey() {
  const input = document.getElementById('gsApiKeyInput');
  const key = input.value.trim();
  const status = document.getElementById('gsKeyStatus');
  const btn = document.getElementById('gsValidateBtn');

  function showStatus(msg, type) {
    status.textContent = msg;
    status.className = 'config-status ' + type;
    status.style.removeProperty('display');
  }

  if (!key) { showStatus('Please enter an API key.', 'error'); return; }
  if (!key.startsWith('sk-or-')) { showStatus('Invalid format — key should start with sk-or-', 'error'); return; }

  showStatus('Validating…', 'validating');
  btn.disabled = true;
  btn.textContent = 'Validating…';

  let validated = false;
  let errorMsg = '';
  let usageData = null;

  // Try API server first
  try {
    const res = await fetch(`${API_BASE_URL}/api/config/openrouter-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: key })
    });
    const json = await res.json();
    if (json.success) {
      validated = true;
      // Fetch usage via API server
      try {
        const ur = await fetch(`${API_BASE_URL}/api/openrouter-usage`);
        const uj = await ur.json();
        if (uj.success && uj.configured) usageData = uj.data || uj;
      } catch {}
    } else {
      errorMsg = json.error || 'Validation failed';
    }
  } catch (_) {
    // API server not available — validate directly against OpenRouter
    try {
      const res = await fetch('https://openrouter.ai/api/v1/auth/key', {
        headers: { 'Authorization': `Bearer ${key}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.data) {
          validated = true;
          usageData = data.data;
        } else {
          errorMsg = 'Key not recognized by OpenRouter';
        }
      } else if (res.status === 401 || res.status === 403) {
        errorMsg = 'Invalid API key — authentication failed';
      } else {
        errorMsg = `OpenRouter returned status ${res.status}`;
      }
    } catch (e2) {
      errorMsg = 'Could not reach OpenRouter to validate — check your connection';
    }
  }

  btn.disabled = false;
  btn.textContent = 'Save & Validate';

  if (validated) {
    localStorage.setItem('smartmeter_openrouter_key', key);
    showStatus('✅ API key saved and validated!', 'success');

    // Show balance section, hide key input
    setTimeout(() => {
      showBalanceDisplay(usageData);
      // Also sync the modal key input
      const modalInput = document.getElementById('apiKeyInput');
      if (modalInput) modalInput.value = key;
      // Also update the OpenRouter sidebar section
      fetchOpenRouterUsage();
    }, 600);
  } else {
    showStatus(`❌ ${errorMsg}`, 'error');
  }
}

function showBalanceDisplay(usageData) {
  const keySection = document.getElementById('gsKeySection');
  const balanceSection = document.getElementById('gsBalance');

  keySection.style.display = 'none';
  balanceSection.style.display = 'block';

  if (usageData) {
    // Handle both API server shape (credits.total/used/remaining, account.limit)
    // and direct OpenRouter shape (usage, limit, rate_limit)
    const credits = usageData.credits || {};
    const account = usageData.account || {};
    const usage = credits.used ?? usageData.usage ?? account.usageBalance ?? 0;
    const limit = credits.total ?? usageData.limit ?? account.limit ?? 0;
    const remaining = credits.remaining ?? (limit - usage);
    const rate = usageData.rate_limit?.requests
              || usageData.rateLimit?.requests
              || usageData.rate?.requests
              || '--';

    setText('gsBalanceCredits', `$${Number(limit).toFixed(2)}`);
    setText('gsBalanceUsage', `$${Number(usage).toFixed(2)}`);
    setText('gsBalanceRemaining', `$${Number(remaining).toFixed(2)}`);
    setText('gsBalanceRate', typeof rate === 'number' ? `${rate}/s` : rate);
  }

  // Highlight step 1 as done
  const step1 = document.getElementById('gsStep1');
  if (step1) { step1.classList.add('gs-step-done'); }
}

function showApiKeyInput() {
  const keySection = document.getElementById('gsKeySection');
  const balanceSection = document.getElementById('gsBalance');
  keySection.style.display = 'block';
  balanceSection.style.display = 'none';
  document.getElementById('gsApiKeyInput').focus();
}

/** On init, check if key is already stored and auto-show balance */
async function initGetStartedCard() {
  const stored = localStorage.getItem('smartmeter_openrouter_key');
  if (!stored) return;

  // Pre-fill the input
  const input = document.getElementById('gsApiKeyInput');
  if (input) input.value = stored;

  // Try to fetch balance
  let usageData = null;
  try {
    const res = await fetch(`${API_BASE_URL}/api/openrouter-usage`);
    const json = await res.json();
    if (json.success && json.configured) {
      usageData = json.data || json;
    }
  } catch {
    // Try direct OpenRouter
    try {
      const res = await fetch('https://openrouter.ai/api/v1/auth/key', {
        headers: { 'Authorization': `Bearer ${stored}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.data) usageData = data.data;
      }
    } catch {}
  }

  if (usageData) {
    showBalanceDisplay(usageData);
  }
}

/* ─── Step Panels (Analyze / Evaluate / Guide) ─── */
let activeStep = 1;

function activateStep(n) {
  activeStep = n;
  // Toggle active class on step elements
  for (let i = 1; i <= 3; i++) {
    const step = document.getElementById('gsStep' + i);
    if (step) step.classList.toggle('gs-step-active', i === n);
  }
  // Show/hide panels
  for (let i = 1; i <= 3; i++) {
    const panel = document.getElementById('gsPanel' + i);
    if (panel) panel.style.display = (i === n) ? '' : 'none';
  }
  // Populate panel content
  populateStepPanel(n);
  // Update contextual info banner
  updateContextualBanner(n);
}

function populateStepPanel(n) {
  const d = analysisData;
  if (n === 1) {
    const panel = document.getElementById('gsPanel1');
    if (!panel) return;
    if (!d) {
      panel.innerHTML = '<p class="panel-empty">Run an analysis to see your usage summary here.</p>';
      return;
    }
    const days = d.days_analyzed || 0;
    const tasks = d.total_tasks || 0;
    const current = d.monthly_projected_current || 0;
    const optimized = d.monthly_projected_optimized || 0;
    const models = (d.model_breakdown || []).length;
    panel.innerHTML = `
      <h4>Analysis Summary</h4>
      <p>${days} day${days !== 1 ? 's' : ''} analyzed &middot; ${tasks} task${tasks !== 1 ? 's' : ''} &middot; ${models} model${models !== 1 ? 's' : ''} detected</p>
      <table>
        <tr><td>Projected Monthly Cost</td><td style="text-align:right;font-weight:600">$${current.toFixed(2)}</td></tr>
        <tr><td>Optimized Projection</td><td style="text-align:right;font-weight:600;color:var(--green)">$${optimized.toFixed(2)}</td></tr>
        <tr><td>Potential Savings</td><td style="text-align:right;font-weight:600;color:var(--accent)">$${(current - optimized).toFixed(2)}</td></tr>
      </table>`;
  } else if (n === 2) {
    const panel = document.getElementById('gsPanel2');
    if (!panel) return;
    const models = d ? (d.model_breakdown || []) : [];
    if (models.length === 0) {
      panel.innerHTML = '<p class="panel-empty">No model data available yet. Run an analysis first.</p>';
      return;
    }
    const totalCost = models.reduce((s, m) => s + m.cost, 0);
    panel.innerHTML = `
      <h4>Model Cost Breakdown</h4>
      <table>
        <thead><tr>
          <th>Model</th><th>Tasks</th><th>Cost</th><th>Avg/Task</th><th>Share</th>
        </tr></thead>
        <tbody>
          ${models.map(m => {
            const share = totalCost > 0 ? ((m.cost / totalCost) * 100).toFixed(1) : '0.0';
            return `<tr>
              <td>${escHtml(m.model)}</td>
              <td>${m.tasks}</td>
              <td>$${m.cost.toFixed(2)}</td>
              <td>$${m.avg_cost_per_task.toFixed(3)}</td>
              <td>${share}%</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  } else if (n === 3) {
    const panel = document.getElementById('gsPanel3');
    if (!panel) return;
    const recs = d ? (d.recommendations || []) : [];
    if (recs.length === 0) {
      panel.innerHTML = '<p class="panel-empty">No recommendations available yet. Run an analysis first.</p>';
      return;
    }
    panel.innerHTML = `
      <h4>Recommendations</h4>
      <p>Toggle on the optimizations you want to activate, then hit Apply.</p>
      <div class="gs-rec-list">
        ${recs.map((r, i) => {
          const impactClass = (r.impact || '').toLowerCase().includes('high') ? 'high'
            : (r.impact || '').toLowerCase().includes('medium') ? 'medium' : 'low';
          const checked = editedRecommendations[i] && editedRecommendations[i].selected ? 'checked' : '';
          return `<label class="gs-rec-row" data-index="${i}">
            <input type="checkbox" class="gs-rec-toggle" ${checked} onchange="toggleGuideRec(${i}, this.checked)">
            <div class="gs-rec-body">
              <div class="gs-rec-header">
                <span class="rec-title">${escHtml(r.title)}</span>
                ${r.impact ? `<span class="rec-impact ${impactClass}">${escHtml(r.impact)}</span>` : ''}
              </div>
              <div class="rec-desc">${escHtml(r.description)}</div>
            </div>
          </label>`;
        }).join('')}
      </div>
      <div class="gs-rec-actions">
        <button class="btn btn-primary" onclick="applyGuideRecommendations()">Apply Selected</button>
        <span class="gs-rec-count" id="gsRecCount">${Object.values(editedRecommendations).filter(v => v.selected).length} selected</span>
      </div>`;
  }
}

function updateContextualBanner(n) {
  const notice = document.getElementById('costDataNotice');
  const content = document.getElementById('costDataNoticeContent');
  if (!notice || !content) return;

  const messages = {
    1: {
      title: 'About Cost Tracking',
      text: 'Your OpenRouter API responses may not include cost data. SmartMeter still optimizes based on token usage.'
    },
    2: {
      title: 'Understanding Model Costs',
      text: 'Costs are based on token usage reported by OpenRouter. Compare models to find cheaper alternatives for similar tasks.'
    },
    3: {
      title: 'Applying Recommendations',
      text: 'Select recommendations below to apply them. Changes update your OpenClaw configuration for optimized model routing.'
    }
  };

  const msg = messages[n] || messages[1];
  const d = analysisData;
  const hasCostData = d && (d.monthly_projected_current || 0) > 0;

  // Show banner contextually: always for step 2/3 if data exists, or step 1 if no cost data
  if (n === 1 && hasCostData) {
    notice.style.display = 'none';
  } else {
    content.innerHTML = `<strong>${msg.title}</strong><p>${msg.text}</p>`;
    notice.style.display = 'flex';
  }
}

/* ─── Guide Panel Actions ─── */
function toggleGuideRec(i, on) {
  if (!editedRecommendations[i]) editedRecommendations[i] = {};
  editedRecommendations[i].selected = on;
  // Update count
  const count = Object.values(editedRecommendations).filter(v => v.selected).length;
  const el = document.getElementById('gsRecCount');
  if (el) el.textContent = count + ' selected';
  // Sync main recommendation cards if they exist
  const card = document.querySelector(`.rec-card[data-index="${i}"]`);
  if (card) card.classList.toggle('selected', on);
}

function applyGuideRecommendations() {
  const selected = Object.entries(editedRecommendations)
    .filter(([_, v]) => v.selected)
    .map(([i]) => parseInt(i));

  if (selected.length === 0) {
    showToast('Toggle at least one recommendation to apply');
    return;
  }

  // Build summary list for the modal
  const recs = analysisData ? (analysisData.recommendations || []) : [];
  const listEl = document.getElementById('applyModalList');
  if (listEl) {
    listEl.innerHTML = selected.map(i => {
      const r = recs[i];
      if (!r) return '';
      const impactClass = (r.impact || '').toLowerCase().includes('high') ? 'high'
        : (r.impact || '').toLowerCase().includes('medium') ? 'medium' : 'low';
      return `<div class="apply-modal-item">
        <span class="apply-modal-dot ${impactClass}"></span>
        <span>${escHtml(r.title)}</span>
        ${r.impact ? `<span class="rec-impact ${impactClass}">${escHtml(r.impact)}</span>` : ''}
      </div>`;
    }).join('');
  }

  // Show modal
  const modal = document.getElementById('applyModal');
  if (modal) modal.style.display = 'flex';
}

function closeApplyModal() {
  const modal = document.getElementById('applyModal');
  if (modal) modal.style.display = 'none';
}

async function confirmApplyRecommendations() {
  const selected = Object.entries(editedRecommendations)
    .filter(([_, v]) => v.selected)
    .map(([i]) => parseInt(i));

  const btn = document.getElementById('applyModalConfirmBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Applying…'; }

  try {
    const res = await fetch(`${API_BASE_URL}/api/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: true })
    });
    const json = await res.json();
    if (json.success) {
      closeApplyModal();
      showToast(`✅ ${selected.length} optimization(s) applied!`);
      selected.forEach(i => {
        if (editedRecommendations[i]) editedRecommendations[i].selected = false;
      });
      populateStepPanel(3);
      updateRecommendations();
    } else {
      showToast(`Error: ${json.error || 'Apply failed'}`);
    }
  } catch (err) {
    showToast(`Network error: ${err.message}`);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Apply Now'; }
  }
}

/* ─── OpenRouter Integration ─── */
async function checkOpenRouterConfig() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/config/openrouter-key`);
    if (!res.ok) return;
    const json = await res.json();
    if (json.configured) {
      fetchOpenRouterUsage();
    }
  } catch {
    // API not available — continue in static mode
  }
}

async function fetchOpenRouterUsage() {
  const container = document.getElementById('openRouterContent');
  try {
    const res = await fetch(`${API_BASE_URL}/api/openrouter-usage`);
    if (!res.ok) return;
    const json = await res.json();
    if (json.success && json.configured) {
      const raw = json.data || json;
      const credits = raw.credits || {};
      const account = raw.account || {};
      const used = credits.used ?? raw.usage ?? account.usageBalance ?? 0;
      const limit = credits.total ?? raw.limit ?? account.limit ?? 0;
      const remaining = credits.remaining ?? (limit - used);
      const rate = raw.rate_limit?.requests || raw.rate?.requests || '--';
      container.innerHTML = `
        <div class="or-stats-grid">
          <div class="or-stat-card">
            <div class="or-stat-label">Usage (USD)</div>
            <div class="or-stat-value">$${Number(used).toFixed(2)}</div>
          </div>
          <div class="or-stat-card">
            <div class="or-stat-label">Limit</div>
            <div class="or-stat-value">$${Number(limit).toFixed(2)}</div>
          </div>
          <div class="or-stat-card">
            <div class="or-stat-label">Remaining</div>
            <div class="or-stat-value">$${Number(remaining).toFixed(2)}</div>
          </div>
          <div class="or-stat-card">
            <div class="or-stat-label">Rate Limit</div>
            <div class="or-stat-value">${typeof rate === 'number' ? rate + '/s' : rate}</div>
          </div>
        </div>`;

      // Also update Get Started balance card if visible
      showBalanceDisplay(raw);
    }
  } catch {
    // noop
  }
}

/* ─── Config Modal ─── */
function openConfigModal() {
  document.getElementById('configModal').style.display = 'flex';
  const input = document.getElementById('apiKeyInput');
  const stored = localStorage.getItem('smartmeter_openrouter_key');
  if (stored && !input.value) input.value = stored;
  input.focus();
  const status = document.getElementById('configStatus');
  status.className = 'config-status';
  status.style.removeProperty('display');
}
function closeConfigModal() {
  document.getElementById('configModal').style.display = 'none';
}

async function saveApiKey() {
  const key = document.getElementById('apiKeyInput').value.trim();
  const status = document.getElementById('configStatus');

  function showStatus(msg, type) {
    status.textContent = msg;
    status.className = 'config-status ' + type;
    status.style.removeProperty('display');
  }

  if (!key) {
    showStatus('Please enter an API key.', 'error');
    return;
  }

  if (!key.startsWith('sk-or-')) {
    showStatus('Invalid format — key should start with sk-or-', 'error');
    return;
  }

  showStatus('Validating…', 'validating');

  let validated = false;
  let errorMsg = '';

  // Try API server first
  try {
    const res = await fetch(`${API_BASE_URL}/api/config/openrouter-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: key })
    });
    const json = await res.json();
    if (json.success) {
      validated = true;
    } else {
      errorMsg = json.error || 'Validation failed';
    }
  } catch (_) {
    // API server not available — validate directly against OpenRouter
    try {
      const res = await fetch('https://openrouter.ai/api/v1/auth/key', {
        headers: { 'Authorization': `Bearer ${key}` }
      });
      if (res.ok) {
        const data = await res.json();
        validated = !!(data && data.data);
        if (!validated) errorMsg = 'Key not recognized by OpenRouter';
      } else if (res.status === 401 || res.status === 403) {
        errorMsg = 'Invalid API key — authentication failed';
      } else {
        errorMsg = `OpenRouter returned status ${res.status}`;
      }
    } catch (e2) {
      errorMsg = 'Could not reach OpenRouter to validate — check your connection';
    }
  }

  if (validated) {
    localStorage.setItem('smartmeter_openrouter_key', key);
    showStatus('✅ API key saved and validated!', 'success');
    setTimeout(() => {
      closeConfigModal();
      fetchOpenRouterUsage();
      // Also sync the Get Started card
      initGetStartedCard();
    }, 1200);
  } else {
    showStatus(`❌ ${errorMsg}`, 'error');
  }
}

/* ─── Preview Modal ─── */
async function viewConfig() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/preview`);
    const json = await res.json();
    if (json.success) {
      document.getElementById('previewConfigCode').textContent = JSON.stringify(json.config, null, 2);
      document.getElementById('previewModal').style.display = 'flex';
    } else {
      showToast(`Error: ${json.error || 'No config available'}`);
    }
  } catch (err) {
    showToast(`Preview failed: ${err.message}`);
  }
}
function closePreviewModal() {
  document.getElementById('previewModal').style.display = 'none';
}

async function applyOptimizations() {
  const confirmed = confirm('Apply all optimizations? A backup will be created.');
  if (!confirmed) return;
  try {
    const res = await fetch(`${API_BASE_URL}/api/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: true })
    });
    const json = await res.json();
    if (json.success) {
      showToast('✅ Optimizations applied! Backup created.');
      closePreviewModal();
    } else {
      showToast(`Error: ${json.error || 'Apply failed'}`);
    }
  } catch (err) {
    showToast(`Apply failed: ${err.message}`);
  }
}

/* ─── Export ─── */
async function exportReport() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/export`);
    if (!res.ok) throw new Error('Export failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'smartmeter-report.md';
    a.click();
    URL.revokeObjectURL(url);
    showToast('📄 Report downloaded');
  } catch (err) {
    // Fallback: generate from local data
    if (analysisData) {
      const md = generateLocalReport(analysisData);
      const blob = new Blob([md], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'smartmeter-report.md';
      a.click();
      URL.revokeObjectURL(url);
      showToast('📄 Report exported from local data');
    } else {
      showToast('Export failed: no data');
    }
  }
}

function generateLocalReport(d) {
  return `# SmartMeter Cost Analysis Report

**Generated:** ${new Date().toISOString()}
**Period:** ${d.start_date} to ${d.end_date} (${d.days_analyzed} days)

## Summary
- Current Monthly Cost: $${(d.monthly_projected_current || 0).toFixed(2)}
- Optimized Monthly Cost: $${(d.monthly_projected_optimized || 0).toFixed(2)}
- Potential Savings: $${((d.monthly_projected_current || 0) - (d.monthly_projected_optimized || 0)).toFixed(2)}/month
- Total Tasks: ${d.total_tasks}
- Cache Hit Rate: ${((d.cache_hit_rate || 0) * 100).toFixed(1)}%

## Recommendations
${(d.recommendations || []).map((r, i) => `${i + 1}. **${r.title}** — ${r.impact}\n   ${r.description}`).join('\n\n')}

---
*Generated by SmartMeter*
`;
}

/* ─── Navigation ─── */
function navigateTo(section) {
  // Update nav active state
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.section === section);
  });
  // Toggle sections
  document.querySelectorAll('.page-section').forEach(el => {
    el.classList.toggle('active', el.id === `section-${section}`);
  });
  // Update page title
  const titles = { overview: 'Overview', recommendations: 'Recommendations', models: 'Models', openrouter: 'OpenRouter' };
  setText('pageTitle', titles[section] || section);
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

/* ─── Auto-Refresh ─── */
function startAutoRefresh() {
  autoRefreshTimer = setInterval(async () => {
    try {
      const res = await fetch('analysis.public.json', { cache: 'no-store' });
      if (res.ok) {
        const newData = await res.json();
        if (JSON.stringify(newData) !== JSON.stringify(analysisData)) {
          analysisData = newData;
          renderAll();
        }
      }
    } catch {
      // silent
    }
  }, 5000);
}

async function refreshDashboard() {
  await loadAnalysisData();
  showToast('Dashboard refreshed');
}

/* ─── Cost Data Notice ─── */
function checkCostDataNotice() {
  // Delegate to contextual banner system
  updateContextualBanner(activeStep);
}

/* ─── Helpers ─── */
function setText(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function updateLastUpdated() {
  const el = document.getElementById('lastUpdated');
  if (el) el.textContent = new Date().toLocaleTimeString();
}

function hideLoading() {
  const ov = document.getElementById('loadingOverlay');
  if (ov) {
    ov.classList.add('hidden');
    setTimeout(() => ov.remove(), 400);
  }
}

function showToast(msg, duration = 3000) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), duration);
}
