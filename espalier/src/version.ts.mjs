export const description = "the running package version";

export const rule = `Read the exact running version from the installed package manifest.
The CLI, configuration validation and generated pins must share that one source of
truth.`;

export async function lint() {}
