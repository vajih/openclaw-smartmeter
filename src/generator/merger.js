/**
 * Deep merge source into target. Returns a new object.
 * - Objects are recursively merged
 * - Arrays from source replace target arrays
 * - Primitives from source overwrite target
 * - Neither input is mutated
 */
export function deepMerge(target, source) {
  const result = { ...target };

  for (const key of Object.keys(source)) {
    const srcVal = source[key];
    const tgtVal = result[key];

    if (isPlainObject(srcVal) && isPlainObject(tgtVal)) {
      result[key] = deepMerge(tgtVal, srcVal);
    } else {
      result[key] = structuredClone(srcVal);
    }
  }

  return result;
}

function isPlainObject(val) {
  return val !== null && typeof val === "object" && !Array.isArray(val);
}
