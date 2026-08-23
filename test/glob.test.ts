// The glob `context.files` matches with. docs/TYPES.MD "ListFiles".
//
// Deliberately not the same function as `ignore`'s matcher, and deliberately
// simpler: this one answers "which of the files this run already knows about
// does the rule mean", so it has no anchoring rule to get wrong — every pattern
// is repository-relative because every path it is asked about is. The two look
// alike enough that pinning the difference is worth a file.

import { test } from "node:test";
import assert from "node:assert/strict";
import { matchGlob } from "../src/files.js";

test("a literal pattern matches itself and nothing else", () => {
  assert.equal(matchGlob("src/a.ts", "src/a.ts"), true);
  assert.equal(matchGlob("src/a.ts", "src/ab.ts"), false);
  // No implicit anchoring to fix: the pattern is a path, and so is the target.
  assert.equal(matchGlob("a.ts", "src/a.ts"), false);
});

test("a star stays inside one segment", () => {
  assert.equal(matchGlob("src/*.ts", "src/a.ts"), true);
  assert.equal(matchGlob("src/*.ts", "src/deep/a.ts"), false);
  assert.equal(matchGlob("*.ts", "a.ts"), true);
  assert.equal(matchGlob("*.ts", "src/a.ts"), false);
});

test("a star matches an empty run of characters", () => {
  assert.equal(matchGlob("src/*.ts", "src/.ts"), true);
});

test("`**/` spans zero or more directories", () => {
  // Zero is the half that is easy to get wrong, and it is the half peer
  // comparison needs: a rule asking for `**/*.tsx` means the whole repository,
  // top level included.
  assert.equal(matchGlob("**/*.tsx", "Modal.tsx"), true);
  assert.equal(matchGlob("**/*.tsx", "components/Modal.tsx"), true);
  assert.equal(matchGlob("**/*.tsx", "a/b/c/Modal.tsx"), true);
  assert.equal(matchGlob("components/**/*.tsx", "components/Modal.tsx"), true);
  assert.equal(matchGlob("components/**/*.tsx", "components/buttons/Modal.tsx"), true);
});

test("`**` not followed by a slash crosses segments anyway", () => {
  assert.equal(matchGlob("src/**", "src/a.ts"), true);
  assert.equal(matchGlob("src/**", "src/deep/a.ts"), true);
  // And does not match the directory itself, which has no trailing slash.
  assert.equal(matchGlob("src/**", "src"), false);
});

test("regular-expression syntax in a pattern is literal text", () => {
  // A filename is allowed to contain these, and a rule asking for one should
  // get it rather than a pattern nobody wrote.
  assert.equal(matchGlob("src/a+b.ts", "src/a+b.ts"), true);
  assert.equal(matchGlob("src/a+b.ts", "src/aab.ts"), false);
  assert.equal(matchGlob("src/(x).ts", "src/(x).ts"), true);
  assert.equal(matchGlob("src/a.ts", "src/aXts"), false);
});

test("a question mark is not a wildcard here", () => {
  // `ignore` supports it and this does not. Neither is wrong — they answer
  // different questions — but the difference is easy to assume away.
  assert.equal(matchGlob("src/a?.ts", "src/ab.ts"), false);
  assert.equal(matchGlob("src/a?.ts", "src/a?.ts"), true);
});

test("matching is case-sensitive", () => {
  assert.equal(matchGlob("src/*.ts", "src/A.TS"), false);
  assert.equal(matchGlob("src/README.md", "src/readme.md"), false);
});
