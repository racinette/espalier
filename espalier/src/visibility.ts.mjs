export const description = "filesystem visibility from external ignore files";

export const rule = `Model what the repository exposes to Espalier through external
ignore files. Apply sources in discovery order so deeper rules may override earlier
ones, and keep visibility distinct from governance exclusions.`;

export async function lint() {}
