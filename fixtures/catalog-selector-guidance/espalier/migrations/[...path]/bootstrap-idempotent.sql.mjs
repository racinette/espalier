export const description = "standalone SQL can be reapplied safely";
export const rule = `Standalone SQL scripts, such as the initial baseline,
use CREATE TABLE IF NOT EXISTS so rerunning setup does not fail. Numbered
up and down migrations have different lifecycle rules.`;

export async function lint({ read, emit }) {
  if (!/\bCREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\b/i.test(await read())) {
    emit({ code: "bootstrap_not_idempotent", severity: "error", message: "standalone SQL needs CREATE TABLE IF NOT EXISTS" });
  }
}
