# Canvas Dashboard Integration Tasks

**Status**: Pending  
**Date**: 2026-02-06  
**Context**: Integrating live-updating Canvas Dashboard with existing SmartMeter CLI

## Prerequisites
- ✅ Canvas template files downloaded to `canvas-template/`
- ✅ Existing SmartMeter CLI working (analyze, preview, apply commands)
- ✅ All tests passing

---

## Task List

### TASK 1: Create Canvas Deployer Module
**File**: `src/canvas/deployer.js`

Create a module that handles dashboard deployment to OpenClaw canvas:

**Requirements**:
- Deploy canvas files (index.html, app.js, styles.css) to `~/.openclaw/canvas/smartmeter/`
- Generate `analysis.public.json` from full `analysis.json` (sanitized, no sensitive data)
- Provide method to get canvas URL: `http://localhost:PORT/__openclaw__/canvas/smartmeter/`
- Provide method to open dashboard in browser using 'open' package

**Key Methods**:
```javascript
class CanvasDeployer {
  async deploy()                           // Copy template files to canvas dir
  async generatePublicAnalysis(path)       // Create sanitized public JSON
  getCanvasUrl(port)                       // Return canvas URL string
  async openDashboard(port)                // Open browser to dashboard
}
```

**Sanitization Rules** (for analysis.public.json):
- ✅ Include: stats, costs, model breakdown, recommendations
- ❌ Exclude: API keys, full file paths, session details

---

### TASK 2: Add Dashboard CLI Command
**Files**: `src/cli/commands.js`, `src/cli/index.js`

Add new `dashboard` command to CLI:

**Command Behavior**:
1. Deploy canvas files using CanvasDeployer
2. Check if `analysis.json` exists
   - If yes: Generate `analysis.public.json`
   - If no: Show warning, use sample data
3. Open browser to canvas URL (unless --no-open)
4. Display helpful output with URLs and next steps

**Options**:
- `--port <number>` - OpenClaw gateway port (default: 8080)
- `--no-open` - Don't open browser automatically

**Command Registration**:
```javascript
program
  .command('dashboard')
  .description('Deploy and open the SmartMeter web dashboard')
  .option('-p, --port <number>', 'OpenClaw gateway port', '8080')
  .option('--no-open', 'Do not open browser automatically')
  .action(dashboardCommand);
```

**Expected Output**:
```
╔════════════════════════════════════════════════════════╗
║          SmartMeter Dashboard Deployment              ║
╚════════════════════════════════════════════════════════╝

📦 Deploying SmartMeter Dashboard to OpenClaw Canvas...

✓ Canvas directory ready: ~/.openclaw/canvas/smartmeter
✓ Copied: index.html
✓ Copied: app.js
✓ Copied: styles.css

✅ Dashboard deployed successfully!

📊 Generating public analysis data...
✓ Public analysis generated

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Dashboard ready!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📂 Location: ~/.openclaw/canvas/smartmeter
🌐 URL: http://localhost:8080/__openclaw__/canvas/smartmeter/

💡 The dashboard auto-refreshes every 5 seconds
💡 Run `smartmeter analyze` to update with real data

🌐 Opening dashboard in browser...
```

---

### TASK 3: Auto-Update Public Analysis
**File**: `src/analyzer/storage.js`

Modify Storage class to automatically update public analysis:

**Add Method**:
```javascript
async savePublicAnalysis(analysis) {
  const CanvasDeployer = require('../canvas/deployer');
  const deployer = new CanvasDeployer();
  
  // Check if canvas is deployed
  if (fs.existsSync(deployer.canvasDir)) {
    await deployer.generatePublicAnalysis(this.getAnalysisPath());
    console.log('✓ Dashboard data updated');
  }
}
```

**Integrate with Analyze Command**:
In `src/cli/commands.js`, after saving analysis:
```javascript
await storage.saveAnalysis(analysis);
await storage.savePublicAnalysis(analysis);  // NEW LINE
```

---

### TASK 4: Add Dependencies
**File**: `package.json`

Add new dependencies and scripts:

**Dependencies to Add**:
```json
{
  "dependencies": {
    "open": "^9.1.0",
    "fs-extra": "^11.2.0"
  }
}
```

**Scripts to Add**:
```json
{
  "scripts": {
    "dashboard": "node src/cli/index.js dashboard",
    "dashboard:preview": "python3 canvas-template/preview-server.py"
  }
}
```

**Run**: `npm install` after updating

---

### TASK 5: Organize Documentation
**Action**: Move docs to proper locations

**Moves**:
- `canvas-template/QUICK_START.md` → `docs/CANVAS_DASHBOARD.md`
- `canvas-template/BUILD_SUMMARY.md` → `docs/CANVAS_BUILD_NOTES.md`
- Keep `canvas-template/README.md` (template-specific)

---

### TASK 6: Update .gitignore
**File**: `.gitignore`

Ensure these patterns are present:
```
node_modules/
.DS_Store
*.log
.env
.openclaw/
```

---

### TASK 7: Testing & Validation

**Install Dependencies**:
```bash
npm install
```

**Run Existing Tests**:
```bash
npm test
```
All existing tests should still pass.

**Test Dashboard Command**:
```bash
node src/cli/index.js dashboard
```

**Expected Behavior**:
1. Files copied to `~/.openclaw/canvas/smartmeter/`
2. Browser opens to dashboard URL
3. Dashboard loads and shows sample data
4. Dashboard auto-refreshes every 5 seconds

**Manual Verification**:
- [ ] `~/.openclaw/canvas/smartmeter/index.html` exists
- [ ] `~/.openclaw/canvas/smartmeter/app.js` exists
- [ ] `~/.openclaw/canvas/smartmeter/styles.css` exists
- [ ] `~/.openclaw/canvas/smartmeter/analysis.public.json` exists
- [ ] Dashboard loads in browser
- [ ] No errors in browser console
- [ ] Charts render correctly

---

## Implementation Notes

**Code Style**:
- Follow existing patterns in the codebase
- Use async/await (not callbacks)
- Use Commander.js for CLI (already in use)
- Use fs-extra for file operations (better than fs)
- Use chalk for colored output (if available)

**Error Handling**:
- Wrap file operations in try/catch
- Show helpful error messages
- Exit with proper status codes

**Canvas URL Structure**:
The OpenClaw gateway serves canvas files at:
```
http://localhost:PORT/__openclaw__/canvas/SKILL_NAME/
```

For SmartMeter:
```
http://localhost:8080/__openclaw__/canvas/smartmeter/index.html
```

**File Paths**:
- Template source: `./canvas-template/`
- Deployment target: `~/.openclaw/canvas/smartmeter/`
- Analysis source: `~/.openclaw/smartmeter/analysis.json`
- Public analysis: `~/.openclaw/canvas/smartmeter/analysis.public.json`

---

## Success Criteria

When complete:
- ✅ New `dashboard` command works
- ✅ Browser opens to functional dashboard
- ✅ Dashboard shows charts and data
- ✅ All existing tests still pass
- ✅ No errors in console
- ✅ Files properly organized
- ✅ Documentation updated
- ✅ Ready for git commit

---

## Next Steps After Integration

1. Test with real OpenClaw data
2. Take screenshots for LinkedIn
3. Update main README.md with dashboard info
4. Git commit with descriptive message
5. Share with Vali for feedback