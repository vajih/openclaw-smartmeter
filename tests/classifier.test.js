import test from "node:test";
import assert from "node:assert/strict";
import { classifyTask, classifyTasks } from "../src/analyzer/classifier.js";

function makeTask(overrides = {}) {
  return {
    model: "anthropic/claude-sonnet-4-5",
    content: "",
    userPrompt: null,
    usage: { input: 1000, output: 200, cacheRead: 0, cacheWrite: 0 },
    cost: 0.01,
    timestamp: Date.now(),
    sourceFile: "test.jsonl",
    ...overrides,
  };
}

// --- Code classification ---

test("classifies code tasks from assistant content", () => {
  const task = makeTask({
    content: "I found the bug in the function and fixed the error. Here is the refactored code.",
  });
  const result = classifyTask(task);
  assert.equal(result.category, "code");
  assert.ok(result.categoryScores.code > 0);
});

test("classifies code tasks from user prompt", () => {
  const task = makeTask({
    userPrompt: "Debug the authentication error in the login method",
    content: "Sure, let me look at that.",
  });
  const result = classifyTask(task);
  assert.equal(result.category, "code");
});

// --- Write classification ---

test("classifies write tasks", () => {
  const task = makeTask({
    userPrompt: "Write a blog article about our product",
    content: "Here is a draft article with a summary paragraph and outline for the content.",
  });
  const result = classifyTask(task);
  assert.equal(result.category, "write");
});

test("classifies documentation as write", () => {
  const task = makeTask({
    content: "Here is the documentation and a README guide with a template for the tutorial.",
  });
  const result = classifyTask(task);
  assert.equal(result.category, "write");
});

// --- Research classification ---

test("classifies research tasks", () => {
  const task = makeTask({
    userPrompt: "What is the best alternative? Compare and evaluate the options",
    content: "Let me research and analyze the benchmark results to recommend the best practice.",
  });
  const result = classifyTask(task);
  assert.equal(result.category, "research");
});

// --- Config classification ---

test("classifies config tasks", () => {
  const task = makeTask({
    userPrompt: "Setup Docker and configure the CI/CD pipeline",
    content: "Here's the deployment configuration with environment secrets and nginx setup.",
  });
  const result = classifyTask(task);
  assert.equal(result.category, "config");
});

// --- Other / fallback ---

test("classifies ambiguous content as other", () => {
  const task = makeTask({
    content: "Hello, how are you today?",
  });
  const result = classifyTask(task);
  assert.equal(result.category, "other");
});

test("classifies empty content as other", () => {
  const task = makeTask({ content: "", userPrompt: null });
  const result = classifyTask(task);
  assert.equal(result.category, "other");
});

// --- categoryScores ---

test("categoryScores contains all four categories", () => {
  const task = makeTask({ content: "hello" });
  const result = classifyTask(task);
  assert.ok("code" in result.categoryScores);
  assert.ok("write" in result.categoryScores);
  assert.ok("research" in result.categoryScores);
  assert.ok("config" in result.categoryScores);
});

// --- Batch ---

test("classifyTasks processes an array", () => {
  const tasks = [
    makeTask({ content: "Fix the bug in the function" }),
    makeTask({ content: "Write a blog article draft" }),
    makeTask({ content: "Hello there" }),
  ];
  const results = classifyTasks(tasks);
  assert.equal(results.length, 3);
  assert.equal(results[0].category, "code");
  assert.equal(results[1].category, "write");
  assert.equal(results[2].category, "other");
});

// --- Preserves existing fields ---

test("classifyTask preserves all original task fields", () => {
  const task = makeTask({
    model: "anthropic/claude-opus-4-5",
    content: "Fix the bug",
    cost: 0.05,
  });
  const result = classifyTask(task);
  assert.equal(result.model, "anthropic/claude-opus-4-5");
  assert.equal(result.cost, 0.05);
  assert.equal(result.content, "Fix the bug");
  assert.ok(result.category);
});
