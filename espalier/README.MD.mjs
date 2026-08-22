export const description = "the front page";

export const rule = `Opens with a level-one heading, and links into \`docs/\` for
anything it only summarizes. The front page is allowed to be shorter than the
specification; it is not allowed to be a second, drifting copy of it.`;

export async function lint({ read, emit }) {
  const text = await read();
  if (!text.startsWith("# ")) {
    emit({ code: "no_heading", message: "must open with a level-one heading" });
  }
}
