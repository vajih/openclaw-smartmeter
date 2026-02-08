# Contributing to SmartMeter

Thank you for your interest in contributing to SmartMeter. This guide will help you get started.

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+
- Git

### Setup

```bash
git clone https://github.com/vajih/openclaw-smartmeter.git
cd openclaw-smartmeter
npm install
npm test
```

All 93+ tests should pass before you begin making changes.

## Development Workflow

### 1. Create a Branch

```bash
git checkout -b feature/your-feature-name
```

Use descriptive branch names:
- `feature/` for new features
- `fix/` for bug fixes
- `docs/` for documentation changes
- `refactor/` for code restructuring

### 2. Make Changes

Follow existing code patterns:
- **ESM modules** (`import`/`export`, not `require`)
- **Async/await** for all asynchronous operations
- **Node.js built-in test runner** (`node:test` and `node:assert/strict`)
- **No unnecessary dependencies** - prefer Node.js built-ins where possible

### 3. Write Tests

Every new feature or bug fix should include tests:

```javascript
import test from "node:test";
import assert from "node:assert/strict";

test("descriptive test name", async () => {
  // Arrange
  // Act
  // Assert
});
```

Run tests with:
```bash
npm test                          # All tests
node --test tests/parser.test.js  # Single file
```

### 4. Submit a Pull Request

- Ensure all tests pass
- Write a clear PR description explaining the change
- Reference any related issues

## Project Structure

```
src/
  analyzer/         # Phase 1: Analysis engine
    parser.js       #   JSONL session parser
    classifier.js   #   Task classification
    aggregator.js   #   Statistics aggregation
    recommender.js  #   Optimization recommendations
    storage.js      #   Analysis persistence
  generator/        # Phase 2: Config generator
    config-builder.js
    agent-creator.js
    merger.js
    validator.js
  canvas/           # Canvas dashboard
    deployer.js     #   Dashboard deployment
  cli/              # Phase 3: CLI interface
    index.js        #   Commander.js entry point
    commands.js     #   Command handlers
    utils.js        #   Formatting helpers
tests/              # Test files (mirror src/ structure)
canvas-template/    # Dashboard HTML/JS/CSS templates
docs/               # Documentation
examples/           # Sample data files
```

## Code Style

- Use `const` by default, `let` when reassignment is needed
- Prefer early returns over deep nesting
- Keep functions small and focused
- No semicolons are fine, but be consistent within a file (this project uses semicolons)
- No comments for self-explanatory code; add JSDoc for public APIs

## Architecture Guidelines

### SPEC.md is the Source of Truth

All feature work should align with `SPEC.md`. Before adding new functionality:

1. Check `docs/SPEC_ALIGNMENT.md` to see what's implemented
2. Check `docs/backlog.md` for deferred items
3. If your feature isn't in the SPEC, open an issue to discuss it first

### Pipeline Pattern

The analysis pipeline flows in one direction:

```
parser -> classifier -> aggregator -> recommender -> storage
```

Each module receives data from the previous stage and returns a new object (no mutation). This makes testing and debugging straightforward.

### Testability

Command handlers accept an `opts` parameter for dependency injection:

```javascript
// Production: uses default paths
await cmdAnalyze();

// Testing: uses temp directories
await cmdAnalyze({ baseDir: tmpDir, storageDir: tmpStorage });
```

## Reporting Issues

- Use GitHub Issues for bug reports and feature requests
- Include Node.js version, OS, and steps to reproduce
- For security issues, see [SECURITY.md](SECURITY.md)

## License

By contributing, you agree that your contributions will be licensed under the Apache License 2.0.
