export const description = "file-creation template definitions";

export const rule = `Owns the public template schema and factory independently
of command dispatch. The schema is flat because it maps to flat CLI flags;
examples document invocations but never become runtime defaults. Renderers
receive the concrete owned path and its structural captures so they can derive
names from the destination instead of asking callers to repeat them.`;

export async function lint() {}
