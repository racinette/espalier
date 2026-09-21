export function parseCase(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, error: "not JSON" };
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "must be an object" };
  }
  const { kind, depth, args } = value;
  if (kind !== "query" && kind !== "mutation") {
    return { ok: false, error: "kind must be query or mutation" };
  }
  if (!Number.isInteger(depth) || depth < 0) {
    return { ok: false, error: "depth must be a non-negative integer" };
  }
  if (!Number.isInteger(args) || args < 0) {
    return { ok: false, error: "args must be a non-negative integer" };
  }
  return { ok: true, kind, depth, args };
}
