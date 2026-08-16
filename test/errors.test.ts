// docs/ERRORS.MD lists every operational failure code. This keeps it honest.
//
// The codes were deliberately not designed up front — they were chosen at the
// throw site as each failure turned out to be real. That only stays defensible
// if the record cannot drift afterwards, which is what this test is for.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");

/** Codes `espalier` can report as `kind: "failure"`, gathered from the source. */
function declaredCodes(): Set<string> {
  const found = new Set<string>();

  for (const entry of readdirSync(path.join(root, "src"))) {
    if (!entry.endsWith(".ts")) continue;
    const source = readFileSync(path.join(root, "src", entry), "utf8");

    // `fail("code", …)` and `reporter.failure("code", …)`. Both may wrap, so
    // whitespace and a newline between the paren and the string are allowed.
    for (const match of source.matchAll(/(?:\bfail|\.failure)\(\s*"([a-z_]+)"/g)) {
      found.add(match[1]!);
    }
  }

  return found;
}

function documentedCodes(): Set<string> {
  const doc = readFileSync(path.join(root, "docs", "ERRORS.MD"), "utf8");
  const found = new Set<string>();
  for (const match of doc.matchAll(/^\| `([a-z_]+)` \|/gm)) found.add(match[1]!);
  return found;
}

test("every failure code in the source is documented", () => {
  const declared = declaredCodes();
  const documented = documentedCodes();

  // `cause.code` is re-reported by cli.ts and is not a literal of its own.
  const undocumented = [...declared].filter((code) => !documented.has(code)).sort();

  assert.deepEqual(
    undocumented,
    [],
    `add these to docs/ERRORS.MD, or stop throwing them:\n  ${undocumented.join("\n  ")}`,
  );
});

test("every code documented is one the source can actually throw", () => {
  const declared = declaredCodes();
  const documented = documentedCodes();

  const stale = [...documented].filter((code) => !declared.has(code)).sort();

  assert.deepEqual(
    stale,
    [],
    `docs/ERRORS.MD lists codes nothing throws:\n  ${stale.join("\n  ")}`,
  );
});
