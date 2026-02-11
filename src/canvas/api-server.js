import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  cmdAnalyze,
  cmdPreview,
  cmdApply,
  cmdStatus,
} from "../cli/commands.js";

/**
 * Simple API server for SmartMeter dashboard.
 * Provides REST endpoints for the web UI to interact with CLI functions.
 */
export class ApiServer {
  constructor(opts = {}) {
    this.port = opts.port || 3001;
    this.canvasDir = opts.canvasDir;
    this.server = null;
  }

  /**
   * Start the API server
   */
  async start() {
    this.server = createServer(async (req, res) => {
      // Enable CORS for local development
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS",
      );
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");

      if (req.method === "OPTIONS") {
        res.writeHead(200);
        res.end();
        return;
      }

      try {
        await this.handleRequest(req, res);
      } catch (error) {
        console.error("API error:", error);
        this.sendError(res, 500, error.message);
      }
    });

    return new Promise((resolve, reject) => {
      this.server.listen(this.port, (err) => {
        if (err) reject(err);
        else resolve(this.port);
      });
    });
  }

  /**
   * Stop the API server
   */
  async stop() {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => resolve());
      });
    }
  }

  /**
   * Route requests to appropriate handlers
   */
  async handleRequest(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname;

    // API endpoints
    if (path === "/api/status" && req.method === "GET") {
      await this.handleStatus(req, res);
    } else if (path === "/api/preview" && req.method === "GET") {
      await this.handlePreview(req, res);
    } else if (path === "/api/apply" && req.method === "POST") {
      await this.handleApply(req, res);
    } else if (path === "/api/evaluate" && req.method === "GET") {
      await this.handleEvaluate(req, res);
    } else if (path === "/api/export" && req.method === "GET") {
      await this.handleExport(req, res);
    } else {
      this.sendError(res, 404, "Not found");
    }
  }

  /**
   * GET /api/status - Get current optimization status
   */
  async handleStatus(req, res) {
    try {
      const analysis = await cmdStatus();
      if (!analysis) {
        this.sendError(res, 404, "No analysis found. Run analyze first.");
        return;
      }
      this.sendJson(res, {
        success: true,
        analysis,
      });
    } catch (error) {
      this.sendError(res, 500, error.message);
    }
  }

  /**
   * GET /api/preview - Preview config changes
   */
  async handlePreview(req, res) {
    try {
      const config = await cmdPreview();
      if (!config) {
        this.sendError(res, 404, "No session data found.");
        return;
      }
      this.sendJson(res, {
        success: true,
        config,
        message: "Preview generated successfully",
      });
    } catch (error) {
      this.sendError(res, 500, error.message);
    }
  }

  /**
   * POST /api/apply - Apply optimizations
   */
  async handleApply(req, res) {
    try {
      const body = await this.parseBody(req);
      const confirm = body?.confirm === true;

      if (!confirm) {
        this.sendError(res, 400, "Confirmation required to apply changes");
        return;
      }

      const config = await cmdApply();
      if (!config) {
        this.sendError(res, 404, "No session data found. Nothing to apply.");
        return;
      }

      this.sendJson(res, {
        success: true,
        config,
        message: "Optimizations applied successfully. Backup created.",
      });
    } catch (error) {
      this.sendError(res, 500, error.message);
    }
  }

  /**
   * GET /api/evaluate - Evaluate current configuration
   */
  async handleEvaluate(req, res) {
    try {
      const analysis = await cmdAnalyze();
      if (!analysis) {
        this.sendError(res, 404, "No session data found.");
        return;
      }

      const evaluation = {
        currentCost: analysis.summary.currentMonthlyCost,
        optimizedCost: analysis.summary.optimizedMonthlyCost,
        potentialSavings: analysis.summary.potentialSavings,
        savingsPercentage: analysis.summary.savingsPercentage,
        confidence: analysis.confidence,
        recommendations: analysis.recommendations,
        daysAnalyzed: analysis.period.days,
      };

      this.sendJson(res, {
        success: true,
        evaluation,
      });
    } catch (error) {
      this.sendError(res, 500, error.message);
    }
  }

  /**
   * GET /api/export - Export analysis report
   */
  async handleExport(req, res) {
    try {
      const analysis = await cmdStatus();
      if (!analysis) {
        this.sendError(res, 404, "No analysis found.");
        return;
      }

      // Generate markdown report
      const report = this.generateMarkdownReport(analysis);

      res.writeHead(200, {
        "Content-Type": "text/markdown",
        "Content-Disposition": 'attachment; filename="smartmeter-report.md"',
      });
      res.end(report);
    } catch (error) {
      this.sendError(res, 500, error.message);
    }
  }

  /**
   * Generate a markdown report from analysis
   */
  generateMarkdownReport(analysis) {
    const s = analysis.summary;
    const p = analysis.period;

    return `# SmartMeter Cost Analysis Report

**Generated:** ${new Date().toISOString()}
**Analysis Period:** ${p.start} to ${p.end} (${p.days} days)

## Summary

- **Current Monthly Cost:** $${s.currentMonthlyCost.toFixed(2)}
- **Optimized Monthly Cost:** $${s.optimizedMonthlyCost.toFixed(2)}
- **Potential Savings:** $${s.potentialSavings.toFixed(2)}/month (${s.savingsPercentage.toFixed(1)}%)
- **Confidence Level:** ${analysis.confidence.level}

## Model Breakdown

| Model | Tasks | Total Cost | Avg/Task |
|-------|-------|------------|----------|
${Object.entries(analysis.models)
  .map(
    ([name, m]) =>
      `| ${name} | ${m.count} | $${m.cost.toFixed(2)} | $${m.avgCostPerTask.toFixed(3)} |`,
  )
  .join("\n")}

## Cache Performance

- **Hit Rate:** ${((analysis.caching?.hitRate || 0) * 100).toFixed(1)}%
- **Estimated Cache Savings:** $${(analysis.caching?.estimatedCacheSavings || 0).toFixed(2)}

## Recommendations

${analysis.recommendations.map((rec, i) => `${i + 1}. **${rec.title}**\n   ${rec.description}`).join("\n\n")}

---
*Generated by SmartMeter - AI Token Cost Optimization for OpenClaw*
`;
  }

  /**
   * Parse JSON body from request
   */
  async parseBody(req) {
    return new Promise((resolve, reject) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (err) {
          reject(new Error("Invalid JSON"));
        }
      });
      req.on("error", reject);
    });
  }

  /**
   * Send JSON response
   */
  sendJson(res, data) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data, null, 2));
  }

  /**
   * Send error response
   */
  sendError(res, status, message) {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        success: false,
        error: message,
      }),
    );
  }
}

/**
 * Start the API server from CLI
 */
export async function startApiServer(opts = {}) {
  const server = new ApiServer(opts);
  const port = await server.start();

  console.log(`
╔════════════════════════════════════════════════════════╗
║          SmartMeter API Server Running                ║
╚════════════════════════════════════════════════════════╝

🚀 API Server: http://localhost:${port}

📡 Available Endpoints:
   GET  /api/status   - Current optimization status
   GET  /api/preview  - Preview config changes
   POST /api/apply    - Apply optimizations
   GET  /api/evaluate - Evaluate configuration
   GET  /api/export   - Export analysis report

Press Ctrl+C to stop
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

  return server;
}
