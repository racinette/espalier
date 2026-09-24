export const targets = ["**/*.sql"];
export const description = "release SQL has no unfinished edits";
export const rule = `No SQL shipped in this release bundle contains a TODO or
TBD marker. This applies to the standalone baseline and to both directions
of every numbered migration.`;

export async function lint({ read, emit }) {
  if (/\b(?:TODO|TBD)\b/i.test(await read())) {
    emit({ code: "sql_placeholder", severity: "error", message: "SQL still contains an editorial placeholder" });
  }
}
