export const description = "the create command";

export const guidance = `Creates only absent files or directories declared by
structural rules. A directory contains every recursively required static or
resolved leaf plus explicitly selected optional leaves, and composes their template arguments under literal
relative-file prefixes. Never overwrites source or exposes a partially rendered
directory. File help names the concrete target and its authored owner;
directory help names the structural directory, included files, and selectable optional leaves.
Preview renders the same templates and arguments, then reports all source
without creating target files or directories. A render failure produces no
partial preview.`;

export async function lint() {}
