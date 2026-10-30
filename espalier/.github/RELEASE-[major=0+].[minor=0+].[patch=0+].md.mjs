import { createTemplate } from "espalier";

export const description = "one release's notes, published as its GitHub release";
export const minMatches = 1;

export const guidance = `Written for someone upgrading: what changed that they will notice, what they
must do about it, and what \`espalier migrate\` does for them. Opens with
\`# Espalier <version>\`. The file is the release body \`gh release create
--notes-file\` publishes, so it is written before the release is tagged.
Published notes are frozen: the GitHub release already carries them, so a
correction is a new release's notes. The notes of the release being prepared
are reopened by a declaration of their own, \`RELEASE-X.Y.Z.md.mjs\` with
\`frozen = false\`, deleted once that release is published.`;

export const frozen = true;

export async function lint({ captures, read, emit }) {
  const heading = `# Espalier ${captures.major}.${captures.minor}.${captures.patch}`;
  if (!(await read()).startsWith(`${heading}\n`)) {
    emit({ code: "wrong_heading", message: `must open with ${heading}`, line: 1 });
  }
}

export const template = createTemplate(({ captures }) => `# Espalier ${captures.major}.${captures.minor}.${captures.patch}

TODO: what changed that an upgrading user will notice, and what they must do.
`);
