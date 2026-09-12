export const description = "the create command";

export const rule = `Creates only absent files or directories declared by
structural rules. A directory contains every recursively required static or
resolved leaf, and composes their template arguments under literal
relative-file prefixes. Never overwrites source or exposes a partially rendered
directory. File help names the concrete target and its authored owner;
directory help names the structural directory and every required file.`;

export async function lint() {}
