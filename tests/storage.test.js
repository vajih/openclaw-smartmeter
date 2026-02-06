import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeAnalysis, readAnalysis } from "../src/analyzer/storage.js";

test("writeAnalysis creates file and readAnalysis reads it back", async () => {
  const dir = await mkdtemp(join(tmpdir(), "smartmeter-storage-"));
  try {
    const analysis = { summary: { totalCost: 42 }, models: {} };
    const filePath = await writeAnalysis(analysis, dir);

    assert.ok(filePath.endsWith("analysis.json"));

    const loaded = await readAnalysis(dir);
    assert.deepEqual(loaded, analysis);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test("readAnalysis returns null when no file exists", async () => {
  const dir = join(tmpdir(), "smartmeter-nonexistent-" + Date.now());
  const result = await readAnalysis(dir);
  assert.equal(result, null);
});

test("writeAnalysis creates directory if missing", async () => {
  const dir = join(tmpdir(), "smartmeter-nested-" + Date.now(), "sub");
  try {
    await writeAnalysis({ test: true }, dir);
    const loaded = await readAnalysis(dir);
    assert.deepEqual(loaded, { test: true });
  } finally {
    await rm(join(tmpdir(), "smartmeter-nested-" + Date.now()), { recursive: true, force: true });
  }
});
