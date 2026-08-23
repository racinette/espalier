export const description = "the incremental lint cache";

export const rule = `Nothing here may throw. A cache that cannot be read, parsed, trusted or
written is a cache the run does without: the work is always available, and a
linter that fails over its own bookkeeping is worse than a slow one.`;

export async function lint() {}
