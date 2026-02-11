# Applying SmartMeter Optimizations

This guide explains how to apply cost optimizations using SmartMeter's CLI and web dashboard.

## Overview

SmartMeter provides **two ways** to apply optimizations:

1. **CLI Commands** - Direct terminal commands for quick analysis and application
2. **Web Dashboard** - Interactive UI with "Apply Optimizations" button

Both methods create automatic backups and are fully reversible.

---

## Method 1: CLI Workflow

### Quick Start (Recommended)

```bash
# Step 1: Analyze your usage
smartmeter analyze

# Step 2: Get friendly evaluation
smartmeter evaluate

# Step 3: Apply optimizations
smartmeter apply
```

### Detailed Workflow

#### 1. Analyze Your Usage

```bash
smartmeter analyze
```

**What it does:**

- Parses all session logs from `~/.openclaw/agents/*/sessions/*.jsonl`
- Calculates current costs and token usage
- Identifies optimization opportunities
- Saves analysis to `~/.openclaw/smartmeter/analysis.json`

**Output:**

```
Analysis: 2026-02-04 to 2026-02-05 (2 days)

  Total tasks               288
  Total cost                $4.00
  Monthly cost (projected)  $59.97
  Optimized monthly cost    $31.14
  Potential savings         $28.82/month (48.1%)
```

#### 2. Evaluate Configuration

```bash
smartmeter evaluate
```

**What it does:**

- Shows current vs optimized costs
- Lists top 3 recommendations
- Displays cache performance
- Suggests next steps

**Output:**

```
╔════════════════════════════════════════════════════════╗
║          SmartMeter Configuration Evaluation          ║
╚════════════════════════════════════════════════════════╝

📊 Current Analysis:
   Period: 2 days
   Tasks Analyzed: 288
   Confidence: optimistic

💰 Cost Analysis:
   Current Monthly Cost:   $59.97
   Optimized Monthly Cost: $31.14
   Potential Savings:      $28.82/month (48.1%)

🎯 Recommendations:
   1. Switch primary model to DeepSeek Chat
   2. Create specialized code-reviewer agent
   3. Optimize cache retention
```

#### 3. Get Optimization Guidance

```bash
smartmeter guide
```

**What it does:**

- Provides detailed optimization roadmap
- Explains each recommendation
- Shows configuration changes
- Offers multiple application options

#### 4. Preview Changes (Optional)

```bash
smartmeter preview
```

**What it does:**

- Shows exact config changes that will be applied
- Side-by-side comparison
- No modifications made

**Output:**

```
Proposed changes:
  - Primary model: (none) -> deepseek/deepseek-chat
  - Fallback chain: anthropic/claude-sonnet-4.5 -> anthropic/claude-opus-4.5
  - New agents: code-reviewer
  - Budget: $2.40/day, $16.80/week
```

#### 5. Apply Optimizations

```bash
smartmeter apply
```

**What it does:**

- Creates backup: `~/.openclaw/openclaw.json.backup-<timestamp>`
- Validates new configuration
- Writes optimized config to `~/.openclaw/openclaw.json`
- Updates analysis data

**Output:**

```
Backup saved to ~/.openclaw/openclaw.json.backup-2026-02-11T12-30-45-123Z
Config written to ~/.openclaw/openclaw.json
✓ Optimizations applied successfully
```

#### 6. Rollback if Needed

```bash
smartmeter rollback
```

**What it does:**

- Restores most recent backup
- No questions asked

---

## Method 2: Web Dashboard

### Start Full-Featured Dashboard

```bash
smartmeter serve
```

This starts:

- **Dashboard UI** on `http://localhost:8080`
- **API Server** on `http://localhost:3001`
- Both auto-refresh and fully functional

The dashboard automatically opens in your browser.

### Dashboard Features

#### 1. View Analytics

- Real-time cost savings calculations
- Model breakdown charts (Bar chart)
- Task classification (Doughnut chart)
- Cache performance metrics

#### 2. Preview Config Changes

Click the **"⚙️ Preview Config"** button:

- Opens new window with formatted JSON
- Shows exactly what will be applied
- No changes made yet

#### 3. Apply Optimizations

Click the **"✨ Apply Optimizations"** button:

- Confirmation dialog appears
- Creates automatic backup
- Applies new configuration
- Success notification shown
- Dashboard refreshes automatically

#### 4. Export Report

Click the **"📄 Export Report"** button:

- Downloads markdown report
- Includes all analysis data
- Filename: `smartmeter-report-YYYY-MM-DD.md`

### API Endpoints (Advanced)

The dashboard uses these API endpoints:

```bash
# Get current status
GET http://localhost:3001/api/status

# Preview config changes
GET http://localhost:3001/api/preview

# Apply optimizations
POST http://localhost:3001/api/apply
Content-Type: application/json
{ "confirm": true }

# Evaluate configuration
GET http://localhost:3001/api/evaluate

# Export report
GET http://localhost:3001/api/export
```

You can call these manually with `curl`:

```bash
# Preview changes
curl http://localhost:3001/api/preview

# Apply (requires confirmation)
curl -X POST http://localhost:3001/api/apply \
  -H "Content-Type: application/json" \
  -d '{"confirm": true}'
```

---

## What Gets Changed

When you apply optimizations, SmartMeter modifies your `~/.openclaw/openclaw.json`:

### 1. Primary Model

```json
{
  "agents": {
    "defaults": {
      "model": {
        "primary": "deepseek/deepseek-chat" // Changed from expensive model
      }
    }
  }
}
```

### 2. Specialized Agents

```json
{
  "agents": {
    "code-reviewer": {
      "model": {
        "primary": "deepseek/deepseek-chat"
      },
      "skills": ["code-analysis", "code-review"]
    }
  }
}
```

### 3. Budget Controls

```json
{
  "agents": {
    "defaults": {
      "budget": {
        "daily": 2.4,
        "weekly": 16.8,
        "alert": {
          "telegram": true,
          "threshold": 0.75
        }
      }
    }
  }
}
```

### 4. Fallback Chain

```json
{
  "agents": {
    "defaults": {
      "model": {
        "fallback": ["anthropic/claude-sonnet-4.5", "anthropic/claude-opus-4.5"]
      }
    }
  }
}
```

### 5. Cache Settings

```json
{
  "models": {
    "deepseek/deepseek-chat": {
      "params": {
        "cacheRetention": "long"
      }
    }
  }
}
```

---

## Safety Features

### Automatic Backups

Every `smartmeter apply` creates a timestamped backup:

```
~/.openclaw/openclaw.json.backup-2026-02-11T12-30-45-123Z
```

### Validation

Before applying, SmartMeter validates:

- ✓ JSON syntax is valid
- ✓ Required fields present
- ✓ Model names are recognized
- ✓ Budget values are positive
- ✓ Agent references resolve

If validation fails, **no changes are made**.

### Easy Rollback

```bash
# Restore latest backup
smartmeter rollback

# Manual restore
cp ~/.openclaw/openclaw.json.backup-2026-02-11T12-30-45-123Z \
   ~/.openclaw/openclaw.json
```

---

## Troubleshooting

### Dashboard buttons show "coming soon"

**Problem:** API server not running

**Solution:**

```bash
# Use 'serve' instead of 'dashboard'
smartmeter serve
```

### "No session data found"

**Problem:** No OpenClaw logs to analyze

**Solution:**

- Run OpenClaw agents to generate logs
- Check `~/.openclaw/agents/*/sessions/*.jsonl` exists
- Use `--data-dir` to point to correct location

### "API server connection failed"

**Problem:** API server on port 3001 not accessible

**Solution:**

```bash
# Check if port is in use
lsof -i :3001

# Change API port if needed
smartmeter serve --api-port 3002
```

### Changes don't take effect

**Problem:** OpenClaw needs to reload config

**Solution:**

- Restart OpenClaw after applying changes
- Or use OpenClaw's config reload command

---

## Best Practices

### 1. Analyze Regularly

```bash
# Weekly analysis
smartmeter analyze && smartmeter evaluate
```

### 2. Review Before Applying

```bash
# Always preview first
smartmeter preview

# Then apply
smartmeter apply
```

### 3. Monitor Results

```bash
# Check status after 1 week
smartmeter status

# Compare costs
smartmeter report
```

### 4. Iterative Optimization

1. Apply initial optimization
2. Run for 1-2 weeks
3. Analyze again with new data
4. Apply refined optimization
5. Repeat until confidence is "high"

---

## Next Steps

After applying optimizations:

1. **Monitor costs** - Check if savings match projections
2. **Collect more data** - Run for 14+ days for high confidence
3. **Re-evaluate** - Run `smartmeter evaluate` periodically
4. **Fine-tune** - Adjust specialized agents as needed

## Support

- 📖 Full documentation: [README.md](../README.md)
- 🐛 Report issues: [GitHub Issues](https://github.com/vajih/openclaw-smartmeter/issues)
- 💬 Discussions: [GitHub Discussions](https://github.com/vajih/openclaw-smartmeter/discussions)
