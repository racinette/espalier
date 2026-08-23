// The sibling-overlap examples in docs/MATCHING.MD "Ambiguity is rejected".
// Only one of them is covered by a fixture, and the decision procedure is
// subtle enough to be worth pinning directly.

import { test } from "node:test";
import assert from "node:assert/strict";
import { intersects, matchSegment, parseSegment, resolveSegment } from "../src/pattern.js";

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

// Classification and captures. docs/MATCHING.MD "Classification", "Captures",
// "Back-references". A fixture can only observe these through the answers they
// produce; the tiers themselves are what ownership resolves by, so they are
// worth stating where they are decided.

test("a back-reference is resolved, and one sharing a segment with a capture is not", () => {
  // A resolved segment becomes a literal once the captures above it are bound,
  // which is what earns it the middle tier. Adding a placeholder to the same
  // segment takes that away: the result still has to be matched, so it is
  // dynamic and sorts last.
  const resolved = parseSegment("{provider}", "test");
  assert.equal(resolved.resolved, true);
  assert.equal(resolved.dynamic, false);

  const both = parseSegment("{provider}-[kind].ts", "test");
  assert.equal(both.resolved, false);
  assert.equal(both.dynamic, true);

  const plain = parseSegment("client.ts", "test");
  assert.equal(plain.resolved, false);
  assert.equal(plain.dynamic, false);
});

test("a resolved segment is a literal only once its capture is bound", () => {
  const segment = parseSegment("{provider}.ts", "test");
  // Nothing bound yet: the walk has not reached the placeholder it refers to.
  assert.equal(resolveSegment(segment, {}), null);
  assert.equal(resolveSegment(segment, { provider: "stripe" }), "stripe.ts");
  // An array capture cannot stand in for a segment of text.
  assert.equal(resolveSegment(segment, { provider: ["a", "b"] }), null);
});

test("a back-reference matches the text its placeholder bound, and nothing else", () => {
  const segment = parseSegment("{provider}-client.ts", "test");
  assert.deepEqual(matchSegment(segment, "stripe-client.ts", { provider: "stripe" }), {});
  assert.equal(matchSegment(segment, "twilio-client.ts", { provider: "stripe" }), null);
});

test("captures are text, arrays, or nothing at all", () => {
  // `[name]` produces a string, `[...name]` an array possibly empty, and a
  // segment with no placeholders an empty object rather than null — "matched,
  // captured nothing" is not the same answer as "did not match".
  assert.deepEqual(matchSegment(parseSegment("[a]-[b].ts", "test"), "x-y.ts"), { a: "x", b: "y" });
  assert.deepEqual(matchSegment(parseSegment("client.ts", "test"), "client.ts"), {});
  assert.equal(matchSegment(parseSegment("client.ts", "test"), "Client.ts"), null, "case matters");
  // A static segment is compared as a string, so its case-sensitivity is
  // structural. The literal parts of a *dynamic* segment go through a regular
  // expression, which is where the claim could quietly stop being true.
  assert.equal(matchSegment(parseSegment("Guide-[topic].md", "test"), "guide-intro.md"), null);
  assert.deepEqual(matchSegment(parseSegment("Guide-[topic].md", "test"), "Guide-intro.md"), {
    topic: "intro",
  });
});
