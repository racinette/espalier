// The containment and overlap decisions in docs/MATCHING.MD "Ownership"
// and "Ambiguity is rejected". Fixtures pin ownership; these tests exercise
// the decision procedure directly, including uninstantiated pattern pairs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { intersects, intersectSegments, isStrictSubset, matchSegment, parseSegment, parseStructuralLeaf, resolveSegment } from "../src/pattern.js";

const shapeOf = (source: string): string => parseSegment(source, "test").shape;

const overlaps = (a: string, b: string): boolean => intersects(shapeOf(a), shapeOf(b));

test("dynamic patterns can overlap without being equivalent", () => {
  assert.equal(overlaps("[component].tsx", "[helper].tsx"), true);
  assert.equal(overlaps("[name].ts", "test-[name].ts"), true, `"test-a.ts" matches both`);
  assert.equal(overlaps("[name]-test.ts", "test-[name].ts"), true, `"test-x-test.ts" matches both`);
});

test("dynamic patterns with incompatible literals are disjoint", () => {
  assert.equal(overlaps("[component].tsx", "[helper].ts"), false, "no filename ends in both");
  assert.equal(overlaps("a-[x].ts", "b-[x].ts"), false);
});

test("dynamic specificity proves strict containment rather than counting literals", () => {
  for (const [narrow, broad] of [
    ["[name]-checksonly", "[world]"],
    ["prefix-special-[name]", "prefix-[name]"],
    ["[name]-special-checksonly", "[name]-checksonly"],
    ["[a][b]", "[name]"],
    ["prefix-[name]-suffix", "prefix-[name]"],
  ]) {
    const a = parseSegment(narrow!, "test");
    const b = parseSegment(broad!, "test");
    assert.equal(isStrictSubset(a, b), true, `${narrow} is narrower than ${broad}`);
    assert.equal(isStrictSubset(b, a), false, `${broad} is not narrower than ${narrow}`);
  }
  for (const [left, right] of [
    ["[name]", "[world]"],
    ["prefix-[name]", "[name]-suffix"],
    ["prefix1-[name]", "prefix2-[name]"],
    ["[name]-test", "test-[name]"],
  ]) {
    const a = parseSegment(left!, "test");
    const b = parseSegment(right!, "test");
    assert.equal(isStrictSubset(a, b), false);
    assert.equal(isStrictSubset(b, a), false);
  }
});

test("structural containment respects exact extensions and their unions", () => {
  const subset = (left: string, right: string): boolean =>
    isStrictSubset(parseStructuralLeaf(left, "test"), parseStructuralLeaf(right, "test"));
  assert.equal(subset("test-[name].ts", "[file].ts"), true);
  assert.equal(subset("[file].ts", "[file].{ts,tsx}"), true);
  assert.equal(subset("[file].{ts,tsx}", "[file].{ts,d.ts,tsx}"), true);
  assert.equal(subset("[file].{ts,tsx}", "[file].{tsx,ts}"), false);
  assert.equal(subset("[file].d.ts", "[file].ts"), false);
  assert.equal(subset("[file].{ts,d.ts}", "[file].{ts,tsx}"), false);
  assert.equal(subset("foo.[file].ts", "[file].ts"), false);
  assert.equal(subset("[file].ts", "[name]"), true);
});

test("containment treats shared back-references as bound text", () => {
  const subset = (left: string, right: string): boolean =>
    isStrictSubset(parseStructuralLeaf(left, "test"), parseStructuralLeaf(right, "test"));
  assert.equal(subset("{provider}-test-[case].ts", "{provider}-[kind].ts"), true);
  assert.equal(subset("test-[case]-{provider}.ts", "[kind]-{provider}.ts"), true);
  assert.equal(subset("{provider}-[kind]", "[name]"), true);
  // A dotted binding would fall outside a .ts capture. Different bindings
  // are independent even when their wildcard approximations look identical.
  assert.equal(subset("{provider}-[kind].ts", "[file].ts"), false);
  assert.equal(subset("{provider}-test-[case].ts", "{region}-[kind].ts"), false);
  assert.equal(subset("{provider}-[kind].ts", "{provider}-[case].ts"), false);
});

test("a placeholder matches one character or more", () => {
  const segment = parseSegment("[button].tsx", "test");
  assert.deepEqual(matchSegment(segment, "Submit.tsx"), { button: "Submit" });
  assert.equal(matchSegment(segment, ".tsx"), null, "a bare extension is not a match");

  // A literal prefix narrows a shape but rarely separates it: "aX.ts"
  // satisfies both of these, so they still overlap.
  assert.equal(overlaps("[a].ts", "a[b].ts"), true);
});

test("structural filename captures stop before their complete extension", () => {
  const plain = parseStructuralLeaf("[file].ts", "test");
  const declaration = parseStructuralLeaf("[file].d.ts", "test");
  const union = parseStructuralLeaf("[file].{ts,d.ts,tsx}", "test");
  assert.deepEqual(matchSegment(plain, "foo.ts"), { file: "foo" });
  assert.equal(matchSegment(plain, "foo.d.ts"), null);
  assert.equal(matchSegment(plain, "foo.test.ts"), null);
  assert.deepEqual(matchSegment(declaration, "foo.d.ts"), { file: "foo" });
  assert.deepEqual(matchSegment(union, "foo.d.ts"), { file: "foo" });
  assert.equal(matchSegment(union, "foo.test.ts"), null);
  assert.equal(intersectSegments(plain, declaration), false);
  assert.equal(intersectSegments(plain, union), true);
  assert.throws(() => parseStructuralLeaf("main.{ts,tsx}", "test"), /requiredness is ambiguous/);
});

test("structural extension unions preserve literal and captured line terminators", () => {
  for (const separator of ["\n", "\r", "\u2028", "\u2029"]) {
    const segment = parseStructuralLeaf(`line${separator}-[file].{ts,d.ts,tsx}`, "test");
    assert.deepEqual(segment.fileExtensions, ["ts", "d.ts", "tsx"]);
    for (const extension of ["ts", "d.ts", "tsx"]) {
      const captured = `checks${separator}night`;
      assert.deepEqual(matchSegment(segment, `line${separator}-${captured}.${extension}`), { file: captured });
    }
    assert.equal(matchSegment(segment, `line${separator}-checks.extra.ts`), null);
    assert.equal(matchSegment(segment, `line${separator}-.ts`), null);
  }
});

test("sibling overlap keeps back-references free to contain dots", () => {
  const referring = parseStructuralLeaf("[file]-{provider}.ts", "test");
  const compound = parseStructuralLeaf("[file].bar.ts", "test");
  assert.deepEqual(matchSegment(referring, "x-foo.bar.ts", { provider: "foo.bar" }), { file: "x" });
  assert.deepEqual(matchSegment(compound, "x-foo.bar.ts"), { file: "x-foo" });
  assert.equal(intersectSegments(referring, compound), true);
});

test("a single braced name remains a back-reference, not an extension union", () => {
  const rule = parseStructuralLeaf("[file].{provider}.ts", "test");
  assert.deepEqual(matchSegment(rule, "x.foo.bar.ts", { provider: "foo.bar" }), { file: "x" });
  assert.equal(matchSegment(rule, "x.foo.bar.ts", { provider: "other" }), null);
  const noFixedExtension = parseStructuralLeaf("[file].{provider}", "test");
  assert.deepEqual(matchSegment(noFixedExtension, "x.foo.bar", { provider: "foo.bar" }), { file: "x" });
});

test("sibling overlap preserves shared back-reference prefixes and suffixes", () => {
  const overlap = (a: string, b: string): boolean =>
    intersectSegments(parseStructuralLeaf(a, "test"), parseStructuralLeaf(b, "test"));
  for (const [a, b] of [
    ["{client}.ts", "{client}.test.ts"],
    ["entry-{client}.ts", "entry-{client}.test.ts"],
    ["{client}.ts", "test.{client}.ts"],
    ["{client}-{region}.ts", "{client}-{region}.test.ts"],
  ]) {
    assert.equal(overlap(a!, b!), false, `${a} and ${b}`);
    assert.equal(overlap(b!, a!), false, `${b} and ${a}`);
  }
  assert.equal(overlap("{client}.ts", "{client}.ts"), true);
  assert.equal(overlap("{region}.ts", "{provider}.ts"), true);
  assert.equal(overlap("{client}.ts", "{provider}.test.ts"), true);
  assert.equal(overlap("{client}[name].ts", "{client}test-[name].ts"), true);
  assert.equal(overlap("{client}a.ts", "a{client}.ts"), true);
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
