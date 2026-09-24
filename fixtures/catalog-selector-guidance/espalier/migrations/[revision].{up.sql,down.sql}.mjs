export const description = "a forward or rollback schema migration";
export const rule = `Each numbered revision has an up script and a down script.
Keep the revision number in both filenames; the pair check verifies that both
directions are present.`;

export async function lint({ captures, emit }) {
  if (!/^\d{3}$/.test(captures.revision)) {
    emit({ code: "invalid_revision", severity: "error", message: "use a three-digit revision number" });
  }
}
