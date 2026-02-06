# SmartMeter: OpenClaw Cost Optimization Skill

## Project Overview

SmartMeter analyzes OpenClaw usage patterns and generates optimized `openclaw.json` configurations to reduce AI API costs by 60-75% while maintaining quality.

## Core Functionality

### Phase 1: Analysis Engine (MVP - Week 1)

**Input:** OpenClaw session logs from `~/.openclaw/agents/*/sessions/*.jsonl`
**Output:** Usage analysis JSON

**What to analyze:**

1. **Token Usage Patterns**
   - Parse session logs (JSONL format)
   - Extract: `model`, `usage.input`, `usage.output`, `usage.cacheRead`, `usage.cacheWrite`, `cost.total`
   - Aggregate by: model, time of day, day of week
   - Calculate: tokens/request, cost/request, cache hit rate

2. **Task Classification**
   - Extract user prompts and assistant responses
   - Classify into categories:
     - `code`: Programming, debugging, code review
     - `write`: Documentation, emails, content creation
     - `research`: Web searches, information gathering
     - `config`: File operations, system tasks
     - `other`: Uncategorized
   - Use keyword matching + prompt length + tool usage as features

3. **Model Performance**
   - For each task category, track:
     - Success rate by model (infer from: no errors, no user re-prompts within 5min)
     - Average tokens consumed
     - Average cost
     - User satisfaction signals (explicit positive/negative feedback, task completion)

4. **Skill Usage**
   - Parse which skills were invoked in each session
   - Frequency analysis
   - Co-occurrence patterns (which skills are used together)

5. **Temporal Patterns**
   - Hour-of-day usage distribution
   - Day-of-week patterns
   - Burst vs. steady usage detection

**Technical Requirements:**

- Language: Node.js (OpenClaw is Node-based)
- Parse JSONL efficiently (stream processing for large files)
- Store analysis in `~/.openclaw/smartmeter/analysis.json`
- Minimum data: 2 weeks of history (or warn if insufficient)

**Implementation Notes:**

```javascript
// Session log format (example)
{
  "type": "message",
  "message": {
    "role": "assistant",
    "content": "...",
    "usage": {
      "input": 1250,
      "output": 340,
      "cacheRead": 45000,
      "cacheWrite": 0,
      "cost": {"total": 0.0234}
    },
    "model": "anthropic/claude-sonnet-4-5",
    "timestamp": 1738723945279
  }
}

// Analysis output format
{
  "period": {
    "start": "2026-01-20T00:00:00Z",
    "end": "2026-02-05T00:00:00Z",
    "days": 14,
    "totalTasks": 847
  },
  "models": {
    "anthropic/claude-opus-4-5": {
      "count": 234,
      "tokens": {"input": 345000, "output": 89000},
      "cost": 187.23,
      "avgCostPerTask": 0.80
    },
    "anthropic/claude-sonnet-4-5": {
      "count": 613,
      "tokens": {"input": 890000, "output": 234000},
      "cost": 234.56,
      "avgCostPerTask": 0.38
    }
  },
  "categories": {
    "code": {
      "count": 312,
      "modelBreakdown": {
        "anthropic/claude-opus-4-5": {
          "count": 98,
          "successRate": 0.96,
          "avgCost": 0.85
        },
        "anthropic/claude-sonnet-4-5": {
          "count": 214,
          "successRate": 0.94,
          "avgCost": 0.38
        }
      },
      "recommendation": {
        "currentModel": "anthropic/claude-opus-4-5",
        "optimalModel": "anthropic/claude-sonnet-4-5",
        "confidence": 0.94,
        "potentialSavings": 45.67
      }
    }
    // ... other categories
  },
  "skills": {
    "github": {"count": 67, "avgTokens": 3400},
    "web-search": {"count": 123, "avgTokens": 8900},
    // ... unused skills
    "unused": ["skill1", "skill2", ...] // 42 skills never used
  },
  "temporal": {
    "hourly": {
      "08": 45, "09": 67, ... // tasks by hour
    },
    "daily": {
      "Mon": 125, "Tue": 134, ...
    },
    "patterns": {
      "burstUsage": true,
      "peakHours": ["08-10", "14-16", "20-22"],
      "quietHours": ["00-06"]
    }
  },
  "caching": {
    "hitRate": 0.42,
    "avgCacheRead": 45000,
    "estimatedCacheSavings": 34.56,
    "recommendation": "Enable long retention + 55min heartbeat"
  },
  "summary": {
    "currentMonthlyCost": 387.45,
    "optimizedMonthlyCost": 126.78,
    "potentialSavings": 260.67,
    "savingsPercentage": 67.3,
    "confidence": "conservative" // or "likely" or "optimistic"
  }
}
```

### Phase 2: Config Generator (Week 1)

**Input:** Analysis JSON from Phase 1
**Output:** Optimized `openclaw.json` with inline comments

**What to generate:**

1. **Primary Model Optimization**
   - If current primary is Opus and analysis shows 95%+ success on Sonnet:
     - Change primary to Sonnet
     - Add Opus to fallback
     - Add comment explaining rationale

2. **Specialized Agent Creation**
   - For each task category with >50 occurrences:
     - Create dedicated agent
     - Assign optimal model based on analysis
     - Include relevant skills
     - Add budget controls
   - Example agents to generate:
     - `code-reviewer` (if lots of code tasks)
     - `teaching-assistant` (if education patterns detected)
     - `researcher` (if high search usage)
     - `quick-tasks` (for simple operations)

3. **Skill Optimization**
   - List unused skills (never invoked in analysis period)
   - Generate `allowBundled: false` config
   - Whitelist only used skills
   - Calculate token savings (skills add ~200-300 tokens each to prompt)

4. **Caching Configuration**
   - If burst pattern detected:
     - Set `cacheRetention: "long"`
     - Add heartbeat based on quiet hours
   - If steady usage:
     - Default retention is fine

5. **Budget Controls**
   - Calculate current daily average
   - Set daily limit at 120% of average (safety margin)
   - Set weekly limit at 7x daily
   - Configure Telegram alerts at 75%

6. **Fallback Chain Optimization**
   - Order models by: cost-effectiveness for user's workload
   - Example: If user does lots of research: Gemini Flash first
   - If user does lots of code: Haiku first

**Technical Requirements:**

- Deep merge with existing config (don't overwrite user customizations)
- Preserve user comments
- Add SmartMeter comments prefixed with `"// SMARTMETER:"`
- Validate JSON schema before output
- Create backup of original at `~/.openclaw/openclaw.json.backup-{timestamp}`

**Implementation Notes:**

```javascript
// Config generation logic
function generateOptimizedConfig(analysis, currentConfig) {
  const optimized = deepClone(currentConfig);

  // 1. Optimize primary model
  if (shouldChangePrimary(analysis)) {
    optimized.agents.defaults.model.primary = getOptimalPrimary(analysis);
    addComment(
      optimized,
      "agents.defaults.model.primary",
      `SmartMeter: Changed from ${currentConfig.agents.defaults.model.primary}. ` +
        `Success rate: ${analysis.models[newModel].successRate}%. ` +
        `Saves $${analysis.summary.potentialSavings}/month`,
    );
  }

  // 2. Create specialized agents
  const agentsToCreate = identifySpecializedAgents(analysis);
  for (const agent of agentsToCreate) {
    optimized.agents[agent.name] = generateAgentConfig(agent, analysis);
  }

  // 3. Optimize skills
  const usedSkills = analysis.skills.used || [];
  if (usedSkills.length < 20) {
    // Only optimize if significant reduction
    optimized.skills = {
      allowBundled: false,
      allow: usedSkills,
    };
    addComment(
      optimized,
      "skills",
      `SmartMeter: Disabled ${analysis.skills.unused.length} unused skills. ` +
        `Saves ~${analysis.skills.unused.length * 200} tokens/request`,
    );
  }

  // 4. Configure caching
  if (analysis.temporal.patterns.burstUsage) {
    optimized.models = optimized.models || {};
    const primaryModel = optimized.agents.defaults.model.primary;
    optimized.models[primaryModel] = {
      params: {
        cacheRetention: "long",
      },
    };

    // Add heartbeat during quiet hours
    const quietStart = analysis.temporal.patterns.quietHours[0];
    optimized.heartbeat = {
      every: "55m",
      schedule: `*/${quietStart}-06 * * *`, // During quiet hours
    };
  }

  // 5. Budget controls
  const dailyAvg = analysis.summary.currentMonthlyCost / 30;
  optimized.agents.defaults.budget = {
    daily: Math.ceil(((dailyAvg * 1.2) / costPerToken) * 1000), // tokens
    weekly: Math.ceil(((dailyAvg * 7) / costPerToken) * 1000),
    alert: {
      telegram: true,
      threshold: 0.75,
    },
  };

  return optimized;
}
```

### Phase 3: CLI Interface (Week 1)

**Commands to implement:**

```bash
# Analysis & preview
smartmeter analyze              # Analyze usage, generate report
smartmeter preview              # Show proposed config changes
smartmeter diff [v1] [v2]       # Compare config versions
smartmeter show                 # Display full optimized config

# Application
smartmeter apply                # Apply optimized config (with backup)
smartmeter rollback [version]   # Rollback to previous config

# Monitoring
smartmeter status               # Current optimization status
smartmeter report [period]      # Savings report (week/month)
smartmeter costs --by-project   # Cost breakdown by project

# Configuration
smartmeter config set KEY VALUE # Update SmartMeter settings
smartmeter history              # Show config version history

# Iteration
smartmeter iterate              # Check for new optimization opportunities
smartmeter learn                # Update ML model from recent data
```

**Implementation:**

- Use `commander.js` for CLI parsing
- Store SmartMeter data in `~/.openclaw/smartmeter/`
- Integrate with OpenClaw's existing `/status` and `/usage` commands

### Phase 4: OpenRouter Integration (Week 2)

**API Integration:**

```javascript
// Fetch OpenRouter usage
async function fetchOpenRouterUsage(apiKey) {
  const response = await fetch("https://openrouter.ai/api/v1/auth/key", {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  const data = await response.json();

  return {
    credits: {
      total: data.limit,
      used: data.usage,
      remaining: data.limit - data.usage,
    },
    models: data.models || [], // Usage by model
    rate: data.rate || {}, // Current burn rate
  };
}
```

**Merge with OpenClaw logs:**

- OpenClaw logs have detailed token counts
- OpenRouter has credit usage and model-specific costs
- Cross-reference by timestamp
- Reconcile any discrepancies

### Phase 5: Monitoring & Alerts (Week 2)

**Telegram Bot Integration:**

```javascript
// Send alert via Telegram
async function sendTelegramAlert(chatId, message) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: "Markdown",
    }),
  });
}

// Alert conditions
function checkAlerts(usage, budgets) {
  const alerts = [];

  // Daily budget
  if (usage.today >= budgets.daily * 0.75) {
    alerts.push({
      type: "budget",
      severity: "warning",
      message: `Daily budget 75% used: ${usage.today}/${budgets.daily} tokens`,
    });
  }

  // Unusual spike
  const avgLast7Days = usage.last7Days / 7;
  if (usage.today > avgLast7Days * 2) {
    alerts.push({
      type: "spike",
      severity: "info",
      message: `Unusual activity: ${usage.today} tokens today vs ${avgLast7Days} avg`,
    });
  }

  // Cost anomaly
  const expensiveTask = usage.recentTasks.find((t) => t.cost > 1.0);
  if (expensiveTask) {
    alerts.push({
      type: "cost",
      severity: "warning",
      message: `Expensive task detected: $${expensiveTask.cost} for "${expensiveTask.prompt.slice(0, 50)}..."`,
    });
  }

  return alerts;
}
```

### Phase 6: Chrome Extension (Week 3 - Optional for MVP)

**Architecture:**

```
chrome-extension/
├── manifest.json              # Extension config (Manifest V3)
├── background/
│   └── service-worker.js      # Background tasks, API polling
├── popup/
│   ├── popup.html             # Extension popup UI
│   ├── popup.js               # Popup logic
│   └── popup.css              # Styles
├── content/
│   └── claude-ai-inject.js    # Inject into claude.ai pages
└── assets/
    ├── icon-16.png
    ├── icon-48.png
    └── icon-128.png
```

**Key features:**

1. **Badge:** Show daily spend
2. **Popup:** Quick stats, model switcher
3. **Content Script:** Inject cost per message on claude.ai
4. **Background:** Poll OpenRouter API every 30s

## Testing Requirements

### Unit Tests

- Parser: Parse JSONL correctly
- Analyzer: Classify tasks accurately
- Generator: Produce valid JSON
- Merger: Deep merge without data loss

### Integration Tests

- End-to-end: Analyze → Generate → Apply → Verify
- Rollback: Apply → Rollback → Verify original restored
- Multi-version: Upgrade from OpenClaw v1 → v2

### User Testing

- Run on real OpenClaw installations
- Validate savings predictions (compare before/after)
- Collect feedback on generated configs

## Documentation

### README.md

- Overview
- Installation
- Quick start
- Commands reference
- FAQ

### SKILL.md (OpenClaw format)

```markdown
---
name: smartmeter
description: Analyze OpenClaw usage and generate optimized configs to reduce AI costs by 60-75%
metadata:
  openclaw:
    emoji: "💰"
    requires:
      bins: ["node"]
    user-invocable: true
---

# SmartMeter

## Installation

\`\`\`bash
npx clawhub@latest install smartmeter
\`\`\`

## Usage

\`\`\`bash
/smartmeter analyze # Analyze your usage
/smartmeter preview # See optimization recommendations
/smartmeter apply # Apply optimized config
\`\`\`

## What it does

1. Analyzes 2+ weeks of OpenClaw usage
2. Identifies tasks that can use cheaper models
3. Generates specialized agents for different workloads
4. Optimizes skill loading, caching, and budgets
5. Projects 60-75% cost savings while maintaining quality

## Configuration

Store your OpenRouter API key:
\`\`\`bash
export OPENROUTER_API_KEY="sk-or-v1-..."
\`\`\`

## Learn more

GitHub: https://github.com/YOUR_USERNAME/smartmeter-openclaw
Docs: https://docs.smartmeter.ai
```

### CONTRIBUTING.md

- How to contribute
- Code style
- Testing guidelines
- PR process

## Security & Privacy

### Data Handling

- All analysis happens locally
- No data sent to external servers (except OpenRouter API for usage)
- User can opt-out of any telemetry
- OpenRouter API key stored securely in env vars

### Config Validation

- Validate JSON schema before applying
- Check for dangerous configs (e.g., infinite budgets)
- Warn if config will significantly change behavior

### Rollback Safety

- Always create backup before applying
- Store last 10 config versions
- One-command rollback

## Performance Requirements

### Analysis Speed

- Parse 100K lines of JSONL in <10 seconds
- Generate config in <5 seconds
- Total analysis time: <30 seconds for 2 weeks of data

### Memory

- Keep memory usage <200MB during analysis
- Stream large session files instead of loading entirely

### Storage

- Analysis data: <10MB per user
- Config backups: <1MB total (JSON is small)

## Future Enhancements (Post-MVP)

### Machine Learning

- Train model on user feedback (good/bad recommendations)
- Improve task classification accuracy
- Predict future costs based on trends

### Team Features

- Share optimization learnings across team
- Consolidated billing reports
- Team-wide agents

### Enterprise

- Custom optimization rules
- Approval workflows
- Compliance reporting

## Success Metrics

### MVP Success (Week 4)

- 100 users install
- Average 50%+ cost reduction
- 90%+ user satisfaction with recommendations
- <5% rollback rate

### Growth Targets (Month 3)

- 1,000 users
- $50K+ monthly savings across user base
- 100+ GitHub stars
- Featured on Product Hunt

## Dependencies

```json
{
  "dependencies": {
    "commander": "^11.0.0", // CLI framework
    "jsonstream": "^1.3.5", // Stream JSON parsing
    "lodash": "^4.17.21", // Utilities
    "chalk": "^5.3.0", // Terminal colors
    "node-fetch": "^3.3.2", // HTTP requests
    "dotenv": "^16.3.1" // Environment variables
  },
  "devDependencies": {
    "jest": "^29.7.0", // Testing
    "eslint": "^8.53.0", // Linting
    "@types/node": "^20.9.0" // TypeScript types
  }
}
```

## File Structure

```
smartmeter-openclaw/
├── src/
│   ├── analyzer/
│   │   ├── parser.js           # Parse OpenClaw session logs
│   │   ├── classifier.js       # Classify tasks
│   │   ├── aggregator.js       # Aggregate statistics
│   │   └── recommender.js      # Generate recommendations
│   ├── generator/
│   │   ├── config-builder.js   # Build optimized config
│   │   ├── agent-creator.js    # Create specialized agents
│   │   ├── merger.js           # Merge with existing config
│   │   └── validator.js        # Validate config
│   ├── cli/
│   │   ├── index.js            # CLI entry point
│   │   ├── commands.js         # Command handlers
│   │   └── utils.js            # CLI utilities
│   ├── monitor/
│   │   ├── tracker.js          # Track ongoing usage
│   │   ├── alerter.js          # Send alerts
│   │   └── reporter.js         # Generate reports
│   ├── integrations/
│   │   ├── openrouter.js       # OpenRouter API
│   │   └── telegram.js         # Telegram bot
│   └── index.js                # Main entry point
├── tests/
│   ├── parser.test.js
│   ├── generator.test.js
│   └── integration.test.js
├── docs/
│   ├── api.md
│   ├── architecture.md
│   └── examples.md
├── examples/
│   ├── sample-analysis.json
│   └── sample-config.json
├── chrome-extension/           # Optional
├── package.json
├── SKILL.md                    # OpenClaw skill definition
├── SPEC.md                     # This file
├── README.md
├── CONTRIBUTING.md
├── LICENSE
└── .gitignore
```

## Development Phases

### Week 1: Core MVP

- [ ] Parser (parse session logs)
- [ ] Analyzer (classify tasks, aggregate stats)
- [ ] Generator (create optimized config)
- [ ] CLI basics (analyze, preview, apply)
- [ ] Basic tests
- [ ] Documentation

### Week 2: Polish & Integration

- [ ] OpenRouter integration
- [ ] Telegram alerts
- [ ] Monitoring & reporting
- [ ] Config versioning & rollback
- [ ] Advanced CLI commands
- [ ] Comprehensive tests

### Week 3: Publishing & Extension

- [ ] Publish to ClawHub
- [ ] Chrome extension (basic)
- [ ] Website/landing page
- [ ] Video demo
- [ ] LinkedIn launch posts

### Week 4: Iteration

- [ ] User feedback integration
- [ ] Bug fixes
- [ ] Performance optimization
- [ ] A/B testing features
