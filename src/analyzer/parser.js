import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { homedir } from "node:os";

const DEFAULT_BASE_DIR = join(homedir(), ".openclaw", "agents");

/**
 * Extract plain text from a content field that may be a string or
 * an array of content blocks (e.g. [{type:"text",text:"..."}, {type:"toolCall",...}]).
 */
export function extractTextContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((block) => block.type === "text" && block.text)
    .map((block) => block.text)
    .join("\n");
}

/**
 * Find all session JSONL files under the agents directory.
 * Searches: {baseDir}/{agentName}/sessions/*.jsonl
 */
export async function findSessionFiles(baseDir = DEFAULT_BASE_DIR) {
  const files = [];

  let agents;
  try {
    agents = await readdir(baseDir);
  } catch (err) {
    if (err.code === "ENOENT") return files;
    throw err;
  }

  for (const agent of agents) {
    const sessionsDir = join(baseDir, agent, "sessions");
    let entries;
    try {
      entries = await readdir(sessionsDir);
    } catch {
      continue; // no sessions dir for this agent
    }

    for (const entry of entries) {
      if (entry.endsWith(".jsonl")) {
        files.push(join(sessionsDir, entry));
      }
    }
  }

  return files;
}

/**
 * Parse a single line from a session JSONL file.
 * Returns a task object if the line contains assistant usage data, null otherwise.
 */
export function parseLogEntry(line, sourceFile) {
  if (!line.trim()) return null;

  let record;
  try {
    record = JSON.parse(line);
  } catch {
    return null; // skip malformed lines
  }

  if (record.type !== "message") return null;

  const msg = record.message;
  if (!msg || msg.role !== "assistant" || !msg.usage) return null;

  const usage = msg.usage;

  return {
    model: msg.model || "unknown",
    content: extractTextContent(msg.content),
    usage: {
      input: usage.input || 0,
      output: usage.output || 0,
      cacheRead: usage.cacheRead || 0,
      cacheWrite: usage.cacheWrite || 0,
    },
    cost: usage.cost?.total ?? 0,
    timestamp: msg.timestamp || null,
    sourceFile,
  };
}

/**
 * Stream-parse a single JSONL session file.
 * Returns an array of task objects extracted from assistant messages.
 */
export async function parseSessionFile(filePath) {
  const tasks = [];
  let lastUserPrompt = null;

  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    // Track user messages for prompt pairing
    try {
      const record = JSON.parse(line);
      if (record.type === "message" && record.message?.role === "user") {
        lastUserPrompt = extractTextContent(record.message.content) || null;
      }
    } catch {
      // handled by parseLogEntry below
    }

    const task = parseLogEntry(line, filePath);
    if (task) {
      task.userPrompt = lastUserPrompt;
      lastUserPrompt = null;
      tasks.push(task);
    }
  }

  return tasks;
}

/**
 * Parse all session files and return structured results.
 *
 * Options:
 *   baseDir - root agents directory (default: ~/.openclaw/agents)
 *   minDays - warn if data spans fewer than this many days (default: 14)
 *
 * Returns: { tasks, files, warnings, period }
 */
export async function parseAllSessions(options = {}) {
  const { baseDir = DEFAULT_BASE_DIR, minDays = 14 } = options;

  const files = await findSessionFiles(baseDir);
  const warnings = [];

  if (files.length === 0) {
    warnings.push("No session files found");
    return { tasks: [], files: [], warnings, period: null };
  }

  const allTasks = [];

  for (const file of files) {
    try {
      const tasks = await parseSessionFile(file);
      allTasks.push(...tasks);
    } catch (err) {
      warnings.push(`Failed to parse ${file}: ${err.message}`);
    }
  }

  // Sort by timestamp
  allTasks.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  // Calculate period
  let period = null;
  const timestamps = allTasks
    .map((t) => t.timestamp)
    .filter((t) => t != null);

  if (timestamps.length > 0) {
    const start = new Date(timestamps[0]);
    const end = new Date(timestamps[timestamps.length - 1]);
    const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) || 1;

    period = {
      start: start.toISOString(),
      end: end.toISOString(),
      days,
      totalTasks: allTasks.length,
    };

    if (days < minDays) {
      warnings.push(
        `Only ${days} day(s) of data found (recommend at least ${minDays})`,
      );
    }
  }

  return { tasks: allTasks, files, warnings, period };
}
