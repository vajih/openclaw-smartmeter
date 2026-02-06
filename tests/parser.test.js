import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  parseLogEntry,
  parseSessionFile,
  findSessionFiles,
  parseAllSessions,
} from "../src/analyzer/parser.js";

// --- parseLogEntry ---

test("parseLogEntry extracts fields from valid assistant message", () => {
  const line = JSON.stringify({
    type: "message",
    message: {
      role: "assistant",
      content: "Hello",
      model: "anthropic/claude-sonnet-4-5",
      usage: {
        input: 1250,
        output: 340,
        cacheRead: 45000,
        cacheWrite: 0,
        cost: { total: 0.0234 },
      },
      timestamp: 1738723945279,
    },
  });

  const task = parseLogEntry(line, "/tmp/test.jsonl");

  assert.equal(task.model, "anthropic/claude-sonnet-4-5");
  assert.equal(task.usage.input, 1250);
  assert.equal(task.usage.output, 340);
  assert.equal(task.usage.cacheRead, 45000);
  assert.equal(task.usage.cacheWrite, 0);
  assert.equal(task.content, "Hello");
  assert.equal(task.cost, 0.0234);
  assert.equal(task.timestamp, 1738723945279);
  assert.equal(task.sourceFile, "/tmp/test.jsonl");
});

test("parseLogEntry returns null for user messages", () => {
  const line = JSON.stringify({
    type: "message",
    message: { role: "user", content: "hello" },
  });
  assert.equal(parseLogEntry(line, "f"), null);
});

test("parseLogEntry returns null for non-message types", () => {
  const line = JSON.stringify({ type: "system", event: "session_end" });
  assert.equal(parseLogEntry(line, "f"), null);
});

test("parseLogEntry returns null for empty/whitespace lines", () => {
  assert.equal(parseLogEntry("", "f"), null);
  assert.equal(parseLogEntry("   ", "f"), null);
});

test("parseLogEntry returns null for malformed JSON", () => {
  assert.equal(parseLogEntry("{broken json", "f"), null);
});

test("parseLogEntry defaults missing usage fields to 0", () => {
  const line = JSON.stringify({
    type: "message",
    message: {
      role: "assistant",
      content: "hi",
      usage: { input: 100, output: 50 },
    },
  });

  const task = parseLogEntry(line, "f");
  assert.equal(task.usage.cacheRead, 0);
  assert.equal(task.usage.cacheWrite, 0);
  assert.equal(task.cost, 0);
  assert.equal(task.model, "unknown");
});

// --- parseSessionFile ---

test("parseSessionFile parses the sample session file", async () => {
  const samplePath = join(
    import.meta.dirname,
    "..",
    "examples",
    "sample-session.jsonl",
  );
  const tasks = await parseSessionFile(samplePath);

  assert.equal(tasks.length, 9); // 9 assistant messages
  assert.equal(tasks[0].model, "anthropic/claude-sonnet-4-5");
  assert.equal(tasks[0].cost, 0.0234);
  // user prompt pairing
  assert.equal(tasks[0].userPrompt, "Fix the login bug in auth.js");
  assert.equal(tasks[1].userPrompt, "Now add unit tests for it");
  assert.equal(tasks[2].userPrompt, null); // no preceding user message
  assert.equal(tasks[4].userPrompt, "Write documentation for the API endpoints");
});

// --- findSessionFiles + parseAllSessions (using temp dirs) ---

async function createTempAgentDir() {
  const base = await mkdtemp(join(tmpdir(), "smartmeter-test-"));
  return base;
}

async function writeSessionFile(baseDir, agentName, fileName, lines) {
  const sessionsDir = join(baseDir, agentName, "sessions");
  await mkdir(sessionsDir, { recursive: true });
  const filePath = join(sessionsDir, fileName);
  await writeFile(filePath, lines.join("\n") + "\n");
  return filePath;
}

function makeAssistantLine(overrides = {}) {
  return JSON.stringify({
    type: "message",
    message: {
      role: "assistant",
      content: "response",
      model: "anthropic/claude-sonnet-4-5",
      usage: {
        input: 1000,
        output: 200,
        cacheRead: 5000,
        cacheWrite: 0,
        cost: { total: 0.01 },
      },
      timestamp: Date.now(),
      ...overrides,
    },
  });
}

test("findSessionFiles discovers .jsonl files across agents", async () => {
  const base = await createTempAgentDir();
  try {
    await writeSessionFile(base, "agent-a", "s1.jsonl", ["{}"] );
    await writeSessionFile(base, "agent-b", "s2.jsonl", ["{}"] );
    // non-jsonl file should be ignored
    await writeSessionFile(base, "agent-a", "notes.txt", ["hello"]);

    const files = await findSessionFiles(base);
    assert.equal(files.length, 2);
    assert.ok(files.some((f) => f.includes("s1.jsonl")));
    assert.ok(files.some((f) => f.includes("s2.jsonl")));
  } finally {
    await rm(base, { recursive: true });
  }
});

test("findSessionFiles returns empty array for missing directory", async () => {
  const files = await findSessionFiles("/tmp/nonexistent-smartmeter-dir");
  assert.deepEqual(files, []);
});

test("parseAllSessions aggregates tasks from multiple files", async () => {
  const base = await createTempAgentDir();
  try {
    const t1 = 1738723900000;
    const t2 = 1738723950000;
    const t3 = 1738810400000;

    await writeSessionFile(base, "agent-a", "s1.jsonl", [
      makeAssistantLine({ timestamp: t2, model: "anthropic/claude-sonnet-4-5" }),
      makeAssistantLine({ timestamp: t1, model: "anthropic/claude-opus-4-5" }),
    ]);
    await writeSessionFile(base, "agent-b", "s2.jsonl", [
      makeAssistantLine({ timestamp: t3, model: "anthropic/claude-sonnet-4-5" }),
    ]);

    const result = await parseAllSessions({ baseDir: base });

    assert.equal(result.tasks.length, 3);
    assert.equal(result.files.length, 2);
    // should be sorted by timestamp
    assert.equal(result.tasks[0].timestamp, t1);
    assert.equal(result.tasks[1].timestamp, t2);
    assert.equal(result.tasks[2].timestamp, t3);
    // period
    assert.ok(result.period);
    assert.equal(result.period.totalTasks, 3);
  } finally {
    await rm(base, { recursive: true });
  }
});

test("parseAllSessions warns when no files found", async () => {
  const base = await createTempAgentDir();
  try {
    const result = await parseAllSessions({ baseDir: base });
    assert.equal(result.tasks.length, 0);
    assert.ok(result.warnings.some((w) => w.includes("No session files")));
  } finally {
    await rm(base, { recursive: true });
  }
});

test("parseAllSessions warns when data spans fewer than minDays", async () => {
  const base = await createTempAgentDir();
  try {
    const now = Date.now();
    await writeSessionFile(base, "agent-a", "s1.jsonl", [
      makeAssistantLine({ timestamp: now - 3 * 86400000 }),
      makeAssistantLine({ timestamp: now }),
    ]);

    const result = await parseAllSessions({ baseDir: base, minDays: 14 });
    assert.ok(result.warnings.some((w) => w.includes("day(s) of data")));
  } finally {
    await rm(base, { recursive: true });
  }
});

test("parseAllSessions handles malformed files gracefully", async () => {
  const base = await createTempAgentDir();
  try {
    await writeSessionFile(base, "agent-a", "s1.jsonl", [
      "not json at all",
      "{{{",
      makeAssistantLine({ timestamp: 1000 }),
      "",
    ]);

    const result = await parseAllSessions({ baseDir: base });
    // malformed lines are skipped, valid one is kept
    assert.equal(result.tasks.length, 1);
    // no "Failed to parse" warnings — malformed lines are silently skipped
    assert.ok(!result.warnings.some((w) => w.includes("Failed to parse")));
  } finally {
    await rm(base, { recursive: true });
  }
});
