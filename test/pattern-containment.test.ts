// Checks the containment decision itself against independently constructed
// languages. Fixtures cannot exhaust pattern pairs or supply counterexamples
// to an unsound proof when no such filename exists in their repository.

import { test } from "node:test";
import assert from "node:assert/strict";
import { isStrictSubset, matchSegment, parseSegment, parseStructuralLeaf, type Segment } from "../src/pattern.js";

type Atom = { literal: string } | { capture: true } | { binding: string };
interface Pattern {
  atoms: Atom[];
  extensions?: string[];
}

const capture: Atom = { capture: true };
const literal = (text: string): Atom => ({ literal: text });
const binding = (name: string): Atom => ({ binding: name });

function source(pattern: Pattern): string {
  let index = 0;
  const stem = pattern.atoms.map((atom) => "literal" in atom
    ? atom.literal
    : "binding" in atom ? `{${atom.binding}}` : `[capture${index++}]`).join("");
  const extensions = pattern.extensions;
  return extensions === undefined ? stem : `${stem}.${extensions.length === 1
    ? extensions[0] : `{${extensions.join(",")}}`}`;
}

function compile(pattern: Pattern): Segment {
  return pattern.extensions === undefined
    ? parseSegment(source(pattern), "containment oracle")
    : parseStructuralLeaf(source(pattern), "containment oracle");
}

// This oracle uses neither the production parser's tokens nor its automata.
// Captures consume nonempty text; file captures additionally exclude dots.
// The final assertion is an absolute end anchor, including for newline names.
function oracle(pattern: Pattern, bound: Record<string, string> = {}): RegExp {
  const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const stem = pattern.atoms.map((atom) => "literal" in atom
    ? escape(atom.literal)
    : "binding" in atom ? escape(bound[atom.binding]!)
      : pattern.extensions === undefined ? "[\\s\\S]+" : "[^.]+").join("");
  const extension = pattern.extensions === undefined ? ""
    : `\\.(?:${pattern.extensions.map(escape).join("|")})`;
  return new RegExp(`^(?:${stem}${extension})$(?![\\s\\S])`);
}

function words(alphabet: string[], maxLength: number): string[] {
  const all = [""];
  let previous = [""];
  for (let length = 1; length <= maxLength; length++) {
    previous = previous.flatMap((prefix) => alphabet.map((char) => prefix + char));
    all.push(...previous);
  }
  return all;
}

function patterns(maxAtoms: number): Pattern[] {
  let previous: Atom[][] = [[]];
  const result: Pattern[] = [];
  for (let length = 1; length <= maxAtoms; length++) {
    previous = previous.flatMap((prefix) => [literal("a"), literal("b"), literal("."), capture]
      .map((atom) => [...prefix, atom]));
    result.push(...previous.filter((atoms) => atoms.some((atom) => "capture" in atom))
      .map((atoms) => ({ atoms })));
  }
  return result;
}

function signatures(patterns: Pattern[], names: string[], bound: Record<string, string> = {}): Uint32Array[] {
  return patterns.map((pattern) => {
    const matcher = oracle(pattern, bound);
    const bits = new Uint32Array(Math.ceil(names.length / 32));
    for (let index = 0; index < names.length; index++) {
      if (matcher.test(names[index]!)) bits[index >>> 5]! |= 1 << (index & 31);
    }
    return bits;
  });
}

function difference(left: Uint32Array, right: Uint32Array): number {
  for (let index = 0; index < left.length; index++) {
    const bits = (left[index]! & ~right[index]!) >>> 0;
    if (bits !== 0) return index * 32 + 31 - Math.clz32(bits & -bits);
  }
  return -1;
}

function checkMatrix(models: Pattern[], names: string[]): { proofs: number; conflicts: number } {
  const compiled = models.map(compile);
  const matched = signatures(models, names);
  const relation = models.map(() => new Uint8Array(models.length));
  let proofs = 0;
  let conflicts = 0;
  for (let i = 0; i < models.length; i++) {
    for (let j = 0; j < models.length; j++) {
      const counterexample = difference(matched[i]!, matched[j]!);
      const strictnessWitness = difference(matched[j]!, matched[i]!);
      const proven = isStrictSubset(compiled[i]!, compiled[j]!);
      relation[i]![j] = Number(proven);
      const label = `${source(models[i]!)} < ${source(models[j]!)}`;
      if (proven) {
        proofs++;
        assert.equal(counterexample, -1,
          `${label}: false containment at ${JSON.stringify(names[counterexample])}`);
        assert.notEqual(strictnessWitness, -1, `${label}: no strictness witness in the corpus`);
        assert.equal(isStrictSubset(compiled[j]!, compiled[i]!), false, `${label}: reverse proof`);
      } else if (counterexample !== -1 && strictnessWitness !== -1) {
        conflicts++;
      }
      // A finite corpus can refute inclusion but cannot prove it. In particular,
      // do not require a positive answer just because no witness was sampled.
      if (counterexample !== -1) assert.equal(proven, false, label);
      if (i === j) assert.equal(proven, false, `${label}: identity is not strict`);
    }
  }
  for (let i = 0; i < models.length; i++) {
    for (let j = 0; j < models.length; j++) {
      if (relation[i]![j] === 0) continue;
      for (let k = 0; k < models.length; k++) {
        if (relation[j]![k] === 0) continue;
        assert.equal(relation[i]![k], 1,
          `transitivity: ${source(models[i]!)} < ${source(models[j]!)} < ${source(models[k]!)}`);
      }
    }
  }
  return { proofs, conflicts };
}

test("exhaustive short directory patterns have no false containment proofs", () => {
  const models = patterns(3);
  const names = words(["a", "b", ".", "c"], 7);
  assert.equal(models.length, 45);
  assert.equal(names.length, 21845);
  const checked = checkMatrix(models, names);
  assert.ok(checked.proofs > 100, JSON.stringify(checked));
  assert.ok(checked.conflicts > 500, JSON.stringify(checked));
});

test("single-capture containment agrees exactly with independent affix inclusion", () => {
  // With one unrestricted, nonempty capture, inclusion has a closed form:
  // the narrower prefix extends the broader prefix, and likewise for suffixes.
  // Unlike bounded enumeration, this oracle checks both positive and negative
  // answers for the whole language, not only the sampled names.
  const affixes = ["", "a", "b", "ab", "ba", "a+b", " ", "😀", ".", "..", "\n"];
  const models = affixes.flatMap((prefix) => affixes.map((suffix) => ({
    prefix, suffix, segment: compile({ atoms: [literal(prefix), capture, literal(suffix)] }),
  })));
  for (const left of models) {
    for (const right of models) {
      const expected = left.prefix.startsWith(right.prefix) && left.suffix.endsWith(right.suffix)
        && (left.prefix !== right.prefix || left.suffix !== right.suffix);
      assert.equal(isStrictSubset(left.segment, right.segment), expected,
        `${left.segment.source} < ${right.segment.source}`);
    }
  }
});

test("each adjacent capture raises the minimum match length", () => {
  for (const extensions of [undefined, ["ts"], ["ts", "d.ts", "tsx"]]) {
    const models: Pattern[] = [1, 2, 3, 4].map((count) => ({ atoms: Array<Atom>(count).fill(capture), extensions }));
    const compiled = models.map(compile);
    for (let i = 0; i < models.length; i++) {
      for (let j = 0; j < models.length; j++) {
        assert.equal(isStrictSubset(compiled[i]!, compiled[j]!), i > j,
          `${source(models[i]!)} < ${source(models[j]!)}`);
      }
    }
  }
});

test("directory containment agrees with concrete matching across line terminators", () => {
  const broad = parseSegment("[world]", "newline agreement");
  for (const separator of ["\n", "\r", "\u2028", "\u2029"]) {
    const narrow = parseSegment(`line${separator}-[name]`, "newline agreement");
    const captured = `checks${separator}night`;
    const name = `line${separator}-${captured}`;
    assert.equal(isStrictSubset(narrow, broad), true);
    assert.deepEqual(matchSegment(narrow, name), { name: captured });
    assert.deepEqual(matchSegment(broad, name), { world: name });

    const referring = parseSegment("{provider}-[name]", "newline agreement");
    const provider = `acme${separator}eu`;
    const boundName = `${provider}-${captured}`;
    assert.equal(isStrictSubset(referring, broad), true);
    assert.deepEqual(matchSegment(referring, boundName, { provider }), { name: captured });
    assert.deepEqual(matchSegment(broad, boundName), { world: boundName });
  }
});

test("exhaustive structural stems and extension unions have no false proofs", () => {
  const extensions = [["a"], ["b"], ["a", "b"], ["a.a"], ["a", "a.a"], ["a", "a.a", "b"]];
  // A dot after the final capture starts the extension, not another stem
  // literal. Keep dotted stems only where a subsequent capture disambiguates.
  const stems = patterns(3).filter(({ atoms }) => {
    const lastCapture = atoms.findLastIndex((atom) => "capture" in atom);
    return !atoms.slice(lastCapture + 1).some((atom) => "literal" in atom && atom.literal.includes("."));
  });
  const models = stems.flatMap((pattern) => extensions.map((extensions) => ({ ...pattern, extensions })));
  const names = [...new Set(words(["a", "b", ".", "c"], 5)
    .flatMap((stem) => ["a", "b", "a.a", "b.a", "c"].map((extension) => `${stem}.${extension}`)))];
  assert.equal(models.length, 210);
  const checked = checkMatrix(models, names);
  assert.ok(checked.proofs > 1000, JSON.stringify(checked));
  assert.ok(checked.conflicts > 10000, JSON.stringify(checked));
});

function examples(pattern: Pattern, values: string[], bound: Record<string, string> = {}): string[] {
  let names = [""];
  for (const atom of pattern.atoms) {
    const choices = "literal" in atom ? [atom.literal]
      : "binding" in atom ? [bound[atom.binding]!]
        : values.filter((value) => value !== "" && (pattern.extensions === undefined || !value.includes(".")));
    names = names.flatMap((prefix) => choices.map((choice) => prefix + choice));
  }
  return pattern.extensions === undefined ? names
    : names.flatMap((name) => pattern.extensions!.map((extension) => `${name}.${extension}`));
}

test("back-reference proofs remain sound across independent and repeated bindings", () => {
  const p = binding("provider");
  const r = binding("region");
  const stems: Atom[][] = [
    [capture], [capture, capture],
    [p, capture], [p, literal("a"), capture], [capture, p], [capture, literal("a"), p],
    [p, capture, r], [p, literal("a"), capture, r],
    [p, capture, p], [p, literal("a"), capture, p],
    [capture, p, capture], [capture, r, capture],
    [p, capture, literal("."), r], [r, capture, p],
  ];
  const models: Pattern[] = stems.flatMap((atoms) => [
    { atoms }, { atoms, extensions: ["a"] }, { atoms, extensions: ["a", "a.a", "b"] },
  ]);
  const compiled = models.map(compile);
  const proofs = compiled.flatMap((left, i) => compiled.flatMap((right, j) =>
    isStrictSubset(left, right) ? [[i, j] as const] : []));
  assert.ok(proofs.length > 30, `${proofs.length} proofs`);
  const values = ["a", "b", "ab", "a.b", ".", "a+b", "😀", " ", "\n", "a\nb", "\u2028"];
  for (const provider of values) {
    for (const region of values) {
      const bound = { provider, region };
      const names = [...new Set(models.flatMap((model) => examples(model, ["a", "b", "ab", "a.b", "😀"], bound)))];
      const matched = signatures(models, names, bound);
      for (const [i, j] of proofs) {
        const label = `${source(models[i]!)} < ${source(models[j]!)} with ${JSON.stringify(bound)}`;
        const counterexample = difference(matched[i]!, matched[j]!);
        assert.equal(counterexample, -1, `${label}: ${JSON.stringify(names[counterexample])}`);
        assert.notEqual(difference(matched[j]!, matched[i]!), -1, `${label}: strictness`);
      }
    }
  }
});

test("capture renaming and extension permutation cannot create strict containment", () => {
  for (const pattern of patterns(3)) {
    const original = compile(pattern);
    const renamed = parseSegment(source(pattern).replace(/capture/g, "renamed"), "renaming oracle");
    assert.equal(isStrictSubset(original, renamed), false, source(pattern));
    assert.equal(isStrictSubset(renamed, original), false, source(pattern));
    const union = { ...pattern, extensions: ["a", "a.a", "b"] };
    const a = compile(union);
    const b = compile({ ...union, extensions: [...union.extensions].reverse() });
    assert.equal(isStrictSubset(a, b), false, source(union));
    assert.equal(isStrictSubset(b, a), false, source(union));
  }
});

test("seeded literal specializations remain strict for long and unusual names", () => {
  // A fixed seed makes every failure reproducible without a fuzzing dependency.
  const seed = 0x5e1ec70;
  let state = seed;
  const next = (): number => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
  const choose = <T>(values: T[]): T => values[next() % values.length]!;
  const literals = ["a", "b", "pre-", "-suffix", "+", "(", ")", "$", "^", "\\", "é", "😀", " ", "\n", "*", "?"];
  const values = ["a", "b", "ab", "a.b", "😀", "x+y", " ", "\n", "long-name".repeat(8)];
  const specialize = (pattern: Pattern): Pattern => {
    const atoms = [...pattern.atoms];
    const captures = atoms.flatMap((atom, index) => "capture" in atom ? [index] : []);
    const at = choose(captures);
    const extra = literal(choose(literals));
    atoms.splice(at, 1, ...((next() & 1) === 0 ? [extra, capture] : [capture, extra]));
    return { ...pattern, atoms };
  };
  for (let iteration = 0; iteration < 1000; iteration++) {
    const file = (next() & 1) === 0;
    const atoms: Atom[] = [];
    for (let at = 0, count = next() % 4; at < count; at++) atoms.push(literal(choose(literals)));
    atoms.push(capture);
    if ((next() & 1) === 0) atoms.push(literal(choose(literals)), capture);
    const broad: Pattern = !file ? { atoms }
      : { atoms, extensions: choose([["ts"], ["d.ts"], ["ts", "d.ts", "tsx"], ["up.sql", "down.sql"]]) };
    const middle = specialize(broad);
    const narrow = specialize(middle);
    const models = [narrow, middle, broad];
    const compiled = models.map(compile);
    const label = `seed ${seed}, iteration ${iteration}: ${models.map(source).join(" < ")}`;
    const names = [...new Set(models.flatMap((pattern) => examples(pattern, values)))];
    const matched = signatures(models, names);
    for (const [i, j] of [[0, 1], [1, 2], [0, 2]] as const) {
      assert.equal(isStrictSubset(compiled[i]!, compiled[j]!), true, label);
      assert.equal(isStrictSubset(compiled[j]!, compiled[i]!), false, `${label}: reverse`);
      const counterexample = difference(matched[i]!, matched[j]!);
      assert.equal(counterexample, -1, `${label}: ${JSON.stringify(names[counterexample])}`);
      assert.notEqual(difference(matched[j]!, matched[i]!), -1, `${label}: strictness`);
    }
  }
});
