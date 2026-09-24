export const description = "the idempotent initial storefront schema";
export const rule = `The baseline establishes the tables needed by a fresh
storefront installation. It is a standalone .sql file, not one side of a
numbered migration pair.`;

export async function lint() {}
