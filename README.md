<p align="center">
  <h1 align="center">SmartMeter</h1>
  <p align="center">
    <strong>AI cost optimization for OpenClaw</strong>
  </p>
  <p align="center">
    Analyze your AI usage patterns. Generate optimized configs. Cut costs by 48%+.
  </p>
  <p align="center">
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-Apache_2.0-blue.svg" alt="License: Apache 2.0"></a>
    <a href="#"><img src="https://img.shields.io/badge/Node.js-18%2B-green.svg" alt="Node.js 18+"></a>
    <a href="#"><img src="https://img.shields.io/badge/Tests-93%20passing-brightgreen.svg" alt="Tests: 93 passing"></a>
  </p>
</p>

---

## What is SmartMeter?

SmartMeter is a cost optimization skill for [OpenClaw](https://openclaw.ai) that analyzes your AI agent usage and generates optimized configurations to reduce API spending — without sacrificing quality.

It parses your session logs, classifies tasks by type, identifies which models are overkill for routine work, and generates a tuned `openclaw.json` that routes the right tasks to the right models.

### Real-World Results

Tested on live OpenClaw data (288 tasks across 9 sessions):

| Metric | Value |
|---|---|
| Current monthly projection | $59.97 |
| Optimized monthly projection | $31.14 |
| **Potential savings** | **$28.82/month (48.1%)** |
| Models analyzed | DeepSeek Chat, Claude Sonnet 4.5, Claude Opus 4.5 |
| Confidence | Optimistic (2 days of data; improves with 14+ days) |

The key insight: DeepSeek Chat handled 69% of tasks at 1/5th the cost of premium models, while Opus was only needed for 15% of complex work.

## Features

- **Usage Analysis** — Parse JSONL session logs, extract model usage, token counts, costs, and cache performance across all agents
- **Task Classification** — Automatically categorize tasks into code, writing, research, config, and other using keyword-based classification
- **Cost Optimization** — Identify where expensive models are being used for simple tasks and recommend cheaper alternatives
- **Config Generation** — Generate production-ready `openclaw.json` with primary model, fallback chains, specialized agents, budget controls, and caching settings
- **Live Dashboard** — Interactive web dashboard deployed to OpenClaw Canvas with auto-refresh, charts, and actionable recommendations
- **Safe Rollback** — Every config change creates a timestamped backup; one command to roll back
- **CLI Interface** — 8 commands covering the full workflow from analysis to deployment

## Installation

```bash
git clone https://github.com/vajih/openclaw-smartmeter.git
cd openclaw-smartmeter
npm install
```

To make the `smartmeter` command available globally:

```bash
npm link
```

## Quick Start

### 1. Analyze your usage

```bash
# Analyze default OpenClaw data (~/.openclaw)
smartmeter analyze

# Or point to a specific data directory
smartmeter analyze --data-dir ~/my-openclaw-data
```

Output:
```
Analysis: 2026-02-04 to 2026-02-05 (2 days)

  Total tasks               288
  Total cost                $4.00
  Monthly cost (projected)  $59.97
  Optimized monthly cost    $31.14
  Potential savings         $28.82/month (48.1%)
  Confidence                optimistic
```

### 2. Preview recommended changes

```bash
smartmeter preview --data-dir ~/my-openclaw-data
```

```
Proposed changes:
  - Primary model: (none) -> deepseek/deepseek-chat
  - Fallback chain: delivery-mirror -> anthropic/claude-sonnet-4.5 -> anthropic/claude-opus-4.5
  - New agents: code-reviewer
  - Budget: $2.40/day, $16.80/week
```

### 3. View the full generated config

```bash
smartmeter show --data-dir ~/my-openclaw-data
```

### 4. Apply the optimized config

```bash
smartmeter apply --data-dir ~/my-openclaw-data
```

This creates a backup of your current config before writing the new one.

### 5. Launch the dashboard

```bash
smartmeter dashboard
```

Opens an interactive web dashboard in your browser with:
- Cost savings overview with confidence indicators
- Model usage breakdown (bar chart)
- Task classification distribution (doughnut chart)
- Actionable recommendations with impact estimates
- Auto-refresh every 5 seconds

### 6. Roll back if needed

```bash
smartmeter rollback
```

## CLI Reference

| Command | Description |
|---|---|
| `smartmeter analyze` | Run full analysis pipeline and save results |
| `smartmeter show` | Display the generated optimized config as JSON |
| `smartmeter preview` | Show what would change without applying |
| `smartmeter apply` | Apply optimized config (creates backup first) |
| `smartmeter rollback` | Restore the most recent backup config |
| `smartmeter status` | Show current optimization status from stored analysis |
| `smartmeter report` | Detailed breakdown: models, categories, temporal, caching |
| `smartmeter dashboard` | Deploy and open the web dashboard |

**Global options** for commands that run analysis:
- `-d, --data-dir <path>` — OpenClaw data directory (default: `~/.openclaw`)

**Dashboard options:**
- `-p, --port <number>` — OpenClaw gateway port (default: 8080)
- `--no-open` — Don't open browser automatically

## Screenshots

### Dashboard Overview
![SmartMeter Dashboard](docs/screenshots/dashboard-overview.png)
*Live-updating dashboard with cost savings, model breakdown, and actionable recommendations*

### Cost Savings Analysis
![Cost Savings](docs/screenshots/dashboard-hero.png)
*Real-time savings calculation showing 48% cost reduction with confidence indicators*

### Interactive Analytics
![Analytics Charts](docs/screenshots/dashboard-charts.png)
*Model usage breakdown and task classification powered by Chart.js*

## How It Works

SmartMeter processes your data through a four-stage pipeline:

```
Session Logs (.jsonl)
        |
   [ Parser ]          Stream-parse JSONL, extract assistant messages,
        |               pair with user prompts, normalize content formats
        v
  [ Classifier ]        Keyword-based task categorization into
        |               code / write / research / config / other
        v
  [ Aggregator ]        Per-model and per-category statistics,
        |               temporal patterns, caching metrics
        v
  [ Recommender ]       Per-category model recommendations,
        |               savings calculations, confidence scoring
        v
  [ Config Generator ]  Optimized openclaw.json with model routing,
                        agents, budgets, caching, fallback chains
```

### What gets optimized

1. **Primary Model** — Switch to the cheapest model that handles your dominant workload
2. **Specialized Agents** — Auto-create agents for high-volume categories (e.g., a `code-reviewer` agent using DeepSeek for code tasks)
3. **Fallback Chains** — Ordered by cost so expensive models are only used when needed
4. **Budget Controls** — Daily/weekly caps with alert thresholds to prevent runaway costs
5. **Caching** — Long retention and heartbeat settings for burst usage patterns
6. **Skill Routing** — Ready for per-skill model assignment (awaiting skill log format)

## Architecture

```
src/
  analyzer/             # Phase 1: Analysis engine
    parser.js           #   JSONL stream parser with content normalization
    classifier.js       #   Keyword-based task classifier
    aggregator.js       #   Statistics aggregation
    recommender.js      #   Optimization recommendations
    storage.js          #   Analysis persistence
  generator/            # Phase 2: Config generator
    config-builder.js   #   Main orchestrator
    agent-creator.js    #   Specialized agent creation
    merger.js           #   Deep merge utility
    validator.js        #   Config validation
  canvas/               # Canvas dashboard
    deployer.js         #   Dashboard deployment and public data generation
  cli/                  # Phase 3: CLI interface
    index.js            #   Commander.js entry point (8 commands)
    commands.js         #   Command handlers
    utils.js            #   Formatting helpers
tests/                  # 93 tests across all modules
canvas-template/        # Dashboard HTML/JS/CSS
docs/                   # SPEC alignment, backlog, dashboard docs
```

## Testing

```bash
# Run all tests
npm test

# Run a specific test file
node --test tests/parser.test.js

# Run with verbose output
node --test --reporter spec tests/*.test.js
```

93 tests covering parser, classifier, aggregator, recommender, storage, config generator, and CLI commands.

## Documentation

- [SPEC.md](SPEC.md) — Full project specification (source of truth)
- [docs/SPEC_ALIGNMENT.md](docs/SPEC_ALIGNMENT.md) — Implementation status for each SPEC requirement
- [docs/backlog.md](docs/backlog.md) — Deferred features and future phases
- [docs/CANVAS_DASHBOARD.md](docs/CANVAS_DASHBOARD.md) — Dashboard quick start guide
- [docs/CANVAS_BUILD_NOTES.md](docs/CANVAS_BUILD_NOTES.md) — Dashboard build notes
- [CONTRIBUTING.md](CONTRIBUTING.md) — Contribution guidelines
- [SECURITY.md](SECURITY.md) — Security policy

## Roadmap

- [x] **Phase 1** — Analysis Engine (parser, classifier, aggregator, recommender)
- [x] **Phase 2** — Config Generator (model optimization, agents, budgets, caching)
- [x] **Phase 3** — CLI Interface (8 commands with `--data-dir` support)
- [x] **Canvas Dashboard** — Interactive web dashboard with charts and recommendations
- [ ] **Phase 4** — OpenRouter API integration for live pricing
- [ ] **Phase 5** — Telegram alerts and notifications
- [ ] **Phase 6** — Chrome extension for real-time monitoring

## Author

**Vajih Khan**
- LinkedIn: [linkedin.com/in/vajihkhan](https://www.linkedin.com/in/vajihkhan/)
- Twitter: [@vajih](https://twitter.com/vajih)
- GitHub: [@vajih](https://github.com/vajih)

Built with 30+ years of experience in technology innovation, product development, and AI optimization.

## License

[Apache License 2.0](LICENSE)

---

Built with [OpenClaw](https://openclaw.ai) and [Claude Code](https://claude.ai/claude-code)
