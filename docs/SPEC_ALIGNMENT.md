# SPEC Alignment: Phase 1-3

Maps each SPEC requirement to the file, function, and test that implements it.
Items marked STUB are placeholders awaiting upstream data (e.g. skill log format).
Items marked BACKLOG are deferred — see [backlog.md](./backlog.md).

---

## Phase 1: Analysis Engine (SPEC lines 9-155)

### Analysis Output Format (lines 77-155)

| SPEC Field | Status | Impl | Test |
|---|---|---|---|
| `period.start/end/days/totalTasks` | DONE | `aggregator.js → computePeriod()` | `aggregator.test.js` "computes period" |
| `models.{m}.count` | DONE | `aggregator.js → aggregateModels()` | `aggregator.test.js` "per-model stats" |
| `models.{m}.tokens.input/output` | DONE | `aggregator.js → aggregateModels()` | `aggregator.test.js` "per-model stats" |
| `models.{m}.cost` | DONE | `aggregator.js → aggregateModels()` | `aggregator.test.js` "per-model stats" |
| `models.{m}.avgCostPerTask` | DONE | `aggregator.js → aggregateModels()` | `aggregator.test.js` "per-model stats" |
| `categories.{c}.count` | DONE | `aggregator.js → aggregateCategories()` | `aggregator.test.js` "per-category stats" |
| `categories.{c}.modelBreakdown.{m}.count` | DONE | `aggregator.js → aggregateCategories()` | `aggregator.test.js` "per-category stats" |
| `categories.{c}.modelBreakdown.{m}.successRate` | DONE | `aggregator.js → aggregateCategories()` — stubbed `null` | `aggregator.test.js` "successRate is null" |
| `categories.{c}.modelBreakdown.{m}.avgCost` | DONE | `aggregator.js → aggregateCategories()` | `aggregator.test.js` "per-category stats" |
| `categories.{c}.recommendation` | DONE | `recommender.js → recommend()` | `recommender.test.js` |
| `skills` | STUB | `aggregator.js → aggregateSkills()` — empty placeholder | `aggregator.test.js` "skills stub" |
| `temporal.hourly` | DONE | `aggregator.js → aggregateTemporal()` | `aggregator.test.js` "hourly/daily" |
| `temporal.daily` | DONE | `aggregator.js → aggregateTemporal()` | `aggregator.test.js` "hourly/daily" |
| `temporal.patterns` | DONE | `aggregator.js → detectPatterns()` | `aggregator.test.js` "burst/steady" |
| `caching.hitRate` | DONE | `aggregator.js → aggregateCaching()` | `aggregator.test.js` "cache hit rate" |
| `caching.avgCacheRead` | DONE | `aggregator.js → aggregateCaching()` | `aggregator.test.js` "cache hit rate" |
| `caching.estimatedCacheSavings` | DONE | `aggregator.js → aggregateCaching()` | `aggregator.test.js` "cache hit rate" |
| `caching.recommendation` | DONE | `recommender.js → recommend()` | `recommender.test.js` |
| `summary.currentMonthlyCost` | DONE | `aggregator.js → computeSummary()` | `aggregator.test.js` "summary totals" |
| `summary.optimizedMonthlyCost` | DONE | `recommender.js → recommend()` | `recommender.test.js` |
| `summary.potentialSavings` | DONE | `recommender.js → recommend()` | `recommender.test.js` |
| `summary.savingsPercentage` | DONE | `recommender.js → recommend()` | `recommender.test.js` |
| `summary.confidence` | DONE | `recommender.js → recommend()` | `recommender.test.js` |

### What to Analyze (lines 16-47)

| Requirement | Status | Impl |
|---|---|---|
| 1. Parse session logs (JSONL) | DONE | `parser.js → parseSessionFile()` |
| 1. Extract model, usage, cost, timestamp | DONE | `parser.js → parseLogEntry()` |
| 1. Aggregate by model, time, day | DONE | `aggregator.js` |
| 1. Calculate tokens/request, cost/request, cache hit rate | DONE | `aggregator.js` |
| 2. Extract user prompts + assistant responses | DONE | `parser.js → parseSessionFile()` (userPrompt pairing) |
| 2. Classify into code/write/research/config/other | DONE | `classifier.js → classifyTask()` |
| 2. Keyword matching | DONE | `classifier.js` |
| 2. Prompt length as feature | BACKLOG | see backlog.md |
| 2. Tool usage as feature | BACKLOG | see backlog.md |
| 3. Success rate by model per category | BACKLOG | Stubbed null; needs re-prompt timing analysis |
| 3. Average tokens consumed per category | DONE | `aggregator.js` — avgTokens in modelBreakdown |
| 3. Average cost per category | DONE | `aggregator.js` — avgCost in modelBreakdown |
| 3. User satisfaction signals | BACKLOG | see backlog.md |
| 4. Skill parsing + frequency | STUB | Awaiting skill log format |
| 4. Skill co-occurrence | BACKLOG | see backlog.md |
| 5. Hour-of-day distribution | DONE | `aggregator.js → aggregateTemporal()` |
| 5. Day-of-week patterns | DONE | `aggregator.js → aggregateTemporal()` |
| 5. Burst vs. steady detection | DONE | `aggregator.js → detectPatterns()` |

### Technical Requirements (lines 49-54)

| Requirement | Status | Impl |
|---|---|---|
| Node.js | DONE | — |
| Stream processing for large files | DONE | `parser.js` uses `readline` streams |
| Store analysis in `~/.openclaw/smartmeter/analysis.json` | DONE | `storage.js → writeAnalysis()` |
| Warn if < 2 weeks data | DONE | `parser.js → parseAllSessions()` |

### Tests (SPEC lines 445-448)

| Requirement | Status | File |
|---|---|---|
| Parser: Parse JSONL correctly | DONE | `tests/parser.test.js` (13 tests) |
| Analyzer: Classify tasks accurately | DONE | `tests/classifier.test.js` (11 tests) |
| Aggregator: Aggregate statistics | DONE | `tests/aggregator.test.js` (11 tests) |
| Recommender: Generate recommendations | DONE | `tests/recommender.test.js` (14 tests) |
| Storage: Read/write analysis JSON | DONE | `tests/storage.test.js` (3 tests) |

---

## Phase 2: Config Generator (SPEC lines 158-287)

| Requirement | Status | Impl |
|---|---|---|
| 1. Primary Model Optimization (lines 165-169) | DONE | `config-builder.js → optimizePrimary()` |
| 2. Specialized Agent Creation (lines 171-181) | DONE | `agent-creator.js → createAgents()` |
| 3. Skill Optimization (lines 183-187) | DONE (no-op) | `config-builder.js` — logic implemented, awaiting skill data |
| 4. Caching Configuration (lines 189-194) | DONE | `config-builder.js` — burst→long retention + heartbeat |
| 5. Budget Controls (lines 196-200) | DONE | `config-builder.js` — daily/weekly/alert |
| 6. Fallback Chain Optimization (lines 202-205) | DONE | `config-builder.js → buildFallbackChain()` |
| Deep merge with existing config (line 209) | DONE | `merger.js → deepMerge()` |
| Preserve user comments (line 210) | N/A | JSON has no comments; using `_smartmeter.comments` metadata |
| Add SmartMeter comments (line 211) | DONE | `config-builder.js` → `_smartmeter.comments` object |
| Validate JSON schema (line 212) | DONE | `validator.js → validate()` |
| Create backup (line 213) | DONE | `generateConfig()` returns `{ backup }` |

Tests: `tests/generator.test.js` (24 tests)

## Phase 3: CLI Interface (SPEC lines 289-322)

| Command | Status | Impl | Test |
|---|---|---|---|
| `smartmeter analyze` | DONE | `commands.js → cmdAnalyze()` | `cli.test.js` "cmdAnalyze runs pipeline" |
| `smartmeter show` | DONE | `commands.js → cmdShow()` | `cli.test.js` "cmdShow outputs valid JSON" |
| `smartmeter preview` | DONE | `commands.js → cmdPreview()` | (covered by formatPreview tests) |
| `smartmeter apply` | DONE | `commands.js → cmdApply()` | `cli.test.js` "cmdApply writes config and backup" |
| `smartmeter rollback` | DONE | `commands.js → cmdRollback()` | `cli.test.js` "cmdRollback restores from backup" |
| `smartmeter status` | DONE | `commands.js → cmdStatus()` | `cli.test.js` "cmdStatus reads stored analysis" |
| `smartmeter report` | DONE | `commands.js → cmdReport()` | `cli.test.js` "cmdReport shows detailed output" |
| Formatting helpers | DONE | `utils.js` | `cli.test.js` (7 util tests) |
| commander.js CLI entry | DONE | `index.js` | — |

Tests: `tests/cli.test.js` (16 tests)

Deferred CLI commands: see [backlog.md](./backlog.md)

---

## File Inventory

| SPEC Path | Status | Actual Path |
|---|---|---|
| `src/analyzer/parser.js` | DONE | `src/analyzer/parser.js` |
| `src/analyzer/classifier.js` | DONE | `src/analyzer/classifier.js` |
| `src/analyzer/aggregator.js` | DONE | `src/analyzer/aggregator.js` |
| `src/analyzer/recommender.js` | DONE | `src/analyzer/recommender.js` |
| `src/analyzer/storage.js` | DONE | `src/analyzer/storage.js` (SPEC line 53) |
| `src/generator/config-builder.js` | DONE | `src/generator/config-builder.js` |
| `src/generator/agent-creator.js` | DONE | `src/generator/agent-creator.js` |
| `src/generator/merger.js` | DONE | `src/generator/merger.js` |
| `src/generator/validator.js` | DONE | `src/generator/validator.js` |
| `tests/generator.test.js` | DONE | `tests/generator.test.js` |
| `src/cli/index.js` | DONE | `src/cli/index.js` |
| `src/cli/commands.js` | DONE | `src/cli/commands.js` |
| `src/cli/utils.js` | DONE | `src/cli/utils.js` |
| `tests/cli.test.js` | DONE | `tests/cli.test.js` |
| `tests/parser.test.js` | DONE | `tests/parser.test.js` |
| `tests/classifier.test.js` | DONE | `tests/classifier.test.js` |
| `tests/aggregator.test.js` | DONE | `tests/aggregator.test.js` |
| `tests/recommender.test.js` | DONE | `tests/recommender.test.js` |
| `tests/storage.test.js` | DONE | `tests/storage.test.js` |
