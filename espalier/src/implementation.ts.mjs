export const description = "rule implementation dependency observation";

export const rule = `Loads fresh rule and addon implementations for each run while preserving shared module identity within it. Collects implementation dependencies only when findings caching is enabled. An observation that cannot be validated disables cache replay; uncertainty is never a cache hit.`;

export async function lint() {}
