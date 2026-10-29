import { createTemplate } from "espalier";

export const description = "a test module";

export const guidance = `Opens with a comment saying what this file covers and why
it exists as a unit test rather than as a fixture. The suite is the argument
that the tool works; a file that cannot say what it is guarding is one nobody
will dare delete.`;

export async function lint({ read, emit }) {
  const text = await read();
  const opening = text.split("\n").find((line) => line.trim() !== "");
  if (opening === undefined || !opening.startsWith("//")) {
    emit({
      code: "no_header",
      message: "must open with a comment saying what this file covers",
      line: 1,
    });
  }
}

export const template = createTemplate(({ captures }) => `// TODO: what ${captures.name} covers, and why as a unit test rather than a fixture.

import { test } from "node:test";
import assert from "node:assert/strict";

test("TODO", () => {
  assert.fail("write the test");
});
`);
