export const description = "the canonical schema";

export const rule = `One CREATE TABLE per entity, in dependency order.`;

export const referenceImplementation = "src/schema.sql";

export async function lint() {}
