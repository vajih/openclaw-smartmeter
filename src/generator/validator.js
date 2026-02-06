const ALLOWED_TOP_KEYS = new Set([
  "agents",
  "skills",
  "models",
  "heartbeat",
  "_smartmeter",
]);

/**
 * Validate an openclaw config object.
 * Returns { valid: boolean, errors: string[] }.
 */
export function validate(config) {
  const errors = [];

  if (config == null || typeof config !== "object" || Array.isArray(config)) {
    return { valid: false, errors: ["Config must be a non-null object"] };
  }

  // Check top-level keys
  for (const key of Object.keys(config)) {
    if (!ALLOWED_TOP_KEYS.has(key)) {
      errors.push(`Unknown top-level key: "${key}"`);
    }
  }

  // agents.defaults.model.primary must exist and be a string
  const primary = config.agents?.defaults?.model?.primary;
  if (primary === undefined) {
    errors.push("Missing agents.defaults.model.primary");
  } else if (typeof primary !== "string") {
    errors.push("agents.defaults.model.primary must be a string");
  }

  // Budget validation (if present)
  const budget = config.agents?.defaults?.budget;
  if (budget) {
    if (budget.daily !== undefined && (typeof budget.daily !== "number" || budget.daily <= 0)) {
      errors.push("agents.defaults.budget.daily must be a positive number");
    }
    if (budget.weekly !== undefined && (typeof budget.weekly !== "number" || budget.weekly <= 0)) {
      errors.push("agents.defaults.budget.weekly must be a positive number");
    }
    if (
      typeof budget.daily === "number" &&
      typeof budget.weekly === "number" &&
      budget.weekly < budget.daily
    ) {
      errors.push("agents.defaults.budget.weekly must be >= daily");
    }
  }

  return { valid: errors.length === 0, errors };
}
