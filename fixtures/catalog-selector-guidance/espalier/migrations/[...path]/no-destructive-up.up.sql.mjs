export const description = "forward migrations preserve existing tables";
export const rule = `Forward migrations must not drop a table. If a release
retires data, use a separately reviewed cleanup after readers have moved.`;

export async function lint({ read, emit }) {
  if (/\bDROP\s+TABLE\b/i.test(await read())) {
    emit({ code: "destructive_up", severity: "error", message: "forward migration drops a table" });
  }
}
