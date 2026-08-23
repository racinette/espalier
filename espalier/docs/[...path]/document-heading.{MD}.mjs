export const description = "every document opens with a level-one heading";

export const rule = `Opens with a level-one heading naming its subject. A
document a reader lands in the middle of should say what it is before it says
anything else.`;

export async function lint({ read, emit }) {
  const text = await read();
  if (!text.startsWith("# ")) {
    emit({ code: "no_heading", message: "must open with a level-one heading", line: 1 });
  }
}
