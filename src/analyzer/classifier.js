const KEYWORD_MAP = {
  code: [
    "bug",
    "fix",
    "debug",
    "error",
    "exception",
    "stack trace",
    "function",
    "class",
    "method",
    "variable",
    "implement",
    "refactor",
    "code",
    "programming",
    "test",
    "unit test",
    "git",
    "commit",
    "merge",
    "branch",
    "pull request",
    "api",
    "endpoint",
    "database",
    "query",
    "schema",
    "component",
    "module",
    "import",
    "compile",
    "build",
    "lint",
    "syntax",
    "type",
    "interface",
  ],
  write: [
    "write",
    "document",
    "documentation",
    "readme",
    "blog",
    "article",
    "email",
    "draft",
    "summary",
    "outline",
    "content",
    "proofread",
    "grammar",
    "template",
    "guide",
    "tutorial",
    "paragraph",
    "essay",
    "report",
    "translate",
    "rewrite",
  ],
  research: [
    "search",
    "find",
    "research",
    "compare",
    "comparison",
    "what is",
    "how does",
    "how to",
    "investigate",
    "analyze",
    "evaluate",
    "benchmark",
    "alternative",
    "recommend",
    "best practice",
    "pros and cons",
    "versus",
    "explore",
  ],
  config: [
    "config",
    "configuration",
    "setup",
    "install",
    "environment",
    "env",
    "docker",
    "kubernetes",
    "pipeline",
    "nginx",
    "server",
    "permission",
    "deploy",
    "deployment",
    "migrate",
    "migration",
    "yaml",
    "secret",
    "credential",
    "ssl",
    "certificate",
    "ci/cd",
  ],
};

// Pre-compile regexes for performance
const CATEGORY_PATTERNS = Object.fromEntries(
  Object.entries(KEYWORD_MAP).map(([category, keywords]) => {
    const patterns = keywords.map((kw) => {
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`\\b${escaped}\\b`, "gi");
    });
    return [category, patterns];
  }),
);

/**
 * Classify a single task into a category based on keyword matching
 * against userPrompt and assistant content.
 *
 * Returns a new object with `category` and `categoryScores` added.
 */
export function classifyTask(task) {
  const text = [task.userPrompt || "", task.content || ""].join(" ");

  const scores = {};
  for (const [category, patterns] of Object.entries(CATEGORY_PATTERNS)) {
    let score = 0;
    for (const regex of patterns) {
      regex.lastIndex = 0;
      const matches = text.match(regex);
      if (matches) score += matches.length;
    }
    scores[category] = score;
  }

  let bestCategory = "other";
  let bestScore = 0;
  for (const [category, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  return {
    ...task,
    category: bestCategory,
    categoryScores: scores,
  };
}

/**
 * Classify an array of tasks. Returns a new array with categories assigned.
 */
export function classifyTasks(tasks) {
  return tasks.map(classifyTask);
}
