export const instanceOf = "[module].ts.mjs";
export const description = "flight search";
export const guidance = "Search contains DOMAIN.";
export async function lint({read, emit}) {
  if (!(await read()).includes('DOMAIN')) emit({code: "domain_required", message: "DOMAIN missing"});
}
