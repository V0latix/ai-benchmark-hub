function parseNumeric(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;

  const normalized = value.replace(/[$,\s]/g, "");
  if (!/^[-+]?\d*\.?\d+(?:e[-+]?\d+)?$/i.test(normalized)) return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function findNumber(input: unknown, keys: readonly string[]): number | null {
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  const visited = new WeakSet<object>();

  function visit(value: unknown): number | null {
    if (!value || typeof value !== "object") return null;
    if (visited.has(value)) return null;
    visited.add(value);

    for (const [key, child] of Object.entries(value)) {
      if (wanted.has(key.toLowerCase())) {
        const number = parseNumeric(child);
        if (number !== null) return number;
      }
    }

    for (const child of Object.values(value)) {
      const found = visit(child);
      if (found !== null) return found;
    }

    return null;
  }

  return visit(input);
}
