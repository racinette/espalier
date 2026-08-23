export const description = "what a rule module exports and receives";

export const rule = `Covers the contract between a rule module and the runner: every export a module
may declare, and every field of the context its \`lint\` is handed. Where such a
file may sit, and which files it claims, is MATCHING.MD.`;

export async function lint() {}
