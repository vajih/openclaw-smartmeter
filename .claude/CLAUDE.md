# smartmeter-openclaw — Agent Operating Rules

## Golden rules

- Small commits. One goal per commit.
- Cost/routing changes must include tests.
- UI/report changes must not change cost math unless explicitly requested.

## Agents

### Agent 1 — Architecture & Optimization Core

Owns:

- routing logic
- cost calculation engine
- streaming performance optimizations
- configuration schema & validation

### Agent 2 — User Experience & Reporting

Owns:

- dashboard UI
- reports/visuals
- user-facing recommendations
- docs/examples

### Agent 3 — Quality & Integration

Owns:

- unit + integration tests
- OpenClaw integration
- benchmarks
- npm packaging validation

## Workflow

- Always work in a branch named agent/<area>
- After changes: npm test
- Then: git status, git diff, commit with a clear message
- Prefer small PR-sized changes
