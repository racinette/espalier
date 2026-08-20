export const description = "a migration";

export const rule = `Forward-only. Never edit a migration that has been applied.`;

// No conforming file exists to point at: the first migration a project writes
// is the one this rule has to describe. docs/TYPES.MD "example".
export const example = String.raw`-- 001_initial.sql
CREATE TABLE accounts (
  id uuid PRIMARY KEY
);`;

export async function lint() {}
