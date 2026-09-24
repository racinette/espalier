export const aggregate = true;
export const targets = ["**/*.up.sql", "**/*.down.sql"];
export const description = "every schema revision has both directions";
export const rule = `Every numbered schema revision ships exactly one forward
script and one rollback script. A release without either direction cannot be
applied and reverted reliably.`;

export async function lint({ matches, emit }) {
  const byRevision = new Map();
  for (const { path } of matches) {
    const found = /^migrations\/(\d{3})\.(up|down)\.sql$/.exec(path);
    if (found === null) continue;
    const directions = byRevision.get(found[1]) ?? new Set();
    directions.add(found[2]);
    byRevision.set(found[1], directions);
  }
  for (const [revision, directions] of byRevision) {
    if (!directions.has("up") || !directions.has("down")) {
      emit({ code: "missing_migration_direction", severity: "error", message: `${revision} needs both up and down scripts` });
    }
  }
}
