import path from "node:path";

export const description = "every relative link resolves";

export const guidance = `A relative link names a file or directory that is here, and an anchor names a
heading that target has. Documents link into each other constantly, and
headings are renamed as often as files; a link that resolves nowhere sends
the reader to a page that no longer says what the link promised. Code spans
and fenced blocks are not links and are not checked. External links are
not checked either, since nothing here can see whether they still resolve.`;

/** Code is blanked, keeping its length and line breaks, so offsets still name lines. */
function prose(text) {
  const blank = (code) => code.replace(/[^\n]/g, " ");
  return text
    .replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, blank)
    .replace(/`[^`\n]*`/g, blank);
}

/** GitHub's anchor for each heading, with "-1", "-2" for repeats. */
function anchors(text) {
  const seen = new Map();
  const found = new Set();
  for (const [, heading] of text.matchAll(/^#{1,6}[ \t]+(.*?)[ \t#]*$/gm)) {
    const base = heading.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, "").replace(/\s/g, "-");
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    found.add(count === 0 ? base : `${base}-${count}`);
  }
  return found;
}

export async function lint({ path: here, read, files, emit }) {
  const text = await read();
  const checked = prose(text);
  const headings = new Map();
  const headingsOf = async (target) => {
    if (!headings.has(target)) headings.set(target, anchors(unblanked(await read(target))));
    return headings.get(target);
  };
  for (const found of checked.matchAll(/\]\(([^)\s]*)\)/g)) {
    const link = found[1];
    if (link === "" || /^[a-z][a-z0-9+.-]*:/i.test(link)) continue;
    const line = checked.slice(0, found.index).split("\n").length;
    const [file, anchor] = link.split("#", 2);
    if (file.startsWith("/")) {
      emit({ code: "absolute_link", message: `${link} is absolute; link relative to this file`, line, metadata: { link } });
      continue;
    }
    const target = file === "" ? here : path.posix.normalize(path.posix.join(path.posix.dirname(here), file)).replace(/\/$/, "");
    const isFile = (await files(target)).length > 0;
    if (!isFile && (await files(`${target}/**`)).length === 0) {
      emit({ code: "broken_link", message: `${link} names ${target}, which is not here`, line, metadata: { link, target } });
      continue;
    }
    if (anchor !== undefined && isFile && /\.md$/i.test(target) && !(await headingsOf(target)).has(anchor)) {
      emit({ code: "broken_anchor", message: `${link}: ${target} has no heading whose anchor is #${anchor}`, line, metadata: { link, target, anchor } });
    }
  }
}

/** Headings keep their code spans; only fenced blocks are set aside. */
function unblanked(text) {
  return text.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, (code) => code.replace(/[^\n]/g, " "));
}
