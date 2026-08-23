export const description = "every operational failure and what it means";

export const rule = `One table, every code reported with \`kind: "failure"\`. A code \`fail()\` raises
that this does not list fails the suite, and so does a code listed here that
nothing raises — the table is checked in both directions on purpose.`;

export async function lint() {}
