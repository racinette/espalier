export const description = "rule implementation dependency observation";

export const rule = `Observes the modules loaded by rules and addons without changing how Node resolves or loads them. An observation that cannot be validated disables cache replay; uncertainty is never a cache hit.`;

export async function lint() {}
