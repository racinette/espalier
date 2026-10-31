// The containment and overlap decisions in docs/MATCHING.MD "Ownership"
// and "Ambiguity is rejected". Fixtures pin ownership; these tests exercise
// the decision procedure directly, including uninstantiated pattern pairs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { ambiguousSplit, captureNames, commonName, intersectSegments, isStrictSubset, matchSegment, optionalCaptureNames, parseSegment, parseStructuralLeaf, resolveSegment, trieKey } from "../src/pattern.js";

const overlaps = (a: string, b: string): boolean => intersectSegments(parseSegment(a, "test"), parseSegment(b, "test"));

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
    ["[a=0+][b=a+]", "[name]"],
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

test("the trie keys a segment by what it admits, not by its placeholder names", () => {
  const key = (source: string): string => trieKey(parseSegment(source, "test"));
  assert.equal(key("clients"), "clients");
  assert.equal(key("[provider]"), key("[vendor]"));
  assert.equal(key("test-[name].ts"), key("test-[module].ts"));
  assert.notEqual(key("test-[name].ts"), key("[name].ts"));
  assert.notEqual(key("[a][b=00]"), key("[a=00][b]"), "adjacent captures keep their order");
  assert.equal(key("[...path]"), key("[...rest]"));
  assert.notEqual(key("{provider}.ts"), key("{vendor}.ts"), "back-references are two rules");
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
  assert.deepEqual(matchSegment(parseSegment("[a=a+]-[b].ts", "test"), "x-y.ts"), { a: "x", b: "y" });
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

// docs/MATCHING.MD "Masks" and "Captures must be unambiguous".

const leaf = (source: string) => parseStructuralLeaf(source, "test");

test("a mask constrains what a capture accepts, and a list names the alternatives", () => {
  const padded = leaf("[seq=0(6)]_[name=x+].tables.sql");
  assert.deepEqual(matchSegment(padded, "000100_init.tables.sql"), { seq: "000100", name: "init" });
  assert.equal(matchSegment(padded, "abc_init.tables.sql"), null, "letters are not digits");
  assert.equal(matchSegment(padded, "0001000_init.tables.sql"), null, "the width is exact");
  assert.equal(matchSegment(padded, "000100_Init.tables.sql"), null, "x is lowercase");
  assert.deepEqual(matchSegment(leaf("[seq=0+]_[name].tables.sql"), "7_init.tables.sql"), { seq: "7", name: "init" });
  assert.deepEqual(matchSegment(parseSegment("[n=0(4)#(2)]", "test"), "12345"), { n: "12345" }, "# is an optional digit");
  assert.equal(matchSegment(parseSegment("[n=0(4)#(2)]", "test"), "1234567"), null);
  assert.deepEqual(matchSegment(parseSegment("[n=0000##]", "test"), "1234"), { n: "1234" }, "written out means the same");
  assert.deepEqual(matchSegment(parseSegment("[code=AAA]-[n=00]", "test"), "ABC-42"), { code: "ABC", n: "42" });
  assert.deepEqual(matchSegment(leaf("[day=0(4)-0(2)-0(2)]_[t].md"), "2024-01-31_launch.md"), { day: "2024-01-31", t: "launch" }, "literals belong to the value");
  assert.deepEqual(matchSegment(leaf("[kind={tables,views}].sql"), "views.sql"), { kind: "views" });
  assert.equal(matchSegment(leaf("[kind={tables,views}].sql"), "other.sql"), null);
  assert.equal(matchSegment(leaf("[kind={tables,views}].sql"), "Views.sql"), null, "alternatives are case-sensitive");
});

test("masks are rejected when they are not in the vocabulary", () => {
  for (const [bad, reason] of [
    ["[a=]", /cannot be empty/],
    ["[a=9]", /"9" is not a mask character/],
    ["[a=+0]", /nothing precedes it/],
    ["[a=0(x)]", /count/],
    ["[a=0(0)]", /count/],
    ["[a=0(..)]", /count or a range/],
    ["[a=0(01..3)]", /count or a range/],
    ["[a=0(3..3)]", /smaller count before/],
    ["[a=0(4..2)]", /smaller count before/],
    ["[a=0(2..6)+]", /cannot follow another repetition/],
    ["[a=0(2..)+]", /cannot follow another repetition/],
    ["[a=0(..6)]", /must require at least one character/],
    ["[a=kebab-case]", /"e" is not a mask character.*a case style is written "\[a@kebab\]"/],
    ["[a=snake]", /a case style follows "@", as in "\[a@snake\]"/],
    ["[a@kebab-case]", /"kebab-case" is not a case style; it is written "kebab"/],
    ["[a@snake_case]", /it is written "snake"/],
    ["[a@Snake]", /it is written "snake"/],
    ["[a@SCREAMING_SNAKE_CASE]", /it is written "SNAKE"/],
    ["[a@PascalCase]", /it is written "Pascal"/],
    ["[a@pascal]", /it is written "Pascal"/],
    ["[a@camelCase]", /it is written "camel"/],
    ["[a@a+]", /"a\+" is not a case style; the case styles are kebab, snake, KEBAB, SNAKE, camel, Pascal/],
    ["{a@snake}", /carries no mask or case style/],
    ["[a=L]", /a letter of either case is "l"/],
    ["[a=W+]", /a letter or digit of either case is "w"/],
    ["[a=0++]", /cannot follow another repetition/],
    ["[a=0.0]", /"\." is not a mask character/],
    ["[a=#]", /must require at least one character/],
    ["[a=#+]", /must require at least one character/],
    ["[a={x}]", /at least two alternatives/],
    ["[a={x,}]", /cannot be empty/],
    ["[a={x,x}]", /repeats an alternative/],
    ["[a={x,y]", /unclosed/],
    ["[a={x,y.z}]", /not a plain name/],
    ["{a=0}", /back-reference/],
  ] as const) {
    assert.throws(() => parseSegment(bad, "test"), { code: "malformed_placeholder", message: reason }, bad);
  }
});

test("a lowercase mask character means lowercase and a capital capitals; l and w mean either case", () => {
  const accepts = (mask: string, text: string): boolean => matchSegment(parseSegment(`[n=${mask}]`, "test"), text) !== null;
  const table: [string, string[], string[]][] = [
    ["a+", ["usa"], ["USA", "Usa", "u1"]],
    ["A+", ["USA"], ["usa", "Usa", "U1"]],
    ["l+", ["usa", "USA", "uSa"], ["u1"]],
    ["x+", ["ab12"], ["AB12"]],
    ["X+", ["AB12"], ["ab12"]],
    ["w(11)", ["dQw4w9WgXcQ"], ["dQw4w9WgXc-"]],
    ["h(8)", ["3f9a2c1b"], ["3F9A2C1B", "3g9a2c1b"]],
    ["H(8)", ["3F9A2C1B"], ["3f9a2c1b", "3G9A2C1B"]],
  ];
  for (const [mask, yes, no] of table) {
    for (const text of yes) assert.equal(accepts(mask, text), true, `${mask} accepts ${text}`);
    for (const text of no) assert.equal(accepts(mask, text), false, `${mask} rejects ${text}`);
  }
  assert.equal(isStrictSubset(leaf("[n=h+].ts"), leaf("[n=x+].ts")), true, "hex letters are lowercase letters");
  assert.equal(commonName(leaf("[n=h+]-g.ts"), leaf("[n=a+]-g.ts")), "a-g.ts", "a to f are letters");
  assert.equal(commonName(leaf("[n=h+].ts"), leaf("[n=H+].ts")), "0.ts", "digits are hex of either case");
  assert.equal(intersectSegments(leaf("[n=a+].ts"), leaf("[n=A+].ts")), false);
});

test("a range repeats the element before it between two counts, either one left open", () => {
  const accepts = (source: string, text: string): boolean => matchSegment(parseSegment(source, "test"), text) !== null;
  assert.deepEqual(["1", "12", "1234", "12345"].map((text) => accepts("[n=0(2..4)]", text)), [false, true, true, false]);
  assert.deepEqual(["ab", "abc", "abcdefgh"].map((text) => accepts("[n=a(3..)]", text)), [false, true, true]);
  assert.deepEqual(["B", "B1", "B12", "B123"].map((text) => accepts("[n=A0(..2)]", text)), [true, true, true, false], "a range from nothing");
  assert.deepEqual(["1", "1a", "1abc", "a"].map((text) => accepts("[n=0a(0..)]", text)), [true, true, true, false], "a(0..) is any number of letters");
  assert.deepEqual(matchSegment(parseSegment("[n=0(3)+]", "test"), "1234"), { n: "1234" }, "(n)+ is still n or more");
  assert.equal(isStrictSubset(leaf("[n=0(2..4)].ts"), leaf("[n=0(1..5)].ts")), true);
  assert.equal(isStrictSubset(leaf("[n=0(2..)].ts"), leaf("[n=0+].ts")), true);
  assert.equal(isStrictSubset(leaf("[n=0(1..)].ts"), leaf("[n=0+].ts")), false, "the same language");
  assert.equal(ambiguousSplit(leaf("[a=0(2..4)][b=a(..2)0].ts")), null);
  assert.deepEqual(ambiguousSplit(leaf("[a=0(2..4)][b=0].ts")), null, "b takes the last digit");
  assert.notEqual(ambiguousSplit(leaf("[a=0(2..4)][b=0(1..2)].ts")), null, "12345 splits as 123|45 or 1234|5");
});

test("k, K, s and S admit the characters of kebab and snake names, and nothing about their order", () => {
  const accepts = (mask: string, text: string): boolean => matchSegment(parseSegment(`[n=${mask}]`, "test"), text) !== null;
  const table: [string, string[], string[]][] = [
    ["k+", ["user-id", "utf-8", "---", "-a-"], ["User", "user_id", "a.b"]],
    ["K+", ["MAX-RETRIES", "UTF-8", "---"], ["Max", "MAX_RETRIES"]],
    ["s+", ["user_id", "utf_8", "___"], ["User", "user-id"]],
    ["S+", ["MAX_RETRIES", "HTTP2", "___"], ["Max_Retries", "MAX-RETRIES"]],
  ];
  for (const [mask, yes, no] of table) {
    for (const text of yes) assert.equal(accepts(mask, text), true, `${mask} accepts ${text}`);
    for (const text of no) assert.equal(accepts(mask, text), false, `${mask} rejects ${text}`);
  }
  assert.equal(isStrictSubset(leaf("[n@kebab].ts"), leaf("[n=k+].ts")), true, "the style orders the characters k admits");
  assert.equal(isStrictSubset(leaf("[n=x+].ts"), leaf("[n=k+].ts")), true);
  assert.equal(commonName(leaf("[n=k+].ts"), leaf("[n=K+].ts")), "0.ts", "digits are both lowercase and screaming");
  assert.equal(commonName(leaf("[n=k+]x.ts"), leaf("[n=s+]x.ts")), "ax.ts");
  assert.equal(ambiguousSplit(leaf("[a=k+]-[b=0+].ts")), null, "the digits after the last dash");
  assert.deepEqual(ambiguousSplit(leaf("[a=s+]_[b].ts"))?.text, "a__a.ts");
});

test("a case style names a naming convention, leniently about capitals and digits", () => {
  const accepts = (style: string, text: string): boolean => matchSegment(parseSegment(`[n@${style}]`, "test"), text) !== null;
  const table: [string, string[], string[]][] = [
    ["kebab", ["user", "user-id", "utf-8", "a1-b2"], ["User", "user_id", "userId", "user--id", "-user", "user-", "1-user"]],
    ["snake", ["user", "user_id", "utf_8"], ["User", "user-id", "userId", "user__id", "_user", "user_"]],
    ["camel", ["user", "userId", "parseHTML", "v2Api"], ["User", "user-id", "user_id", "2fa"]],
    ["Pascal", ["User", "UserId", "HTMLParser", "V2"], ["user", "User-Id", "User_Id", "2Fa"]],
    ["KEBAB", ["USER", "USER-ID", "UTF-8"], ["User", "user-id", "USER_ID", "USER--ID", "1-USER"]],
    ["SNAKE", ["MAX", "MAX_RETRIES", "HTTP2"], ["Max", "max_retries", "MAX-RETRIES", "MAX__RETRIES", "_MAX"]],
  ];
  for (const [style, yes, no] of table) {
    for (const text of yes) assert.equal(accepts(style, text), true, `${style} accepts ${text}`);
    for (const text of no) assert.equal(accepts(style, text), false, `${style} rejects ${text}`);
  }
  assert.deepEqual(matchSegment(leaf("[Name@Pascal].test.tsx"), "HTMLView.test.tsx"), { Name: "HTMLView" });
});

test("an overlap is shown by the shortest name both segments match", () => {
  assert.equal(commonName(leaf("[n@kebab].ts"), leaf("[n@camel].ts")), "a.ts");
  assert.equal(commonName(leaf("[name]-test.ts"), leaf("test-[name].ts")), "test-test.ts");
  assert.equal(commonName(leaf("[n@Pascal].ts"), leaf("[n@camel].ts")), null, "disjoint");
  assert.equal(commonName(parseSegment("{a}-[x]", "test"), parseSegment("[y]-{a}", "test")), null, "a back-reference is one instance's value");
});

test("case styles narrow for containment, overlap on one lowercase word, and split like any capture", () => {
  assert.equal(isStrictSubset(leaf("[n@kebab].ts"), leaf("[n].ts")), true);
  assert.equal(isStrictSubset(leaf("[n=a+].ts"), leaf("[n@kebab].ts")), true, "one lowercase word is kebab-case");
  assert.equal(isStrictSubset(leaf("[n@kebab].ts"), leaf("[n=x+].ts")), false, "dashes are not letters");
  assert.equal(isStrictSubset(leaf("[n@camel].ts"), leaf("[n=w+].ts")), true);
  assert.equal(isStrictSubset(leaf("[n@Pascal].ts"), leaf("[n=w+].ts")), true);
  assert.equal(isStrictSubset(leaf("[n@SNAKE].ts"), leaf("[n=S+].ts")), true);
  assert.equal(intersectSegments(leaf("[n@SNAKE].ts"), leaf("[n@snake].ts")), false, "the first letter decides");
  assert.equal(intersectSegments(leaf("[n@KEBAB].ts"), leaf("[n@SNAKE].ts")), true, "one capital word is both");
  assert.equal(intersectSegments(leaf("[n@kebab].ts"), leaf("[n@camel].ts")), true, "user.ts is both");
  assert.equal(intersectSegments(leaf("[n@kebab].ts"), leaf("[n@snake].ts")), true);
  assert.equal(intersectSegments(leaf("[n@Pascal].ts"), leaf("[n@camel].ts")), false, "the first letter decides");
  assert.equal(intersectSegments(leaf("[n@Pascal].ts"), leaf("[n@kebab].ts")), false);
  assert.notEqual(trieKey(leaf("[n@kebab].ts")), trieKey(leaf("[n@snake].ts")));
  assert.equal(ambiguousSplit(leaf("[a@kebab]_[b@kebab].ts")), null, "kebab-case has no underscore");
  assert.equal(ambiguousSplit(leaf("[a@snake]-[b@Pascal].ts")), null);
  assert.deepEqual(ambiguousSplit(leaf("[a@kebab]-[b].ts"))?.parses, [{ a: "a", b: "a-a" }, { a: "a-a", b: "a" }]);
  assert.notEqual(ambiguousSplit(leaf("[a@camel][B@Pascal].ts")), null, "fooBarBaz splits at either capital");
});

test("a mask narrows a capture for containment, and the trie keys on it", () => {
  const exact = leaf("[seq=0(6)]_[name].sql");
  const digits = leaf("[seq=0+]_[name].sql");
  const stem = leaf("[stem].sql");
  assert.equal(isStrictSubset(exact, digits), true);
  assert.equal(isStrictSubset(digits, stem), true);
  assert.equal(isStrictSubset(exact, stem), true);
  assert.equal(isStrictSubset(stem, digits), false);
  assert.equal(isStrictSubset(digits, exact), false);
  assert.equal(isStrictSubset(leaf("[k={tables,views}].sql"), leaf("[k=a+].sql")), true, "a list is a finite language");
  assert.equal(isStrictSubset(leaf("[s=a+].sql"), leaf("[s=w+].sql")), true, "lowercase letters are letters or digits");
  assert.equal(intersectSegments(leaf("[s=0+].sql"), leaf("[s=a+].sql")), false, "digits and letters are disjoint");
  assert.equal(intersectSegments(leaf("[s=w+].sql"), leaf("[s=a+].sql")), true);
  assert.equal(intersectSegments(leaf("[s=X+].sql"), leaf("[s=a+].sql")), false, "X is capitals");
  assert.equal(trieKey(leaf("[seq=0(6)]_[name].sql")), trieKey(leaf("[n=0(6)]_[x].sql")), "names do not key");
  assert.notEqual(trieKey(leaf("[seq=0(6)]_[name].sql")), trieKey(leaf("[seq]_[name].sql")), "masks do");
});

test("a segment whose captures could split a name two ways is reported with the name", () => {
  const split = (source: string) => ambiguousSplit(source.includes(".") ? leaf(source) : parseSegment(source, "test"));
  assert.equal(split("[a=0+]_[b].sql"), null);
  assert.equal(split("[a]_[b=0+].sql"), null, "the underscore has to follow a");
  assert.equal(split("[a=0(6)]_[b].sql"), null);
  assert.equal(split("[a=x+]-[b=x+].sql"), null);
  assert.equal(split("[a]-{b}"), null, "a back-reference is opaque text");
  assert.equal(split("[name].ts"), null);
  assert.deepEqual(split("[a][b].sql"), { text: "aaa.sql", parses: [{ a: "a", b: "aa" }, { a: "aa", b: "a" }] });
  const underscore = split("[a]_[b].sql");
  assert.ok(underscore !== null && underscore.parses.length === 2);
  assert.deepEqual(underscore.parses.map((parse) => `${parse.a}_${parse.b}`), [underscore.text.slice(0, -4), underscore.text.slice(0, -4)]);
  assert.ok(split("[a]_[b=0+]_[c].sql") !== null, "b can take either digit run");
  assert.ok(split("[a=0#][b=0+]") !== null, "an optional digit can go either way");
  assert.ok(split("[k={ab,abc}][x=a+]") !== null, "a list alternative that prefixes another");
  assert.equal(split("[k={ab,cd}][x=0+]"), null);
});

test("a literal name keeps its brackets as text and matches nothing else", () => {
  const slug = parseSegment("[slug]", "test", { literal: true });
  assert.equal(slug.dynamic, false);
  assert.equal(slug.literal, true);
  assert.deepEqual(matchSegment(slug, "[slug]"), {});
  assert.equal(matchSegment(slug, "post"), null);
  assert.notEqual(trieKey(slug), trieKey(parseSegment("[route]", "test")), "a literal never shares a node with a placeholder");
  const page = parseStructuralLeaf("[[...slug]].tsx", "test", { literal: true });
  assert.deepEqual(matchSegment(page, "[[...slug]].tsx"), {});
  assert.equal(page.fileExtensions, undefined, "a literal filename has no extension selector");
  assert.throws(() => parseStructuralLeaf("[[...slug]].tsx", "test"), /capture name/);
});

test("alternatives match exactly one branch, and an empty one makes a part optional", () => {
  const leaf = parseStructuralLeaf("[num=00000][ord=00]_[table=a+].[kind={tables,indexes,grants}]{,.[role=a+]}.sql", "test");
  assert.deepEqual(matchSegment(leaf, "0000900_user.tables.sql"), { num: "00009", ord: "00", table: "user", kind: "tables" });
  assert.deepEqual(matchSegment(leaf, "0000902_user.grants.admin.sql"), { num: "00009", ord: "02", table: "user", kind: "grants", role: "admin" });
  assert.equal(matchSegment(leaf, "0000902_user.grants.admin.extra.sql"), null, "captures stay dot-free in a filename with an extension");
  assert.equal(matchSegment(leaf, "0000902_user.grants..sql"), null);
  // A capture in an untaken branch is absent, not "".
  assert.equal("role" in matchSegment(leaf, "0000901_user.indexes.sql")!, false);
});

test("a capture is optional when some alternative leaves it out, and one name across branches is one capture", () => {
  const optional = parseSegment("[name]{,-[tag]}", "test");
  assert.deepEqual(captureNames(optional), ["name", "tag"]);
  assert.deepEqual(optionalCaptureNames(optional), ["tag"]);
  const both = parseSegment("{[x=a+]-a,b-[x=0+]}", "test");
  assert.deepEqual(captureNames(both), ["x"]);
  assert.deepEqual(optionalCaptureNames(both), []);
  assert.deepEqual(matchSegment(both, "q-a"), { x: "q" });
  assert.deepEqual(matchSegment(both, "b-12"), { x: "12" });
});

test("alternatives may hold back-references, and the trie keys them by what they admit", () => {
  const segment = parseSegment("{x,{team}-[n=0+]}", "test");
  assert.deepEqual(matchSegment(segment, "core-12", { team: "core" }), { n: "12" });
  assert.equal(matchSegment(segment, "other-1", { team: "core" }), null);
  assert.equal(trieKey(parseSegment("[a]{,.[b]}", "test")), trieKey(parseSegment("[c]{,.[d]}", "test")));
  assert.notEqual(trieKey(parseSegment("[a]{,.[b]}", "test")), trieKey(parseSegment("[a]{.[b],}", "test")));
});

test("alternatives take part in overlap and containment like any other branch", () => {
  const narrow = parseStructuralLeaf("[n=a+].x.md", "test");
  const broad = parseStructuralLeaf("[n=a+]{,.x}.md", "test");
  assert.equal(isStrictSubset(narrow, broad), true);
  assert.equal(isStrictSubset(broad, narrow), false);
  assert.equal(overlaps("[a]{,.x}.md", "[a]{.x,}.md"), true);
  assert.equal(isStrictSubset(parseSegment("[a]{,.x}.md", "test"), parseSegment("[a]{.x,}.md", "test")), false);
});

test("two alternatives that can match one name are an ambiguous split", () => {
  const split = ambiguousSplit(parseStructuralLeaf("{[x]-a,b-[x]}.md", "test"));
  assert.equal(split?.text, "b-a.md");
  assert.deepEqual(split?.parses, [{ x: "b" }, { x: "a" }]);
  assert.equal(ambiguousSplit(parseStructuralLeaf("[t=a+].[k={a,b}]{,.[r=a+]}.sql", "test")), null);
});
