function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function diffObjects(previous, current, prefix = "") {
  const changes = [];
  const prev = previous || {};
  const curr = current || {};
  const keys = new Set([...Object.keys(prev), ...Object.keys(curr)]);

  for (const key of keys) {
    const p = prev[key];
    const c = curr[key];
    const path = prefix ? `${prefix}.${key}` : key;

    if (isObject(p) && isObject(c)) {
      changes.push(...diffObjects(p, c, path));
      continue;
    }

    if (Array.isArray(p) && Array.isArray(c)) {
      if (JSON.stringify(p) !== JSON.stringify(c)) {
        changes.push({ path, previous: p, current: c });
      }
      continue;
    }

    if (p !== c) {
      changes.push({ path, previous: p, current: c });
    }
  }

  return changes;
}

export function indexBy(items, key) {
  const out = new Map();
  for (const item of items || []) {
    if (item && item[key] !== undefined) {
      out.set(String(item[key]), item);
    }
  }
  return out;
}
