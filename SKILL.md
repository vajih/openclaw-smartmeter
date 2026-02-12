---
name: smartmeter
description: Analyze OpenClaw usage and generate optimized configs to reduce AI costs by 48%+
version: 0.3.0
metadata:
  openclaw:
    emoji: "💰"
    category: "productivity"
    requires:
      bins: ["node"]
      node: ">=18.0.0"
    user-invocable: true
    capabilities:
      - cost-analysis
      - config-optimization
      - usage-monitoring
    keywords:
      - cost-optimization
      - ai-costs
      - token-monitoring
      - budget-management
      - config-generation
author: vajihkhan
license: Apache-2.0
repository: https://github.com/vajih/openclaw-smartmeter
---

# 💰 SmartMeter

**AI cost optimization for OpenClaw** — Analyze usage patterns, generate optimized configs, and cut costs by 48%+ without sacrificing quality.

## What It Does

SmartMeter helps you save money on AI API costs by:

1. **Analyzing** your OpenClaw usage patterns from session logs
2. **Identifying** tasks that use expensive models unnecessarily
3. **Classifying** workloads (code, writing, research, config, etc.)
4. **Generating** optimized `openclaw.json` configurations
5. **Recommending** specialized agents for different task types
6. **Monitoring** budget usage with alerts

### Real-World Results

Tested on live OpenClaw data:
- **Current cost:** $59.97/month
- **Optimized cost:** $31.14/month
- **Savings:** $28.82/month (48.1%)

The key insight: 69% of tasks worked perfectly with cheaper models, while premium models were only needed for 15% of complex work.

---

## Installation

### Via ClawHub (Recommended)

```bash
npx clawhub@latest install smartmeter
```

### Via npm

```bash
npm install -g openclaw-smartmeter
```

### Manual Installation

```bash
git clone https://github.com/vajih/openclaw-smartmeter.git
cd openclaw-smartmeter
npm install
npm link
```

---

## Quick Start

### One Command - Dashboard Included! 🚀

```bash
smartmeter analyze
```

This will:
- ✅ Analyze your OpenClaw usage logs
- ✅ Calculate potential savings
- ✅ Generate recommendations
- ✅ Launch interactive dashboard automatically
- ✅ Show real-time cost breakdown

The dashboard opens at [http://localhost:8080](http://localhost:8080) with:
- Cost savings visualization
- Model usage breakdown
- One-click optimization
- Export reports

---

## Usage

### Basic Workflow

```bash
# 1. Analyze usage (opens dashboard)
smartmeter analyze [session-file.jsonl]

# 2. Preview optimizations (without applying)
smartmeter preview

# 3. Apply optimizations to openclaw.json
smartmeter apply

# 4. Rollback if needed
smartmeter rollback
```

### Advanced Commands

```bash
# Quick cost evaluation
smartmeter evaluate examples/sample-session.jsonl

# Open dashboard (if already analyzed)
smartmeter dashboard

# Export analysis as JSON
smartmeter export --format json --output analysis.json

# Show current version
smartmeter --version

# Get help
smartmeter --help
```

---

## Features

### 📊 Usage Analysis
- Parse JSONL session logs from `~/.openclaw/agents/*/sessions/`
- Extract model usage, token counts, costs, and cache performance
- Track usage across all agents and time periods
- Minimum 2 days recommended, 14+ days for best results

### 🎯 Task Classification
- Automatically categorize tasks: code, writing, research, config, other
- Keyword-based classification using prompts and tool usage
- Identify patterns in AI agent behavior
- Success rate tracking by model and category

### 💡 Cost Optimization
- Identify expensive models used for simple tasks
- Recommend cheaper alternatives with same quality
- Calculate potential savings with confidence levels
- Generate specialized agents for different workloads

### ⚙️ Config Generation
- Production-ready `openclaw.json` generation
- Primary model optimization based on analysis
- Specialized agent creation (code-reviewer, researcher, quick-tasks)
- Budget controls and spending alerts
- Cache optimization settings
- Fallback chains for reliability

### 🎨 Interactive Dashboard
- Real-time cost breakdown and projections
- Visual charts for model usage and savings
- One-click optimization application
- Export analysis reports
- OpenRouter API integration
- Responsive design (mobile, tablet, desktop)

### 🔐 Safe Deployment
- Automatic config backups before changes
- Timestamped backup files
- One-command rollback: `smartmeter rollback`
- Config validation before applying
- Merge with existing configs (preserves custom settings)

### 🔌 OpenRouter Integration
- Connect your OpenRouter API key
- View actual usage vs. projected
- Real-time budget monitoring
- Cost alerts via Telegram (optional)

---

## Configuration

### OpenRouter API Key (Optional)

For live usage monitoring and alerts:

```bash
# Via environment variable
export OPENROUTER_API_KEY="or-v1-xxxxxxxxxxxx"

# Or store in OpenClaw config
smartmeter config --key or-v1-xxxxxxxxxxxx
```

### Dashboard Configuration

The dashboard server runs on:
- **Dashboard:** http://localhost:8080
- **API Server:** http://localhost:3001

To change ports, edit `~/.openclaw/smartmeter/config.json`

---

## How It Works

### 1. Data Collection
SmartMeter reads your OpenClaw session logs:
```
~/.openclaw/agents/*/sessions/*.jsonl
```

Each log entry contains:
- Model used
- Tokens (input, output, cache)
- Cost breakdown
- User prompts
- Tool invocations
- Timestamps

### 2. Analysis Engine
- **Parser:** Extracts usage data from JSONL logs
- **Classifier:** Categorizes tasks by type (code, writing, research, etc.)
- **Aggregator:** Calculates costs, averages, and patterns
- **Recommender:** Generates optimization suggestions

### 3. Optimization Logic
For each task category:
- Analyze current model usage
- Calculate success rates
- Compare costs vs. quality
- Recommend optimal model
- Estimate savings

Example:
```
Category: code
Current: Claude Opus 4.5 ($0.80/task)
Success rate: 94%

Optimal: Claude Sonnet 4.5 ($0.38/task)
Success rate: 94% (same quality)

Savings: $0.42/task × 200 tasks = $84/month (52.5%)
```

### 4. Config Generation
Creates optimized `openclaw.json`:

```json
{
  "agents": {
    "defaults": {
      "model": {
        "primary": "openrouter/auto",
        "fallback": ["claude-sonnet-4-5", "claude-opus-4-5"]
      },
      "budget": {
        "daily": 5.00,
        "weekly": 30.00,
        "alert": {
          "telegram": true,
          "threshold": 0.75
        }
      }
    },
    "code-reviewer": {
      "model": "claude-sonnet-4-5",
      "description": "Handles code review, debugging, and programming tasks",
      "budget": { "daily": 2.00 }
    },
    "quick-tasks": {
      "model": "deepseek/chat",
      "description": "Simple queries, quick answers, config changes",
      "budget": { "daily": 0.50 }
    }
  }
}
```

---

## Dashboard Guide

### Cost Overview
- Current monthly projection
- Optimized projection
- Potential savings ($ and %)
- Confidence level

### Model Breakdown
- Usage by model
- Token counts
- Cost per model
- Success rates

### Recommendations
- Actionable optimization suggestions
- Expected savings per recommendation
- One-click implementation
- Risk level indicators

### Charts & Visualizations
- Cost trends over time
- Model usage distribution
- Task category breakdown
- Cache hit rate analysis

### Actions
- **Preview:** See changes before applying
- **Apply:** Implement optimizations (creates backup)
- **Export:** Download analysis as JSON/CSV
- **Refresh:** Update with latest session data

---

## Best Practices

### Data Requirements
- **Minimum:** 2 days of usage data
- **Recommended:** 14+ days for accurate patterns
- **Optimal:** 30+ days for seasonal variations

### Analysis Timing
Run analysis:
- After major project milestones
- Monthly for budget reviews
- When costs seem high
- Before scaling usage

### Safety Tips
- Always preview before applying
- Keep backups (automatic)
- Start with conservative settings
- Monitor for 1-2 days after changes
- Roll back if quality degrades

### Optimization Strategy
1. **Phase 1:** Replace expensive models for simple tasks
2. **Phase 2:** Create specialized agents
3. **Phase 3:** Optimize caching and budgets
4. **Phase 4:** Fine-tune based on results

---

## Troubleshooting

### Dashboard Not Loading
```bash
# Check if servers are running
ps aux | grep node

# Restart servers
killall node
smartmeter analyze
```

### No Session Data Found
```bash
# Check if session logs exist
ls -la ~/.openclaw/agents/*/sessions/

# Use sample data for testing
smartmeter analyze examples/sample-session.jsonl
```

### OpenRouter API Errors
```bash
# Verify API key
echo $OPENROUTER_API_KEY

# Test connection
curl -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  https://openrouter.ai/api/v1/auth/key
```

### Apply Failed
```bash
# Check config backup
ls -la ~/.openclaw/openclaw.json.backup-*

# Rollback to previous
smartmeter rollback

# Validate config manually
cat ~/.openclaw/openclaw.json | jq '.'
```

---

## Command Reference

### `smartmeter analyze [file]`
Analyze OpenClaw usage and launch dashboard.

**Options:**
- `[file]` - Optional path to specific session file
- Without file: analyzes all sessions in `~/.openclaw/agents/`

**Output:**
- Analysis saved to `~/.openclaw/smartmeter/analysis.json`
- Dashboard opens at http://localhost:8080
- API server starts on port 3001

### `smartmeter preview`
Preview optimizations without applying.

**Shows:**
- Proposed config changes
- Expected savings
- Risk assessment
- Confidence levels

### `smartmeter apply`
Apply optimizations to `openclaw.json`.

**Safety:**
- Creates backup: `openclaw.json.backup-{timestamp}`
- Validates config before applying
- Merges with existing settings
- Preserves custom configurations

### `smartmeter rollback`
Restore previous configuration.

**Process:**
- Lists available backups
- Restores most recent by default
- Verifies restoration success

### `smartmeter dashboard`
Open dashboard without re-analyzing.

**Requirements:**
- Previous analysis must exist
- Servers start automatically

### `smartmeter evaluate <file>`
Quick cost evaluation of session file.

**Use Case:**
- One-off analysis
- Testing with sample data
- CI/CD cost checks

### `smartmeter export`
Export analysis data.

**Options:**
- `--format json|csv` - Output format
- `--output <file>` - Destination file

### `smartmeter config`
Manage SmartMeter configuration.

**Subcommands:**
- `--key <api-key>` - Store OpenRouter API key
- `--show` - Display current config
- `--reset` - Reset to defaults

---

## Examples

### Basic Usage
```bash
# Install
npm install -g openclaw-smartmeter

# Analyze and view dashboard
smartmeter analyze

# Apply optimizations
smartmeter apply
```

### Advanced Workflow
```bash
# Analyze specific session
smartmeter analyze ~/.openclaw/agents/my-agent/sessions/session-123.jsonl

# Preview changes
smartmeter preview

# Export analysis
smartmeter export --format json --output report.json

# Apply optimizations
smartmeter apply

# Monitor for issues, rollback if needed
smartmeter rollback
```

### Continuous Monitoring
```bash
# Weekly analysis (add to cron)
0 0 * * 0 smartmeter analyze && smartmeter export --format csv --output weekly-report.csv

# Budget alerts via Telegram
export TELEGRAM_BOT_TOKEN="your-token"
export TELEGRAM_CHAT_ID="your-chat-id"
smartmeter monitor --alert-threshold 0.75
```

---

## FAQ

### Will this affect my AI quality?
No. SmartMeter only recommends changes when cheaper models achieve the same success rate. You can always preview before applying.

### How much data is needed?
Minimum 2 days, but 14+ days recommended for accurate patterns. The tool will warn if data is insufficient.

### Is my data safe?
Yes. All analysis happens locally on your machine. No data is sent to external servers except OpenRouter API (if you configure it).

### Can I undo changes?
Yes. Every change creates an automatic backup. Use `smartmeter rollback` to restore.

### Does it work with other AI providers?
Currently optimized for OpenRouter, but works with any provider supported by OpenClaw.

### What if I use custom agents?
SmartMeter merges with your existing config and preserves custom settings. It only modifies cost-related fields.

---

## Requirements

- **Node.js:** 18.0.0 or higher
- **OpenClaw:** Any version with session logging
- **Storage:** At least 2 days of session logs
- **Ports:** 8080 (dashboard), 3001 (API)

---

## Learn More

- **GitHub:** https://github.com/vajih/openclaw-smartmeter
- **Issues:** https://github.com/vajih/openclaw-smartmeter/issues
- **License:** Apache 2.0

---

## Support

Found a bug? Have a feature request?

1. Check [existing issues](https://github.com/vajih/openclaw-smartmeter/issues)
2. Create a new issue with details
3. Include your Node.js version and OS

---

## Changelog

### v0.3.0 (February 11, 2026)
- ✨ OpenRouter API integration
- 🎨 Professional UI redesign
- 🐛 Fixed apply optimization feature
- 📊 Enhanced dashboard with real-time data
- 🔒 Improved config validation

### v0.2.4
- 💄 UX improvements for cost display
- 🐛 Zero-cost scenario handling

### v0.2.3
- 🐛 Critical bug fix: keep analyze command alive

### v0.2.2
- 📦 Initial public release
- ✨ Core analysis and optimization engine
- 🎨 Basic dashboard UI

---

**Made with 💰 by the OpenClaw community**
