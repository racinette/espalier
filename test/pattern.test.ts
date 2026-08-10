// The sibling-overlap examples in docs/MATCHING.MD "Ambiguity is rejected".
// Only one of them is covered by a fixture, and the decision procedure is
// subtle enough to be worth pinning directly.

import { test } from "node:test";
import assert from "node:assert/strict";
import { intersects, matchSegment, parseSegment } from "../src/pattern.js";

const shapeOf = (source: string): string => parseSegment(source, "test").shape;

const overlaps = (a: string, b: string): boolean => intersects(shapeOf(a), shapeOf(b));

test("dynamic siblings that can match one name are rejected", () => {
  assert.equal(overlaps("[component].tsx", "[helper].tsx"), true);
  assert.equal(overlaps("[name].ts", "test-[name].ts"), true, `"test-a.ts" matches both`);
  assert.equal(overlaps("[name]-test.ts", "test-[name].ts"), true, `"test-x-test.ts" matches both`);
});

test("dynamic siblings that cannot collide are accepted", () => {
  assert.equal(overlaps("[component].tsx", "[helper].ts"), false, "no filename ends in both");
  assert.equal(overlaps("a-[x].ts", "b-[x].ts"), false);
});

test("a placeholder matches one character or more", () => {
  const segment = parseSegment("[button].tsx", "test");
  assert.deepEqual(matchSegment(segment, "Submit.tsx"), { button: "Submit" });
  assert.equal(matchSegment(segment, ".tsx"), null, "a bare extension is not a match");

  // A literal prefix narrows a shape but rarely separates it: "aX.ts"
  // satisfies both of these, so they still overlap.
  assert.equal(overlaps("[a].ts", "a[b].ts"), true);
});

test("a dynamic directory and a dynamic leaf may share a parent", () => {
  // Their shapes overlap — "foo.ts" satisfies both — but only one of them can
  // own a file, so ownership stays decidable.
  assert.equal(overlaps("[provider]", "[list].ts"), true);
});

test("recursive placeholders must occupy a whole segment", () => {
  assert.equal(parseSegment("[...path]", "test").recursive, "path");
  assert.throws(() => parseSegment("foo[...bar]", "test"), /whole segment/);
});

test("placeholder names must be valid identifiers", () => {
  assert.throws(() => parseSegment("[]", "test"), /capture name/);
  assert.throws(() => parseSegment("[a-b]", "test"), /capture name/);
  assert.throws(() => parseSegment("[unclosed", "test"), /unclosed/);
});

test("shapes normalize placeholders to a star", () => {
  assert.equal(shapeOf("clients"), "clients");
  assert.equal(shapeOf("[provider]"), "*");
  assert.equal(shapeOf("test-[name].ts"), "test-*.ts");
  assert.equal(shapeOf("[...path]"), "**");
});
