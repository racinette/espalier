import { parseCase } from "../../../helpers/case.mjs";

export const description = "each fixture case is locally well-formed";
export const rule = `Each selected fixture case is a JSON object with \`kind\`
(\`query\` or \`mutation\`), a non-negative integer \`depth\`, and a
non-negative integer \`args\`.`;

export async function lint({ read, emit }) {
  const parsed = parseCase(await read());
  if (!parsed.ok) {
    emit({ code: "malformed_case", message: parsed.error });
  }
}
