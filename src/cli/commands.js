import { readFile, writeFile, readdir, copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

import { parseAllSessions } from "../analyzer/parser.js";
import { classifyTasks } from "../analyzer/classifier.js";
import { aggregate } from "../analyzer/aggregator.js";
import { recommend } from "../analyzer/recommender.js";
import { writeAnalysis, readAnalysis } from "../analyzer/storage.js";
import { generateConfig } from "../generator/config-builder.js";
import { CanvasDeployer } from "../canvas/deployer.js";
import { startApiServer } from "../canvas/api-server.js";
import {
  formatSummary,
  formatReport,
  formatPreview,
} from "./utils.js";

const OPENCLAW_DIR = join(homedir(), ".openclaw");
const SMARTMETER_DIR = join(OPENCLAW_DIR, "smartmeter");
const CONFIG_PATH = join(OPENCLAW_DIR, "openclaw.json");

/**
 * Run the full analysis pipeline.
 * Returns the enriched analysis object.
 */
async function runPipeline(opts = {}) {
  const baseDir = opts.baseDir || join(OPENCLAW_DIR, "agents");
  const { tasks, warnings } = await parseAllSessions({ baseDir });

  for (const w of warnings) {
    console.error(`Warning: ${w}`);
  }

  if (tasks.length === 0) {
    return null;
  }

  const classified = classifyTasks(tasks);
  const aggregated = aggregate(classified);
  const analysis = recommend(aggregated);
  return analysis;
}

/**
 * Read the current openclaw.json, or {} if missing.
 */
async function readCurrentConfig(configPath = CONFIG_PATH) {
  try {
    const data = await readFile(configPath, "utf8");
    return JSON.parse(data);
  } catch {
    return {};
  }
}

// --- Command handlers ---

export async function cmdAnalyze(opts = {}) {
  const analysis = await runPipeline(opts);
  if (!analysis) {
    console.log("No session data found. Nothing to analyze.");
    return null;
  }

  const storageDir = opts.storageDir || SMARTMETER_DIR;
  await writeAnalysis(analysis, storageDir);

  console.log(formatSummary(analysis));
  console.log(`\nAnalysis saved to ${storageDir}/analysis.json`);

  // Auto-deploy dashboard and open in browser
  const shouldOpenDashboard = opts.noDashboard !== true;
  
  if (shouldOpenDashboard) {
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🚀 Launching SmartMeter Dashboard...");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    try {
      const deployer = new CanvasDeployer();
      
      // Deploy dashboard files
      await deployer.deploy();
      await deployer.generatePublicAnalysis(analysis);
      
      const port = opts.port || 8080;
      const apiPort = opts.apiPort || 3001;
      
      // Start API server in background
      console.log("✓ Starting API server...");
      const apiServer = await startApiServer({ port: apiPort });
      const actualApiPort = apiServer.server.address().port;
      
      // Start static file server in background (pass API port for injection)
      console.log("✓ Starting dashboard server...");
      const staticServer = await startStaticFileServer(deployer.canvasDir, port, { apiPort: actualApiPort });
      const actualPort = staticServer.port;
      
      const url = `http://localhost:${actualPort}`;
      
      console.log(`
✅ Dashboard is live!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🌐 Dashboard URL: ${url}
📡 API Server:    http://localhost:${actualApiPort}

💡 Features:
   • View cost savings and recommendations
   • Apply optimizations with one click
   • Export reports
   • Preview config changes

🔄 Dashboard updates automatically every 5 seconds

Opening in your browser...
`);

      // Open browser
      try {
        await deployer.openDashboard(actualPort);
        console.log("✓ Browser opened\n");
      } catch (err) {
        console.log(`⚠ Could not open browser automatically`);
        console.log(`  Please open manually: ${url}\n`);
      }

      console.log("💡 Tip: Press Ctrl+C to stop the servers");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

      // Keep process alive and handle shutdown
      const shutdownHandler = async () => {
        console.log("\n\n🛑 Shutting down servers...");
        try {
          await staticServer.stop();
          await apiServer.stop();
          console.log("✓ Servers stopped");
        } catch (err) {
          console.error("Error stopping servers:", err.message);
        }
        process.exit(0);
      };

      process.on("SIGINT", shutdownHandler);
      process.on("SIGTERM", shutdownHandler);

      // Keep process alive - wait indefinitely
      // This prevents the CLI from exiting and killing the servers
      await new Promise(() => {}); // Never resolves, keeps process alive
      
    } catch (err) {
      console.error(`\n❌ Could not start dashboard: ${err.message}\n`);
      console.log(`💡 Tips:`);
      console.log(`   • Make sure no other SmartMeter instances are running`);
      console.log(`   • Try specifying different ports: --port 8081 --api-port 3002`);
      console.log(`   • Check for processes using ports: lsof -i :${opts.port || 8080} -i :${opts.apiPort || 3001}`);
      console.log(`\nYou can still view your analysis by running:`);
      console.log(`  smartmeter status\n`);
      console.log(`\nOr start the dashboard manually:`);
      console.log(`  smartmeter serve\n`);
    }
  }

  return analysis;
}

export async function cmdShow(opts = {}) {
  const analysis = await runPipeline(opts);
  if (!analysis) {
    console.log("No session data found.");
    return null;
  }

  const currentConfig = await readCurrentConfig(opts.configPath);
  const { config } = generateConfig(analysis, currentConfig);
  console.log(JSON.stringify(config, null, 2));
  return config;
}

export async function cmdPreview(opts = {}) {
  const analysis = await runPipeline(opts);
  if (!analysis) {
    console.log("No session data found.");
    return null;
  }

  const currentConfig = await readCurrentConfig(opts.configPath);
  const { config } = generateConfig(analysis, currentConfig);
  console.log(formatPreview(config, currentConfig));
  return config;
}

export async function cmdApply(opts = {}) {
  const analysis = await runPipeline(opts);
  if (!analysis) {
    console.log("No session data found. Nothing to apply.");
    return null;
  }

  const configPath = opts.configPath || CONFIG_PATH;
  const currentConfig = await readCurrentConfig(configPath);
  const { config, validation } = generateConfig(analysis, currentConfig);

  if (!validation.valid) {
    console.error("Generated config failed validation:");
    for (const err of validation.errors) {
      console.error(`  - ${err}`);
    }
    return null;
  }

  // Backup existing config
  const backupDir = opts.backupDir || OPENCLAW_DIR;
  await mkdir(backupDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = join(backupDir, `openclaw.json.backup-${timestamp}`);

  if (Object.keys(currentConfig).length > 0) {
    await writeFile(backupPath, JSON.stringify(currentConfig, null, 2) + "\n");
    console.log(`Backup saved to ${backupPath}`);
  }

  // Write new config
  await mkdir(join(configPath, ".."), { recursive: true });
  await writeFile(configPath, JSON.stringify(config, null, 2) + "\n");
  console.log(`Config written to ${configPath}`);

  // Save analysis too
  const storageDir = opts.storageDir || SMARTMETER_DIR;
  await writeAnalysis(analysis, storageDir);

  console.log(formatPreview(config, currentConfig));
  return config;
}

export async function cmdRollback(opts = {}) {
  const backupDir = opts.backupDir || OPENCLAW_DIR;
  const configPath = opts.configPath || CONFIG_PATH;

  let entries;
  try {
    entries = await readdir(backupDir);
  } catch {
    console.log("No backup directory found.");
    return null;
  }

  const backups = entries
    .filter((f) => f.startsWith("openclaw.json.backup-"))
    .sort()
    .reverse();

  if (backups.length === 0) {
    console.log("No backups found. Nothing to rollback.");
    return null;
  }

  const latest = join(backupDir, backups[0]);
  await copyFile(latest, configPath);
  console.log(`Rolled back to ${backups[0]}`);
  return latest;
}

export async function cmdStatus(opts = {}) {
  const storageDir = opts.storageDir || SMARTMETER_DIR;
  const analysis = await readAnalysis(storageDir);

  if (!analysis) {
    console.log("No analysis found. Run `smartmeter analyze` first.");
    return null;
  }

  console.log(formatSummary(analysis));
  return analysis;
}

export async function cmdReport(opts = {}) {
  const storageDir = opts.storageDir || SMARTMETER_DIR;
  const analysis = await readAnalysis(storageDir);

  if (!analysis) {
    console.log("No analysis found. Run `smartmeter analyze` first.");
    return null;
  }

  console.log(formatReport(analysis));
  return analysis;
}

export async function cmdDashboard(opts = {}) {
  const port = opts.port || 8080;
  const shouldOpen = opts.open !== false;
  const storageDir = opts.storageDir || SMARTMETER_DIR;
  const deployer = new CanvasDeployer(opts.canvasOpts);

  console.log(`
╔════════════════════════════════════════════════════════╗
║          SmartMeter Dashboard Deployment              ║
╚════════════════════════════════════════════════════════╝

📦 Deploying SmartMeter Dashboard to OpenClaw Canvas...`);

  try {
    const copied = await deployer.deploy();
    console.log(`\n✓ Canvas directory ready: ${deployer.canvasDir}`);
    for (const file of copied) {
      console.log(`✓ Copied: ${file}`);
    }
    console.log("\n✅ Dashboard deployed successfully!");
  } catch (err) {
    console.error(`\nFailed to deploy dashboard: ${err.message}`);
    return null;
  }

  // Generate public analysis
  console.log("\n📊 Generating public analysis data...");
  const analysis = await readAnalysis(storageDir);

  if (analysis) {
    try {
      await deployer.generatePublicAnalysis(analysis);
      console.log("✓ Public analysis generated");
    } catch (err) {
      console.error(`Warning: Could not generate public analysis: ${err.message}`);
    }
  } else {
    console.log("⚠ No analysis data found. Dashboard will use sample data.");
    console.log("  Run `smartmeter analyze` first to populate with real data.");
  }

  const url = deployer.getCanvasUrl(port);
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Dashboard ready!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📂 Location: ${deployer.canvasDir}
🌐 URL: ${url}

💡 The dashboard auto-refreshes every 5 seconds
💡 Run \`smartmeter analyze\` to update with real data`);

  if (shouldOpen) {
    console.log("\n🌐 Opening dashboard in browser...");
    try {
      await deployer.openDashboard(port);
    } catch (err) {
      console.error(`Could not open browser: ${err.message}`);
      console.log(`  Open manually: ${url}`);
    }
  }

  return { url, canvasDir: deployer.canvasDir };
}

export async function cmdEvaluate(opts = {}) {
  const analysis = await runPipeline(opts);
  if (!analysis) {
    console.log("No session data found. Nothing to evaluate.");
    return null;
  }

  const s = analysis.summary;
  const savings = s.potentialSavings || 0;
  const savingsPercent = s.savingsPercentage || 0;

  console.log(`
╔════════════════════════════════════════════════════════╗
║          SmartMeter Configuration Evaluation          ║
╚════════════════════════════════════════════════════════╝

📊 Current Analysis:
   Period: ${analysis.period.days} days (${analysis.period.start} to ${analysis.period.end})
   Tasks Analyzed: ${analysis.period.totalTasks}
   Confidence: ${s.confidence || 'unknown'}

💰 Cost Analysis:
   Current Monthly Cost:   $${s.currentMonthlyCost.toFixed(2)}
   Optimized Monthly Cost: $${s.optimizedMonthlyCost.toFixed(2)}
   Potential Savings:      $${savings.toFixed(2)}/month (${savingsPercent.toFixed(1)}%)

🎯 Recommendations (${analysis.recommendations.length} total):
${analysis.recommendations
  .slice(0, 3)
  .map((rec, i) => `   ${i + 1}. ${rec.title} - ${rec.impact}`)
  .join("\n")}

${analysis.recommendations.length > 3 ? `   ... and ${analysis.recommendations.length - 3} more\n` : ""}
⚡ Cache Performance:
   Hit Rate: ${((analysis.caching?.hitRate || 0) * 100).toFixed(1)}%
   Cache Savings: $${(analysis.caching?.estimatedCacheSavings || 0).toFixed(2)}

💡 Next Steps:
   • Run 'smartmeter preview' to see config changes
   • Run 'smartmeter apply' to implement optimizations
   • Run 'smartmeter guide' for detailed optimization advice
`);

  return analysis;
}

export async function cmdGuide(opts = {}) {
  const analysis = await runPipeline(opts);
  if (!analysis) {
    console.log("No session data found. Nothing to guide.");
    return null;
  }

  const currentConfig = await readCurrentConfig(opts.configPath);
  const { config } = generateConfig(analysis, currentConfig);

  console.log(`
╔════════════════════════════════════════════════════════╗
║          SmartMeter Optimization Guide                ║
╚════════════════════════════════════════════════════════╝

This guide will help you understand and apply the recommended optimizations.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 📊 Your Current Situation

You're spending approximately **$${analysis.summary.currentMonthlyCost.toFixed(2)}/month** 
on AI model costs based on ${analysis.period.days} days of analysis.

The analysis found **${analysis.period.totalTasks} tasks** across these categories:
${Object.entries(analysis.categories || {})
  .map(([name, c]) => `  • ${name}: ${c.count} tasks`)
  .join("\n")}

**Confidence Level:** ${analysis.summary.confidence || 'unknown'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 💰 Optimization Opportunities

SmartMeter identified **$${analysis.summary.potentialSavings.toFixed(2)}/month** 
in potential savings (${analysis.summary.savingsPercentage.toFixed(1)}%).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 🎯 Recommended Actions

${analysis.recommendations
  .map(
    (rec, i) => `
### ${i + 1}. ${rec.title}

**Impact:** ${rec.impact}

${rec.description}

${rec.details ? rec.details.map((d) => `  • ${d}`).join("\n") : ""}
`,
  )
  .join("\n")}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 🚀 How to Apply

### Option 1: Review First (Recommended for first-time users)

1. **Preview the changes:**
   \`\`\`bash
   smartmeter preview
   \`\`\`

2. **Review the proposed configuration carefully**

3. **Apply when ready:**
   \`\`\`bash
   smartmeter apply
   \`\`\`

### Option 2: Apply Directly

If you trust the analysis:
\`\`\`bash
smartmeter apply
\`\`\`

A backup will be automatically created at:
~/.openclaw/openclaw.json.backup-<timestamp>

### Option 3: Use Dashboard

1. **Start the dashboard:**
   \`\`\`bash
   smartmeter serve
   \`\`\`

2. **Open http://localhost:8080 in your browser**

3. **Click "Apply Optimizations" button**

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## ⚙️ Key Configuration Changes

${Object.keys(config._smartmeter?.comments || {}).length > 0 ? Object.entries(config._smartmeter.comments)
  .map(([key, comment]) => `  • ${key}: ${comment}`)
  .join("\n") : "No major changes required."}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 📈 Expected Results

After applying these optimizations:

✓ Monthly cost reduced to ~$${analysis.summary.optimizedMonthlyCost.toFixed(2)}
✓ Simple tasks routed to cheaper models
✓ Complex tasks still use premium models
✓ Budget controls to prevent overruns
✓ Cache optimization for repeated work

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 🔄 Rollback

If you need to undo changes:
\`\`\`bash
smartmeter rollback
\`\`\`

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## ❓ Need Help?

• Check the full report: \`smartmeter report\`
• View current status: \`smartmeter status\`
• Monitor costs: \`smartmeter dashboard\`

`);

  return { analysis, config };
}

/**
 * Compare two config versions or current vs optimized.
 */
export async function cmdDiff(opts = {}) {
  const configPath = opts.configPath || CONFIG_PATH;
  const backupDir = opts.backupDir || OPENCLAW_DIR;

  // Get current config
  const currentConfig = await readCurrentConfig(configPath);

  let compareConfig;
  let compareLabel;

  if (opts.version) {
    // Compare with specific backup version
    const backupPath = join(backupDir, opts.version);
    try {
      const data = await readFile(backupPath, "utf8");
      compareConfig = JSON.parse(data);
      compareLabel = opts.version;
    } catch {
      console.log(`Backup not found: ${opts.version}`);
      return null;
    }
  } else {
    // Compare current with optimized
    const analysis = await runPipeline(opts);
    if (!analysis) {
      console.log("No session data found.");
      return null;
    }
    const { config } = generateConfig(analysis, currentConfig);
    compareConfig = config;
    compareLabel = "optimized";
  }

  console.log(`\n╔════════════════════════════════════════════════════════╗`);
  console.log(`║          SmartMeter Config Diff                       ║`);
  console.log(`╚════════════════════════════════════════════════════════╝\n`);
  console.log(`Comparing: current ↔ ${compareLabel}\n`);

  const diffs = diffObjects(currentConfig, compareConfig);
  if (diffs.length === 0) {
    console.log("  No differences found.");
  } else {
    for (const d of diffs) {
      console.log(`  ${d.path}:`);
      console.log(`    - ${JSON.stringify(d.old)}`);
      console.log(`    + ${JSON.stringify(d.new)}\n`);
    }
  }

  return diffs;
}

/**
 * Show cost breakdown by model and category.
 */
export async function cmdCosts(opts = {}) {
  const storageDir = opts.storageDir || SMARTMETER_DIR;
  let analysis = await readAnalysis(storageDir);

  if (!analysis) {
    // Try running pipeline
    analysis = await runPipeline(opts);
    if (!analysis) {
      console.log("No analysis found. Run `smartmeter analyze` first.");
      return null;
    }
  }

  console.log(`\n╔════════════════════════════════════════════════════════╗`);
  console.log(`║          SmartMeter Cost Breakdown                    ║`);
  console.log(`╚════════════════════════════════════════════════════════╝`);

  console.log(`\n📊 By Model:\n`);
  const models = Object.entries(analysis.models || {});
  models.sort((a, b) => b[1].cost - a[1].cost);
  for (const [name, m] of models) {
    const pct = analysis.summary.totalCost > 0
      ? ((m.cost / analysis.summary.totalCost) * 100).toFixed(1)
      : "0.0";
    console.log(`  ${name}`);
    console.log(`    Tasks: ${m.count}  |  Cost: $${m.cost.toFixed(2)}  |  Avg: $${m.avgCostPerTask.toFixed(4)}/task  |  Share: ${pct}%`);
  }

  console.log(`\n📂 By Category:\n`);
  const cats = Object.entries(analysis.categories || {});
  for (const [name, c] of cats) {
    let catCost = 0;
    for (const mb of Object.values(c.modelBreakdown)) {
      catCost += mb.totalCost || 0;
    }
    console.log(`  ${name}: ${c.count} tasks, $${catCost.toFixed(2)} total`);
    for (const [model, mb] of Object.entries(c.modelBreakdown)) {
      console.log(`    └─ ${model}: ${mb.count} tasks, $${mb.avgCost.toFixed(4)}/task`);
    }
  }

  console.log(`\n💰 Summary:`);
  console.log(`  Total cost:    $${analysis.summary.totalCost.toFixed(2)}`);
  console.log(`  Monthly proj:  $${analysis.summary.currentMonthlyCost.toFixed(2)}`);
  console.log(`  Cache savings: $${(analysis.caching?.estimatedCacheSavings || 0).toFixed(2)}\n`);

  return analysis;
}

/**
 * Get or set SmartMeter configuration values.
 */
export async function cmdConfig(opts = {}) {
  const { getConfig, saveConfig } = await import("../analyzer/config-manager.js");
  const config = await getConfig();

  if (opts.key && opts.value !== undefined) {
    // Set mode
    config[opts.key] = opts.value;
    config.lastUpdated = new Date().toISOString();
    await saveConfig(config);
    console.log(`✓ Set ${opts.key} = ${opts.value}`);
    return config;
  }

  if (opts.key) {
    // Get specific key
    const val = config[opts.key];
    if (val !== undefined) {
      console.log(`${opts.key} = ${JSON.stringify(val)}`);
    } else {
      console.log(`Key '${opts.key}' not set.`);
    }
    return val;
  }

  // Show all config
  console.log(`\n╔════════════════════════════════════════════════════════╗`);
  console.log(`║          SmartMeter Configuration                     ║`);
  console.log(`╚════════════════════════════════════════════════════════╝\n`);
  
  for (const [key, value] of Object.entries(config)) {
    if (key === "openRouterApiKey" && value) {
      console.log(`  ${key} = ${value.substring(0, 9)}...${value.substring(value.length - 4)}`);
    } else {
      console.log(`  ${key} = ${JSON.stringify(value)}`);
    }
  }
  console.log();

  return config;
}

/**
 * Show config backup/version history.
 */
export async function cmdHistory(opts = {}) {
  const backupDir = opts.backupDir || OPENCLAW_DIR;

  let entries;
  try {
    entries = await readdir(backupDir);
  } catch {
    console.log("No backup directory found.");
    return [];
  }

  const backups = entries
    .filter((f) => f.startsWith("openclaw.json.backup-"))
    .sort()
    .reverse();

  console.log(`\n╔════════════════════════════════════════════════════════╗`);
  console.log(`║          SmartMeter Config History                    ║`);
  console.log(`╚════════════════════════════════════════════════════════╝\n`);

  if (backups.length === 0) {
    console.log("  No config backups found. Backups are created when you run `smartmeter apply`.\n");
    return [];
  }

  console.log(`  Found ${backups.length} backup(s):\n`);
  for (let i = 0; i < backups.length; i++) {
    const ts = backups[i].replace("openclaw.json.backup-", "").replace(/-/g, function(m, offset) {
      // First 10 chars are date, rest is time
      return offset < 10 ? "-" : ":";
    });
    const label = i === 0 ? " (latest)" : "";
    console.log(`  ${i + 1}. ${backups[i]}${label}`);
  }

  console.log(`\n💡 To rollback to the latest: smartmeter rollback`);
  console.log(`💡 To compare with a backup: smartmeter diff --version <backup-filename>\n`);

  return backups;
}

/**
 * Simple deep diff between two objects. Returns array of { path, old, new }.
 */
function diffObjects(obj1, obj2, prefix = "") {
  const diffs = [];
  const allKeys = new Set([...Object.keys(obj1 || {}), ...Object.keys(obj2 || {})]);

  for (const key of allKeys) {
    if (key === "_smartmeter") continue; // Skip metadata
    const path = prefix ? `${prefix}.${key}` : key;
    const v1 = (obj1 || {})[key];
    const v2 = (obj2 || {})[key];

    if (typeof v1 === "object" && typeof v2 === "object" && v1 !== null && v2 !== null && !Array.isArray(v1) && !Array.isArray(v2)) {
      diffs.push(...diffObjects(v1, v2, path));
    } else if (JSON.stringify(v1) !== JSON.stringify(v2)) {
      diffs.push({ path, old: v1, new: v2 });
    }
  }

  return diffs;
}

export async function cmdServe(opts = {}) {
  const port = opts.port || 8080;
  const apiPort = opts.apiPort || 3001;
  const shouldOpen = opts.open !== false;
  const storageDir = opts.storageDir || SMARTMETER_DIR;

  console.log(`
╔════════════════════════════════════════════════════════╗
║          SmartMeter Complete Server                   ║
╚════════════════════════════════════════════════════════╝
`);

  // Deploy dashboard first
  const deployer = new CanvasDeployer(opts.canvasOpts);
  
  try {
    await deployer.deploy();
    console.log(`✓ Dashboard deployed to ${deployer.canvasDir}`);
  } catch (err) {
    console.error(`Failed to deploy dashboard: ${err.message}`);
    return null;
  }

  // Generate public analysis if available
  const analysis = await readAnalysis(storageDir);
  if (analysis) {
    await deployer.generatePublicAnalysis(analysis);
    console.log("✓ Analysis data updated");
  } else {
    console.log("⚠ No analysis data. Run 'smartmeter analyze' first.");
  }

  try {
    // Start API server
    console.log("\n🚀 Starting API server...");
    const apiServer = await startApiServer({ port: apiPort });
    const actualApiPort = apiServer.server.address().port;

    // Start static file server (using Node.js)
    console.log(`\n🚀 Starting dashboard server on port ${port}...`);
    const staticServer = await startStaticFileServer(deployer.canvasDir, port);
    const actualPort = staticServer.port;

    const url = `http://localhost:${actualPort}`;
    console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ SmartMeter is ready!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🌐 Dashboard:  ${url}
📡 API Server: http://localhost:${actualApiPort}

💡 Features enabled:
   • Live dashboard updates (auto-refresh every 5s)
   • Apply optimizations via UI
   • Export reports
   • Preview config changes

Press Ctrl+C to stop all servers
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

    if (shouldOpen) {
      console.log("🌐 Opening dashboard in browser...");
      try {
        await deployer.openDashboard(actualPort);
      } catch (err) {
        console.log(`  Open manually: ${url}`);
      }
    }

    // Handle shutdown
    process.on("SIGINT", async () => {
      console.log("\n\n🛑 Shutting down servers...");
      await staticServer.stop();
      await apiServer.stop();
      console.log("✓ Servers stopped");
      process.exit(0);
    });

    return { url, apiPort: actualApiPort, deployer, apiServer, staticServer };
  } catch (err) {
    console.error(`\n❌ Failed to start servers: ${err.message}\n`);
    console.log(`💡 Tips:`);
    console.log(`   • Make sure no other SmartMeter instances are running`);
    console.log(`   • Try specifying different ports: --port 8081 --api-port 3002`);
    console.log(`   • Check for processes using these ports: lsof -i :${port} -i :${apiPort}\n`);
    return null;
  }
}

/**
 * Start a simple static file server
 */
/**
 * Check if a port is available
 * @param {number} port - Port to check
 * @returns {Promise<boolean>} - True if port is available
 */
async function isPortAvailable(port) {
  const { createServer } = await import("node:http");
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', (err) => {
      resolve(false);
    });
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port);
  });
}

/**
 * Find an available port in a range
 * @param {number} startPort - Starting port number
 * @param {number} maxAttempts - Maximum number of ports to try (default: 10)
 * @returns {Promise<number|null>} - Available port or null if none found
 */
async function findAvailablePort(startPort, maxAttempts = 10) {
  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i;
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  return null;
}

async function startStaticFileServer(directory, port, options = {}) {
  const { createServer } = await import("node:http");
  const { readFile, stat } = await import("node:fs/promises");
  const { join, extname } = await import("node:path");
  const { userInfo } = await import("node:os");

  const apiPort = options.apiPort || 3001;
  const osUser = (() => { try { return userInfo().username; } catch { return ''; } })();
  const portScript = `<script>window.__SMARTMETER_API_PORT=${apiPort};window.__SMARTMETER_USER=${JSON.stringify(osUser)};</script>`;

  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
  };

  const server = createServer(async (req, res) => {
    try {
      // Parse URL and handle root
      let filePath = req.url === '/' ? '/index.html' : req.url;
      filePath = join(directory, filePath);

      // Check if file exists
      const stats = await stat(filePath);
      
      if (stats.isDirectory()) {
        filePath = join(filePath, 'index.html');
      }

      // Read and serve file
      let content = await readFile(filePath);
      const ext = extname(filePath);
      const mimeType = mimeTypes[ext] || 'application/octet-stream';

      // Inject API port and OS username into index.html so dashboard connects
      // to the correct API server and scopes localStorage per user
      if (ext === '.html') {
        let html = content.toString('utf-8');
        html = html.replace('</head>', `${portScript}\n</head>`);
        res.writeHead(200, { 'Content-Type': mimeType });
        res.end(html);
        return;
      }

      res.writeHead(200, { 'Content-Type': mimeType });
      res.end(content);
    } catch (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
    }
  });

  // Try to start on the requested port, or find an alternative
  const requestedPort = port;
  
  return new Promise(async (resolve, reject) => {
    // First try the requested port
    server.once('error', async (err) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`⚠ Port ${requestedPort} is already in use, finding alternative...`);
        
        // Find an available port
        const availablePort = await findAvailablePort(requestedPort + 1, 10);
        
        if (availablePort) {
          console.log(`✓ Using port ${availablePort} instead`);
          server.listen(availablePort, (err) => {
            if (err) {
              reject(err);
            } else {
              resolve({
                server,
                port: availablePort,
                stop: () => new Promise((res) => server.close(() => res())),
              });
            }
          });
        } else {
          reject(new Error(`Unable to find available port. Tried ports ${requestedPort}-${requestedPort + 10}. Please close other SmartMeter instances or specify a different port with --port.`));
        }
      } else {
        reject(err);
      }
    });
    
    server.listen(requestedPort, (err) => {
      if (err && err.code !== 'EADDRINUSE') {
        reject(err);
      } else if (!err) {
        resolve({
          server,
          port: requestedPort,
          stop: () => new Promise((res) => server.close(() => res())),
        });
      }
      // EADDRINUSE is handled by the error listener above
    });
  });
}
