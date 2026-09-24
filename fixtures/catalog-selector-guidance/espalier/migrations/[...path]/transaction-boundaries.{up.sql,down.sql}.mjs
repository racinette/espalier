export const description = "numbered migrations run in a transaction";
export const rule = `Each numbered migration begins with a header naming its
revision and direction, then runs between BEGIN and COMMIT. The standalone
baseline follows its own setup contract.`;

export async function lint({ path, read, emit }) {
  const sql = await read();
  const filename = path.split("/").pop();
  const parts = /^(\d{3})\.(up|down)\.sql$/.exec(filename);
  const header = parts === null ? null : `-- migration: ${parts[1]} ${parts[2]}`;
  if (header === null || !sql.startsWith(`${header}\nBEGIN;\n`) || !/\nCOMMIT;\s*$/.test(sql)) {
    emit({ code: "migration_transaction", severity: "error", message: "migration needs its direction header, BEGIN, and COMMIT" });
  }
}
