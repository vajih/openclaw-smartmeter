// SmartMeter Dashboard Application
// Polls analysis.public.json every 5 seconds and updates the dashboard

let currentData = null;
let modelChart = null;
let taskChart = null;
let activeTab = 'usage';
let refreshInterval = null;

// Initialize dashboard on page load
document.addEventListener('DOMContentLoaded', () => {
    console.log('SmartMeter Dashboard loading...');
    initializeDashboard();
    startAutoRefresh();
});

// Initialize the dashboard
async function initializeDashboard() {
    try {
        await refreshDashboard();
        hideLoading();
    } catch (error) {
        console.error('Failed to initialize dashboard:', error);
        showToast('Failed to load dashboard data', 'error');
        hideLoading();
    }
}

// Start auto-refresh every 5 seconds
function startAutoRefresh() {
    refreshInterval = setInterval(async () => {
        try {
            await refreshDashboard(true); // Silent refresh
        } catch (error) {
            console.error('Auto-refresh failed:', error);
        }
    }, 5000);
}

// Refresh dashboard data
async function refreshDashboard(silent = false) {
    try {
        if (!silent) {
            console.log('Fetching analysis data...');
        }
        
        const response = await fetch('./analysis.public.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        currentData = data;
        
        // Update all dashboard components
        updateHeroCard(data);
        updateStatsCards(data);
        updateCharts(data);
        updateRecommendations(data);
        updateDetailsTab(data);
        updateLastUpdated();
        
        if (!silent) {
            console.log('Dashboard updated successfully');
        }
    } catch (error) {
        console.error('Error fetching data:', error);
        if (!silent) {
            showToast('Could not load analysis data. Make sure SmartMeter has run.', 'error');
        }
    }
}

// Update hero card (savings display)
function updateHeroCard(data) {
    const savings = data.monthly_projected_current - data.monthly_projected_optimized;
    const savingsPercent = ((savings / data.monthly_projected_current) * 100).toFixed(1);
    
    // Check if we have insufficient data for meaningful analysis
    const hasInsufficientData = isInsufficientData(data);
    
    // Show cost data notice if costs are zero but we have usage
    const costDataNotice = document.getElementById('costDataNotice');
    if (data.monthly_projected_current === 0 && data.total_tasks > 0) {
        costDataNotice.style.display = 'flex';
    } else {
        costDataNotice.style.display = 'none';
    }
    
    if (hasInsufficientData) {
        // Show professional message about needing more data
        document.getElementById('savingsAmount').textContent = '📊';
        document.getElementById('savingsPercentage').textContent = 'Analyzing...';
        document.getElementById('currentCost').innerHTML = '<span class="insufficient-data">Insufficient data</span>';
        document.getElementById('optimizedCost').innerHTML = '<span class="insufficient-data">Gathering usage...</span>';
        
        // Show helpful message in confidence badge
        const badge = document.getElementById('confidenceBadge');
        badge.innerHTML = `
            <span class="confidence-icon">💡</span>
            <span class="confidence-text">Need more usage data for accurate cost analysis (${data.total_tasks} tasks, ${data.days_analyzed} days so far)</span>
        `;
    } else {
        // Normal display with actual costs
        document.getElementById('savingsAmount').textContent = `$${savings.toFixed(2)}/mo`;
        document.getElementById('savingsPercentage').textContent = `${savingsPercent}% savings`;
        document.getElementById('currentCost').textContent = `$${data.monthly_projected_current.toFixed(2)}/mo`;
        document.getElementById('optimizedCost').textContent = `$${data.monthly_projected_optimized.toFixed(2)}/mo`;
        
        // Update confidence badge
        const badge = document.getElementById('confidenceBadge');
        const confidenceText = getConfidenceText(data.confidence_level, data.days_analyzed);
        badge.innerHTML = `
            <span class="confidence-icon">${getConfidenceIcon(data.confidence_level)}</span>
            <span class="confidence-text">${confidenceText}</span>
        `;
    }
}

// Update stats cards
function updateStatsCards(data) {
    document.getElementById('analysisPeriod').textContent = `${data.days_analyzed} days`;
    document.getElementById('totalTasks').textContent = data.total_tasks;
    document.getElementById('cacheHitRate').textContent = `${(data.cache_hit_rate * 100).toFixed(1)}%`;
    document.getElementById('dailySpend').textContent = `$${data.daily_average.toFixed(2)}`;
}

// Update Chart.js charts
function updateCharts(data) {
    // Model Usage Chart
    if (modelChart) {
        modelChart.destroy();
    }
    
    const modelCtx = document.getElementById('modelChart').getContext('2d');
    const modelColors = [
        '#16a34a', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'
    ];
    
    modelChart = new Chart(modelCtx, {
        type: 'bar',
        data: {
            labels: data.model_breakdown.map(m => m.model),
            datasets: [{
                label: 'Cost ($)',
                data: data.model_breakdown.map(m => m.cost),
                backgroundColor: modelColors,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        afterLabel: function(context) {
                            const model = data.model_breakdown[context.dataIndex];
                            return [
                                `Tasks: ${model.tasks}`,
                                `Avg: $${model.avg_cost_per_task.toFixed(3)}`
                            ];
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return '$' + value.toFixed(2);
                        }
                    }
                }
            }
        }
    });
    
    // Task Classification Chart
    if (taskChart) {
        taskChart.destroy();
    }
    
    const taskCtx = document.getElementById('taskChart').getContext('2d');
    const taskColors = ['#16a34a', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];
    
    taskChart = new Chart(taskCtx, {
        type: 'doughnut',
        data: {
            labels: data.task_breakdown.map(t => t.type),
            datasets: [{
                data: data.task_breakdown.map(t => t.count),
                backgroundColor: taskColors,
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        padding: 15,
                        font: { size: 13 }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const task = data.task_breakdown[context.dataIndex];
                            const percentage = ((task.count / data.total_tasks) * 100).toFixed(1);
                            return `${task.type}: ${task.count} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

// Update recommendations section
function updateRecommendations(data) {
    const container = document.getElementById('recommendationsList');
    
    if (!data.recommendations || data.recommendations.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary);">No recommendations available yet. Run analysis again after collecting more data.</p>';
        return;
    }
    
    container.innerHTML = data.recommendations.map((rec, index) => `
        <div class="recommendation-item">
            <div class="recommendation-header">
                <div class="recommendation-title">
                    <span>${getRecommendationIcon(rec.type)}</span>
                    <span>${rec.title}</span>
                </div>
                <div class="recommendation-impact">Saves ${rec.impact}</div>
            </div>
            <div class="recommendation-description">${rec.description}</div>
            ${rec.details ? `
                <div class="recommendation-details">
                    ${rec.details.map(d => `<span>• ${d}</span>`).join('')}
                </div>
            ` : ''}
            <div class="recommendation-actions">
                <button class="btn btn-secondary btn-sm" onclick="viewRecommendationDetails(${index})">
                    View Details
                </button>
            </div>
        </div>
    `).join('');
}

// Update details tab content
function updateDetailsTab(data) {
    switchTab(activeTab);
}

// Switch between detail tabs
function switchTab(tab) {
    activeTab = tab;
    
    // Update active button
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event?.target?.classList.add('active');
    
    const content = document.getElementById('detailsContent');
    
    if (!currentData) {
        content.innerHTML = '<p>No data available</p>';
        return;
    }
    
    switch(tab) {
        case 'usage':
            content.innerHTML = generateUsageDetails(currentData);
            break;
        case 'models':
            content.innerHTML = generateModelDetails(currentData);
            break;
        case 'timeline':
            content.innerHTML = generateTimelineDetails(currentData);
            break;
    }
}

// Generate usage details HTML
function generateUsageDetails(data) {
    return `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px;">
            <div>
                <h4 style="margin-bottom: 12px; color: var(--text-primary);">Cost Breakdown</h4>
                <table style="width: 100%; font-size: 14px;">
                    <tr><td>Daily Average:</td><td style="text-align: right; font-weight: 600;">$${data.daily_average.toFixed(2)}</td></tr>
                    <tr><td>Weekly Projected:</td><td style="text-align: right; font-weight: 600;">$${data.weekly_projected.toFixed(2)}</td></tr>
                    <tr><td>Monthly Projected:</td><td style="text-align: right; font-weight: 600;">$${data.monthly_projected_current.toFixed(2)}</td></tr>
                    <tr style="border-top: 2px solid var(--border-color); font-weight: 700; color: var(--success-color);">
                        <td style="padding-top: 8px;">Optimized Monthly:</td>
                        <td style="text-align: right; padding-top: 8px;">$${data.monthly_projected_optimized.toFixed(2)}</td>
                    </tr>
                </table>
            </div>
            <div>
                <h4 style="margin-bottom: 12px; color: var(--text-primary);">Performance Metrics</h4>
                <table style="width: 100%; font-size: 14px;">
                    <tr><td>Cache Hit Rate:</td><td style="text-align: right; font-weight: 600;">${(data.cache_hit_rate * 100).toFixed(1)}%</td></tr>
                    <tr><td>Total Tasks:</td><td style="text-align: right; font-weight: 600;">${data.total_tasks}</td></tr>
                    <tr><td>Analysis Period:</td><td style="text-align: right; font-weight: 600;">${data.days_analyzed} days</td></tr>
                    <tr><td>Confidence Level:</td><td style="text-align: right; font-weight: 600;">${data.confidence_level}</td></tr>
                </table>
            </div>
        </div>
    `;
}

// Generate model details HTML
function generateModelDetails(data) {
    return `
        <div>
            <h4 style="margin-bottom: 16px; color: var(--text-primary);">Model Usage Breakdown</h4>
            <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
                <thead>
                    <tr style="background: var(--bg-tertiary); text-align: left;">
                        <th style="padding: 12px;">Model</th>
                        <th style="padding: 12px; text-align: right;">Tasks</th>
                        <th style="padding: 12px; text-align: right;">Total Cost</th>
                        <th style="padding: 12px; text-align: right;">Avg/Task</th>
                        <th style="padding: 12px; text-align: right;">% of Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.model_breakdown.map(model => `
                        <tr style="border-bottom: 1px solid var(--border-color);">
                            <td style="padding: 12px; font-weight: 500;">${model.model}</td>
                            <td style="padding: 12px; text-align: right;">${model.tasks}</td>
                            <td style="padding: 12px; text-align: right;">$${model.cost.toFixed(2)}</td>
                            <td style="padding: 12px; text-align: right;">$${model.avg_cost_per_task.toFixed(3)}</td>
                            <td style="padding: 12px; text-align: right;">${model.percentage.toFixed(1)}%</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

// Generate timeline details HTML
function generateTimelineDetails(data) {
    return `
        <div>
            <h4 style="margin-bottom: 16px; color: var(--text-primary);">Cost Timeline</h4>
            <p style="color: var(--text-secondary); font-size: 14px;">
                Analysis Period: ${data.start_date} to ${data.end_date}
            </p>
            <div style="margin-top: 20px;">
                <canvas id="timelineChart" style="max-height: 300px;"></canvas>
            </div>
        </div>
    `;
}

// Helper functions
function isInsufficientData(data) {
    // Insufficient data if:
    // 1. Total costs are zero or near-zero (< $0.01)
    // 2. Less than 5 tasks analyzed
    // 3. Less than 1 day of data
    const hasNoCosts = data.monthly_projected_current < 0.01;
    const hasMinimalTasks = data.total_tasks < 5;
    const hasMinimalDays = data.days_analyzed < 1;
    
    return hasNoCosts || hasMinimalTasks || hasMinimalDays;
}

function getConfidenceIcon(level) {
    const icons = {
        'high': '✅',
        'medium': '⚠️',
        'low': 'ℹ️',
        'optimistic': '📊'
    };
    return icons[level.toLowerCase()] || 'ℹ️';
}

function getConfidenceText(level, days) {
    if (days < 7) {
        return `${level} confidence (${days} days analyzed - need 14+ for higher confidence)`;
    }
    return `${level} confidence (${days} days analyzed)`;
}

function getRecommendationIcon(type) {
    const icons = {
        'model_switch': '🔄',
        'agent_creation': '🤖',
        'cache_optimization': '⚡',
        'budget_control': '💰',
        'skill_optimization': '⚙️'
    };
    return icons[type] || '💡';
}

function updateLastUpdated() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        second: '2-digit'
    });
    document.getElementById('lastUpdated').textContent = timeString;
}

function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    overlay.classList.add('hidden');
}

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 4000);
}

// API Configuration
const API_BASE_URL = 'http://localhost:3001';

// Action handlers
function viewRecommendationDetails(index) {
    const rec = currentData.recommendations[index];
    alert(`Recommendation Details:\n\n${rec.title}\n\n${rec.description}`);
    // TODO: Open modal with full details
}

async function exportReport() {
    try {
        showToast('Exporting report...', 'info');
        const response = await fetch(`${API_BASE_URL}/api/export`);
        
        if (!response.ok) {
            throw new Error('Failed to export report');
        }
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `smartmeter-report-${new Date().toISOString().slice(0,10)}.md`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        showToast('Report exported successfully!', 'success');
    } catch (error) {
        console.error('Export failed:', error);
        showToast('Failed to export report. Make sure the API server is running.', 'error');
    }
}

async function viewConfig() {
    try {
        showToast('Loading config preview...', 'info');
        const response = await fetch(`${API_BASE_URL}/api/preview`);
        
        if (!response.ok) {
            throw new Error('Failed to load preview');
        }
        
        const data = await response.json();
        
        if (data.success) {
            // Show config in a modal or new window
            const configWindow = window.open('', 'Config Preview', 'width=800,height=600');
            configWindow.document.write(`
                <html>
                <head>
                    <title>SmartMeter Config Preview</title>
                    <style>
                        body { font-family: monospace; padding: 20px; background: #1e1e1e; color: #d4d4d4; }
                        pre { background: #252526; padding: 15px; border-radius: 5px; overflow: auto; }
                        h2 { color: #4ec9b0; }
                    </style>
                </head>
                <body>
                    <h2>📋 Optimized Configuration Preview</h2>
                    <p>This is the configuration that will be applied to ~/.openclaw/openclaw.json</p>
                    <pre>${JSON.stringify(data.config, null, 2)}</pre>
                </body>
                </html>
            `);
            showToast('Config preview opened in new window', 'success');
        } else {
            showToast(data.error || 'Failed to load preview', 'error');
        }
    } catch (error) {
        console.error('Preview failed:', error);
        showToast('Failed to load preview. Make sure the API server is running.', 'error');
    }
}

async function applyOptimizations() {
    if (!confirm('Apply all optimizations?\n\nThis will:\n• Create a backup of your current config\n• Apply the optimized configuration\n• Restart OpenClaw may be required\n\nContinue?')) {
        return;
    }
    
    try {
        showToast('Applying optimizations...', 'info');
        
        const response = await fetch(`${API_BASE_URL}/api/apply`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ confirm: true })
        });
        
        if (!response.ok) {
            throw new Error('Failed to apply optimizations');
        }
        
        const data = await response.json();
        
        if (data.success) {
            showToast('✅ Optimizations applied successfully! Backup created.', 'success');
            // Refresh dashboard after a short delay
            setTimeout(() => refreshDashboard(), 1000);
        } else {
            showToast(data.error || 'Failed to apply optimizations', 'error');
        }
    } catch (error) {
        console.error('Apply failed:', error);
        showToast('Failed to apply optimizations. Make sure the API server is running.', 'error');
    }
}

// Export functions for inline onclick handlers
window.refreshDashboard = refreshDashboard;
window.switchTab = switchTab;
window.viewRecommendationDetails = viewRecommendationDetails;
window.exportReport = exportReport;
window.viewConfig = viewConfig;
window.applyOptimizations = applyOptimizations;
