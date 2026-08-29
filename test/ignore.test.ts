// Gitignore-syntax matching. docs/CONFIG.MD "ignore", "ignoreFiles".
//
// `candidates.test.ts` asserts what the walk does with these rules; this
// asserts what the rules mean. The two are worth separating because the
// interesting cases here — anchoring, `**`, what is deliberately unsupported —
// are properties of one pattern against one path, and a fixture would need a
// tree per pattern to say the same thing.
//
// The claim being held to is narrow and written down: gitignore *syntax*, not
// gitignore compliance. Where the two diverge, the divergence is documented and
// is asserted here so that closing it later is a decision rather than a drift.

import { test } from "node:test";
import assert from "node:assert/strict";
import { compileIgnore, excludedBy, ignores } from "../src/ignore.js";

/** Reads as the sentence it is testing: `matches(["dist/"], "dist/a.js")`. */
function matches(patterns: string[], at: string, asDirectory = false): boolean {
  return ignores(compileIgnore(patterns), at, asDirectory);
}

test("a bare name matches at any depth", () => {
  assert.equal(matches(["notes.txt"], "notes.txt"), true);
  assert.equal(matches(["notes.txt"], "src/notes.txt"), true);
  assert.equal(matches(["notes.txt"], "a/b/c/notes.txt"), true);
  // Not a suffix match: the whole segment has to be the name.
  assert.equal(matches(["notes.txt"], "src/my-notes.txt"), false);
});

test("an interior slash anchors the pattern to the repository root", () => {
  assert.equal(matches(["src/notes.txt"], "src/notes.txt"), true);
  assert.equal(matches(["src/notes.txt"], "packages/api/src/notes.txt"), false);
});

test("a leading slash anchors a name that would otherwise float", () => {
  assert.equal(matches(["/notes.txt"], "notes.txt"), true);
  assert.equal(matches(["/notes.txt"], "src/notes.txt"), false);
});

test("a trailing slash matches directories only", () => {
  // The same text, asked about twice. This is the distinction that decides
  // whether the walk enters a directory or merely declines to report its
  // contents — see CONFIG.MD "Symlinks" for where that becomes visible.
  assert.equal(matches(["build/"], "build", true), true);
  assert.equal(matches(["build/"], "build", false), false);
  // As an ancestor it applies regardless: every segment but the last names a
  // directory.
  assert.equal(matches(["build/"], "build/out.js"), true);
});

test("a star does not cross a slash", () => {
  assert.equal(matches(["*.log"], "debug.log"), true);
  assert.equal(matches(["src/*.log"], "src/debug.log"), true);
  assert.equal(matches(["src/*.log"], "src/deep/debug.log"), false);
});

test("a question mark matches exactly one character, and not a slash", () => {
  assert.equal(matches(["a?.ts"], "ab.ts"), true);
  assert.equal(matches(["a?.ts"], "abc.ts"), false);
  assert.equal(matches(["a?b"], "a/b"), false);
});

test("`**/` matches zero or more leading directories", () => {
  assert.equal(matches(["**/dist/"], "dist", true), true);
  assert.equal(matches(["**/dist/"], "packages/api/dist", true), true);
});

test("`**` elsewhere crosses slashes", () => {
  assert.equal(matches(["dist/**"], "dist/a.js"), true);
  assert.equal(matches(["dist/**"], "dist/deep/a.js"), true);
  // And the directory itself is not what it names — which is why `dist/**`
  // does not prune. CONFIG.MD "ignore".
  assert.equal(matches(["dist/**"], "dist", true), false);
});

test("later patterns win", () => {
  assert.equal(matches(["*.log", "!debug.log"], "debug.log"), false);
  assert.equal(matches(["!debug.log", "*.log"], "debug.log"), true);
});

test("a negation cannot re-include under an excluded ancestor", () => {
  // Git's rule, and here it is forced: the walk never opens the directory, so a
  // negation that appeared to win would name a path no run had looked at.
  assert.equal(matches(["dist/", "!dist/index.js"], "dist/index.js"), true);
  // Un-prune the directory and the negation can reach inside it.
  assert.equal(matches(["dist/", "!dist/", "dist/**", "!dist/index.js"], "dist/index.js"), false);
  assert.equal(matches(["dist/", "!dist/", "dist/**", "!dist/index.js"], "dist/other.js"), true);
});

test("comments and blank lines contribute no patterns", () => {
  const rules = compileIgnore(["# a comment", "", "   ", "notes.txt"]);
  assert.equal(rules.length, 1);
  assert.equal(rules[0]!.pattern, "notes.txt");
});

test("a comment introduces the entries beneath it, until a blank line", () => {
  // The reason the list is a file. `build` writes these into the documentation
  // for the directory the entry excludes, so the grouping is what a reader ends
  // up with — one thought over the entries it was written about.
  const rules = compileIgnore([
    "# Not this project's architecture.",
    "# Their shape is dictated by the tools that read them.",
    "package.json",
    "tsconfig.json",
    "",
    "dist/",
    "# Installed, not written.",
    "node_modules/",
  ]);

  const reason = Object.fromEntries(rules.map((rule) => [rule.pattern, rule.comment]));
  const both = "Not this project's architecture. Their shape is dictated by the tools that read them.";
  assert.deepEqual(reason, {
    "package.json": both,
    "tsconfig.json": both,
    // A blank line closes the block, so this entry inherits nothing.
    "dist/": null,
    "node_modules/": "Installed, not written.",
  });
});

test("surrounding whitespace is not part of the pattern", () => {
  assert.equal(matches(["  notes.txt  "], "notes.txt"), true);
});

test("character classes are not supported, and match literally", () => {
  // Documented as unsupported rather than merely absent: `espalier` is not a
  // git client, and a second silently-different gitignore implementation is
  // what reading these files directly was meant to avoid. CONFIG.MD.
  assert.equal(matches(["[a-z].ts"], "b.ts"), false);
  assert.equal(matches(["[a-z].ts"], "[a-z].ts"), true);
});

test("backslashes are not escapes, and match literally", () => {
  assert.equal(matches(["\\#notes"], "#notes"), false);
  assert.equal(matches(["\\#notes"], "\\#notes"), true);
});

test("excludedBy names the pattern and where it came from", () => {
  const rules = [
    ...compileIgnore(["dist/"], ".gitignore"),
    ...compileIgnore(["*.log"]),
  ];

  // `explain` reports this, which is the whole point of reading these lists
  // from files a user can open rather than from a table inside the tool.
  assert.equal(excludedBy(rules, "dist/a.js")?.origin, ".gitignore");
  assert.equal(excludedBy(rules, "dist/a.js")?.pattern, "dist/");
  assert.equal(excludedBy(rules, "debug.log")?.origin, ".espalierignore");
  assert.equal(excludedBy(rules, "src/a.ts"), null);
});

test("the winning rule is the last to match, not the most specific", () => {
  const rules = compileIgnore(["*.log", "debug.log"]);
  assert.equal(excludedBy(rules, "debug.log")?.pattern, "debug.log");
  assert.equal(excludedBy(compileIgnore(["debug.log", "*.log"]), "debug.log")?.pattern, "*.log");
});

test("rules in a nested ignore file are relative to its directory", () => {
  const rules = compileIgnore(["/generated/", "*.log"], "src/.espalierignore", "src");
  assert.equal(ignores(rules, "src/generated", true), true);
  assert.equal(ignores(rules, "src/deep/debug.log"), true);
  assert.equal(ignores(rules, "generated", true), false);
  assert.equal(ignores(rules, "docs/debug.log"), false);
});

test("a deeper ignore file overrides applicable ancestor rules", () => {
  const rules = [
    ...compileIgnore(["*.log"]),
    ...compileIgnore(["!important.log"], "src/.espalierignore", "src"),
  ];
  assert.equal(ignores(rules, "debug.log"), true);
  assert.equal(ignores(rules, "src/debug.log"), true);
  assert.equal(ignores(rules, "src/important.log"), false);
  assert.equal(ignores(rules, "docs/important.log"), true);
});

test("observation records only final positive winners for materialized paths", () => {
  const rules = compileIgnore(["*.log", "debug.log", "!debug.log", "!missing.log", "*.bak"]);
  const observed = new Set<(typeof rules)[number]>();

  assert.equal(excludedBy(rules, "debug.log", false, observed), null);
  assert.equal(excludedBy(rules, "error.log", false, observed)?.pattern, "*.log");
  assert.equal(excludedBy(rules, "main.ts", false, observed), null);
  assert.deepEqual(
    rules.filter((rule) => observed.has(rule)).map((rule) => rule.pattern),
    ["*.log"],
  );
});
