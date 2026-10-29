export const instanceOf = "[module].ts.mjs";
export const description = "the help command";

export const guidance = `Prints pages from the installed package, resolved against \`PACKAGE_ROOT\`. It
never loads a repository or configuration, because the running binary's own
copy is what \`pin\` promises. \`PAGES\` is the catalog, and lint holds it to
\`docs/\`: every listed file exists, and every reference page is listed. Page
names are an interface: the authoring contract and the generated **Working
with Espalier** section tell agents to run them. It writes stdout and stderr
directly because it takes no \`--format\` or \`--out\`. The command is specified
in \`docs/cli/help/README.MD\`.`;

export async function lint({ read, files, emit }) {
  const source = await read();
  const listed = new Set([...source.matchAll(/file: "([^"]+)"/g)].map((found) => found[1]));
  for (const file of [...listed].sort()) {
    if ((await files(file)).length === 0) {
      emit({ code: "missing_page", message: `PAGES lists ${file}, which is not here`, metadata: { file } });
    }
  }
  // Every reference page is printable from the installed package.
  const pages = [...await files("docs/*.MD"), ...await files("docs/cli/*/README.MD")];
  for (const page of pages.filter((page) => !listed.has(page)).sort()) {
    emit({ code: "unlisted_page", message: `${page} is a reference page and PAGES does not list it`, metadata: { file: page } });
  }
}
