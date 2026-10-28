// Path segments and what they match. A direct transcription of
// docs/MATCHING.MD "Placeholders" and "Ambiguity is rejected".

import { fail } from "./errors.js";

/** A `[name]` captures a string; a `[...name]` captures the segments it spanned. */
export type CaptureValue = string | string[];

/** One character class of a mask. docs/MATCHING.MD "Masks". */
export type MaskClass = "digit" | "letter" | "lower" | "alnum" | "lowerAlnum";

/** One element of a mask, after `(n)` has been expanded into n copies. */
export interface MaskElement {
  match: { kind: "class"; cls: MaskClass } | { kind: "char"; char: string };
  /** `#`, or any element followed by `+` after `#`: may match nothing. */
  optional: boolean;
  /** Followed by `+`: may repeat. */
  many: boolean;
}

/** What a `[name=…]` accepts: a mask, or a list of literal names. */
export type Constraint =
  | { kind: "mask"; source: string; elements: MaskElement[] }
  | { kind: "list"; source: string; values: string[] };

export type Part =
  | { kind: "literal"; text: string }
  | { kind: "capture"; name: string; constraint?: Constraint }
  | { kind: "backref"; name: string };

export interface Segment {
  /** As authored: `clients`, `[provider]`, `test-[name].ts`, `[...path]`. */
  source: string;
  /** Empty for a recursive segment. */
  parts: Part[];
  /** The capture name when this segment is exactly `[...name]`. */
  recursive: string | null;
  /**
   * Literals with every capture replaced by `*`. Two segments with the same
   * shape are the same node in the trie — which is what makes
   * `clients/[provider]` and `clients/[vendor]` a contradiction rather than
   * two directories.
   */
  shape: string;
  /** Contains a `[name]`, so it matches many. */
  dynamic: boolean;
  /**
   * Contains a `{name}` and no `[name]`, so it becomes one literal as soon as
   * the captures above it are bound. docs/MATCHING.MD "Back-references".
   *
   * A segment holding both is dynamic, not resolved: it still matches many,
   * and the tier is decided by how many files a segment can name.
   */
  resolved: boolean;
  /** Structural file leaf before its exact, possibly compound extension. */
  fileStem?: Segment;
  /** Exact extensions accepted by one dynamic structural rule. */
  fileExtensions?: string[];
  /** Captures in an extension-bearing structural filename cannot consume dots. */
  dotlessCaptures?: boolean;
}

const CAPTURE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

const MASK_CLASSES: Record<string, MaskClass> = {
  "0": "digit",
  "#": "digit",
  A: "letter",
  a: "lower",
  X: "alnum",
  x: "lowerAlnum",
};

/** `(n)` and `+` apply to the element before them, so an element is parsed and then possibly repeated. */
function parseMask(source: string, context: string, placeholder: string): Constraint {
  const elements: MaskElement[] = [];
  const bad = (reason: string): never =>
    fail("malformed_placeholder", `${placeholder}: ${reason} (${context})`);
  if (source === "") bad("a mask after \"=\" cannot be empty");
  for (let i = 0; i < source.length; ) {
    const char = source[i]!;
    let element: MaskElement;
    if (char in MASK_CLASSES) {
      element = { match: { kind: "class", cls: MASK_CLASSES[char]! }, optional: char === "#", many: false };
    } else if (char === "-" || char === "_") {
      element = { match: { kind: "char", char }, optional: false, many: false };
    } else if (char === "+" || char === "(") {
      return bad(`"${char}" repeats the mask element before it, and nothing precedes it`);
    } else {
      return bad(`"${char}" is not a mask character; the mask vocabulary is 0 # A a X x - _ with + and (n) for repetition`);
    }
    i += 1;
    let count = 1;
    if (source[i] === "(") {
      const close = source.indexOf(")", i);
      const digits = close === -1 ? "" : source.slice(i + 1, close);
      if (!/^[1-9][0-9]*$/.test(digits)) return bad(`"(" must be followed by a count and ")"`);
      count = Number(digits);
      i = close + 1;
    }
    if (source[i] === "+") {
      element.many = true;
      i += 1;
    }
    if (source[i] === "(" || source[i] === "+") return bad(`"${source[i]}" cannot follow another repetition`);
    for (let n = 0; n < count; n += 1) elements.push({ ...element });
  }
  if (!elements.some((element) => !element.optional)) {
    bad("a mask must require at least one character; \"#\" and \"#+\" alone match nothing");
  }
  return { kind: "mask", source, elements };
}

/** `{a,b}`: literal alternatives, at least two, built from name characters and the two mask literals. */
function parseList(source: string, context: string, placeholder: string): Constraint {
  const bad = (reason: string): never =>
    fail("malformed_placeholder", `${placeholder}: ${reason} (${context})`);
  if (!source.endsWith("}")) return bad("an unclosed \"{\" in a list");
  const values = source.slice(1, -1).split(",");
  if (values.length < 2) return bad("a list needs at least two alternatives; one alternative is a static name");
  for (const value of values) {
    if (value === "") return bad("a list alternative cannot be empty");
    if (!/^[A-Za-z0-9_-]+$/.test(value)) return bad(`"${value}" is not a plain name; list alternatives use letters, digits, "-" and "_"`);
  }
  if (new Set(values).size !== values.length) return bad("a list repeats an alternative");
  return { kind: "list", source, values };
}

/** `name` or `name=constraint`, the inside of a `[…]` that is not recursive. */
function parseCapture(inner: string, context: string): { name: string; constraint?: Constraint } {
  const equals = inner.indexOf("=");
  const name = equals === -1 ? inner : inner.slice(0, equals);
  if (!CAPTURE_NAME.test(name)) {
    fail("malformed_placeholder", `"[${inner}]" is not a valid capture name (${context})`);
  }
  if (equals === -1) return { name };
  const rest = inner.slice(equals + 1);
  const placeholder = `"[${inner}]"`;
  const constraint = rest.startsWith("{") ? parseList(rest, context, placeholder) : parseMask(rest, context, placeholder);
  return { name, constraint };
}

/**
 * `backrefs` is false for a constraint leaf, where braces are an extension
 * list instead. The two positions are disjoint, so nothing has to be
 * disambiguated by content. docs/MATCHING.MD "Multiple extensions".
 */
export function parseSegment(
  source: string,
  context: string,
  options: { backrefs?: boolean; dotlessCaptures?: boolean } = {},
): Segment {
  const backrefs = options.backrefs !== false;
  const parts: Part[] = [];
  let recursive: string | null = null;
  let literal = "";

  for (let i = 0; i < source.length; ) {
    const char = source[i]!;

    if (char === "]") {
      fail("malformed_placeholder", `unmatched "]" in "${source}" (${context})`);
    }

    if (backrefs && char === "{") {
      const close = source.indexOf("}", i);
      if (close === -1) {
        fail("malformed_placeholder", `unclosed "{" in "${source}" (${context})`);
      }
      const inner = source.slice(i + 1, close);
      // The mistake worth naming: braces holding a list, written where only a
      // back-reference can go.
      if (inner.includes(",")) {
        fail(
          "extension_list_on_structural_leaf",
          `${context}: "{${inner}}" lists extensions on a literal structural leaf, where requiredness is ambiguous; "{name}" here is a back-reference`,
        );
      }
      if (inner.includes("=")) {
        fail("malformed_placeholder", `"{${inner}}" is a back-reference, which repeats bound text and carries no mask (${context})`);
      }
      if (!CAPTURE_NAME.test(inner)) {
        fail("malformed_placeholder", `"{${inner}}" is not a valid capture name (${context})`);
      }
      if (literal !== "") {
        parts.push({ kind: "literal", text: literal });
        literal = "";
      }
      parts.push({ kind: "backref", name: inner });
      i = close + 1;
      continue;
    }

    if (char !== "[") {
      literal += char;
      i += 1;
      continue;
    }

    const close = source.indexOf("]", i);
    if (close === -1) {
      fail("malformed_placeholder", `unclosed "[" in "${source}" (${context})`);
    }

    const inner = source.slice(i + 1, close);

    if (inner.startsWith("...")) {
      const name = inner.slice(3);
      if (source !== `[...${name}]`) {
        fail(
          "malformed_placeholder",
          `"[...${name}]" must occupy a whole segment, but the segment is "${source}" (${context})`,
        );
      }
      if (!CAPTURE_NAME.test(name)) {
        fail("malformed_placeholder", `"${inner}" is not a valid capture name (${context})`);
      }
      recursive = name;
      i = close + 1;
      continue;
    }

    const capture = parseCapture(inner, context);
    if (literal !== "") {
      parts.push({ kind: "literal", text: literal });
      literal = "";
    }
    parts.push({ kind: "capture", ...capture });
    i = close + 1;
  }

  if (recursive !== null) {
    return { source, parts: [], recursive, shape: "**", dynamic: true, resolved: false };
  }
  if (literal !== "") parts.push({ kind: "literal", text: literal });

  const shape = parts
    .map((part) => (part.kind === "literal" ? part.text : "*"))
    .join("");

  const dynamic = parts.some((part) => part.kind === "capture");

  return {
    source,
    parts,
    recursive: null,
    shape,
    dynamic,
    resolved: !dynamic && parts.some((part) => part.kind === "backref"),
    dotlessCaptures: options.dotlessCaptures === true,
  };
}

/** A dynamic structural filename has an exact full extension after its last placeholder. */
export function parseStructuralLeaf(source: string, context: string): Segment {
  const union = /^(.*)\.\{([^{}]*,[^{}]*)\}$/s.exec(source);
  const lastVariable = Math.max(source.lastIndexOf("]"), source.lastIndexOf("}"));
  const dot = union === null ? source.indexOf(".", lastVariable + 1) : union[1]!.length;
  if (lastVariable === -1 || dot === -1) return parseSegment(source, context);

  const stem = parseSegment(source.slice(0, dot), context, { dotlessCaptures: true });
  if (!stem.dynamic) return parseSegment(source, context);

  const suffix = source.slice(dot + 1);
  const extensions = union === null ? [suffix] : union[2]!.split(",").map((entry) => entry.trim());
  if (
    extensions.some((extension) =>
      extension.split(".").some((part) => part === "" || /[\[\]{},*?]/.test(part))
    ) || new Set(extensions).size !== extensions.length
  ) {
    fail("malformed_placeholder", `${context}: malformed structural extension selector in "${source}"`);
  }

  return {
    ...stem,
    source,
    shape: `${stem.shape}.${extensions.length === 1 ? extensions[0] : `{${extensions.join(",")}}`}`,
    fileStem: stem,
    fileExtensions: extensions,
  };
}

/** The captures a segment refers back to, in order. */
export function backrefNames(segment: Segment): string[] {
  return segment.parts.flatMap((part) => (part.kind === "backref" ? [part.name] : []));
}

/**
 * How the trie keys a segment. Shape, so that `[provider]` and `[vendor]` are
 * one directory under two names — except where a back-reference is involved,
 * because two of those are two different rules that happen to share a shape.
 */
export function trieKey(segment: Segment): string {
  if (segment.parts.some((part) => part.kind === "backref")) return segment.source;
  if (!segment.parts.some((part) => part.kind === "capture" && part.constraint !== undefined)) return segment.shape;
  // A mask narrows what the node matches, so it is part of the key; the name is not.
  const stem = segment.parts
    .map((part) => part.kind === "literal" ? part.text : part.kind === "capture" && part.constraint ? `[=${part.constraint.source}]` : "*")
    .join("");
  return segment.fileExtensions === undefined ? stem : `${stem}${segment.shape.slice(segment.fileStem!.shape.length)}`;
}

export function captureNames(segment: Segment): string[] {
  if (segment.recursive !== null) return [segment.recursive];
  return segment.parts.flatMap((part) => (part.kind === "capture" ? [part.name] : []));
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const matchers = new Map<string, RegExp>();

const CLASS_REGEX: Record<MaskClass, string> = {
  digit: "[0-9]",
  letter: "[A-Za-z]",
  lower: "[a-z]",
  alnum: "[A-Za-z0-9]",
  lowerAlnum: "[a-z0-9]",
};

/**
 * One capturing group. Compilation has already proven the segment splits
 * only one way (docs/MATCHING.MD "Captures must be unambiguous"), so the
 * laziness of the unconstrained group is never what decides a capture.
 */
function captureRegex(constraint: Constraint | undefined, dotless: boolean): string {
  if (constraint === undefined) return dotless ? "([^.]+?)" : "(.+?)";
  if (constraint.kind === "list") return `(${constraint.values.map(escape).join("|")})`;
  const body = constraint.elements.map((element) => {
    const atom = element.match.kind === "class" ? CLASS_REGEX[element.match.cls] : escape(element.match.char);
    return `${atom}${element.many ? (element.optional ? "*" : "+") : element.optional ? "?" : ""}`;
  }).join("");
  return `(${body})`;
}

/** The exact extension branch a structural filename took, if any. */
export function matchedFileExtension(
  segment: Segment,
  text: string,
  bound: Record<string, CaptureValue> = {},
): string | null {
  if (segment.fileStem === undefined || segment.fileExtensions === undefined) return null;
  for (const extension of [...segment.fileExtensions].sort((a, b) => b.length - a.length)) {
    const suffix = `.${extension}`;
    if (!text.endsWith(suffix)) continue;
    const stem = text.slice(0, -suffix.length);
    if (matchSegment(segment.fileStem, stem, bound) !== null) return extension;
  }
  return null;
}

/**
 * A resolved segment as the literal it stands for, or null when a capture it
 * refers to is unbound. Compilation rejects an unbound back-reference, so null
 * here means the walk has not reached the placeholder yet.
 */
export function resolveSegment(
  segment: Segment,
  bound: Record<string, CaptureValue>,
): string | null {
  let text = "";
  for (const part of segment.parts) {
    if (part.kind === "literal") {
      text += part.text;
      continue;
    }
    if (part.kind === "capture") return null;
    const value = bound[part.name];
    if (typeof value !== "string") return null;
    text += value;
  }
  return text;
}

/**
 * Matches one path segment. Returns the captures, or null. A `[name]` matches
 * one character or more, so `[button].tsx` does not match a file named `.tsx`.
 *
 * `bound` carries the captures already collected on the way down, which is
 * what a `{name}` matches against.
 */
export function matchSegment(
  segment: Segment,
  text: string,
  bound: Record<string, CaptureValue> = {},
): Record<string, string> | null {
  if (segment.recursive !== null) return null;

  if (segment.fileStem !== undefined) {
    const extension = matchedFileExtension(segment, text, bound);
    return extension === null
      ? null
      : matchSegment(segment.fileStem, text.slice(0, -extension.length - 1), bound);
  }

  if (segment.resolved) {
    const literal = resolveSegment(segment, bound);
    return literal !== null && literal === text ? {} : null;
  }

  if (!segment.dynamic) return segment.shape === text ? {} : null;

  const held = backrefNames(segment);
  const build = (): RegExp | null => {
    const pieces: string[] = [];
    for (const part of segment.parts) {
      if (part.kind === "literal") pieces.push(escape(part.text));
      else if (part.kind === "capture") pieces.push(captureRegex(part.constraint, segment.dotlessCaptures === true));
      else {
        const value = bound[part.name];
        if (typeof value !== "string") return null;
        pieces.push(escape(value));
      }
    }
    return new RegExp(`^${pieces.join("")}$`, "s");
  };

  // Only a back-reference-free segment can be cached: the pattern of one that
  // holds a back-reference depends on the instance being walked.
  let matcher: RegExp | null;
  if (held.length > 0) {
    matcher = build();
    if (matcher === null) return null;
  } else {
    const key = `${segment.source}\0${segment.dotlessCaptures === true}`;
    matcher = matchers.get(key) ?? null;
    if (matcher === null) {
      matcher = build()!;
      matchers.set(key, matcher);
    }
  }

  const found = matcher.exec(text);
  if (found === null) return null;

  const captures: Record<string, string> = {};
  let index = 1;
  for (const part of segment.parts) {
    if (part.kind === "capture") captures[part.name] = found[index++]!;
  }
  return captures;
}

/**
 * The automata below share one alphabet. Characters are partitioned into
 * cells so that every mask class is a union of cells; a literal mentioned by
 * either pattern is its own symbol, and each remaining cell is represented by
 * one character neither pattern mentions. The "bound" cell exists only for
 * the split check, where a back-reference stands for text no capture absorbs.
 */
type Cell = "digit" | "lower" | "upper" | "dot" | "other" | "bound";

function cellOf(char: string): Cell {
  // A NUL-prefixed symbol is a back-reference's sentinel; NUL is in no filename. Astral characters are two code units.
  if (char.startsWith("\0")) return "bound";
  if (char === ".") return "dot";
  if (char >= "0" && char <= "9") return "digit";
  if (char >= "a" && char <= "z") return "lower";
  if (char >= "A" && char <= "Z") return "upper";
  return "other";
}

const CLASS_CELLS: Record<MaskClass | "any", readonly Cell[]> = {
  digit: ["digit"],
  letter: ["lower", "upper"],
  lower: ["lower"],
  alnum: ["digit", "lower", "upper"],
  lowerAlnum: ["digit", "lower"],
  any: ["digit", "lower", "upper", "other", "dot"],
};

type Token =
  | { kind: "literal"; char: string }
  | { kind: "class"; cls: MaskClass | "any"; dotless: boolean; optional: boolean; many: boolean; binding?: string };

const wildcard = (dotless: boolean, binding?: string): Token =>
  ({ kind: "class", cls: "any", dotless, optional: false, many: true, ...(binding === undefined ? {} : { binding }) });

function admits(token: Token, char: string): boolean {
  if (token.kind === "literal") return token.char === char;
  const cell = cellOf(char);
  if (token.dotless && cell === "dot") return false;
  return CLASS_CELLS[token.cls].includes(cell);
}

/** Every symbol the product automata need to try: mentioned literals, one representative per other cell. */
function alphabet(branches: Token[][]): string[] {
  const mentioned = new Set<string>(["."]);
  for (const branch of branches) for (const token of branch) if (token.kind === "literal") mentioned.add(token.char);
  const representative = (candidates: string): string | null => {
    for (const char of candidates) if (!mentioned.has(char)) return char;
    return null;
  };
  // `/` cannot occur inside a segment, so it is always free to stand for "another character".
  // Representatives first: a witness built from them reads like a filename.
  const extra = [representative("abcdefghijklmnopqrstuvwxyz"), representative("0123456789"), representative("ABCDEFGHIJKLMNOPQRSTUVWXYZ")];
  return [...extra.filter((char): char is string => char !== null), ...mentioned, "/"];
}

interface Machine {
  starts: number[];
  step(states: number[], char: string): number[];
  accepts(states: number[]): boolean;
}

/**
 * A union of token sequences as one NFA. States are token positions; an
 * optional token may be skipped, a repeating one re-entered. State sets are
 * kept closed over skips and sorted, so a set is also its own key.
 */
function machine(branches: Token[][]): Machine {
  const tokens: (Token | undefined)[] = [];
  const starts = new Set<number>();
  const closure = (state: number, into: Set<number>): void => {
    for (let at = state; ; at += 1) {
      into.add(at);
      const token = tokens[at];
      if (token === undefined || token.kind !== "class" || !token.optional) return;
    }
  };
  for (const branch of branches) {
    const start = tokens.length;
    tokens.push(...branch, undefined);
    closure(start, starts);
  }
  const sorted = (states: Set<number>): number[] => [...states].sort((a, b) => a - b);
  return {
    starts: sorted(starts),
    accepts: (states) => states.some((state) => tokens[state] === undefined),
    step: (states, char) => {
      const next = new Set<number>();
      for (const state of states) {
        const token = tokens[state];
        if (token === undefined || !admits(token, char)) continue;
        if (token.kind === "class" && token.many) closure(state, next);
        closure(state + 1, next);
      }
      return sorted(next);
    },
  };
}

/** Whether some string is accepted by both machines, by exploring their product. */
function bothAccept(a: Machine, b: Machine, symbols: string[]): boolean {
  const key = (x: number[], y: number[]): string => `${x.join(",")}|${y.join(",")}`;
  const queue: [number[], number[]][] = [[a.starts, b.starts]];
  const seen = new Set<string>([key(a.starts, b.starts)]);
  for (let index = 0; index < queue.length; index += 1) {
    const [x, y] = queue[index]!;
    if (a.accepts(x) && b.accepts(y)) return true;
    for (const char of symbols) {
      const nextX = a.step(x, char);
      if (nextX.length === 0) continue;
      const nextY = b.step(y, char);
      if (nextY.length === 0) continue;
      const id = key(nextX, nextY);
      if (seen.has(id)) continue;
      seen.add(id);
      queue.push([nextX, nextY]);
    }
  }
  return false;
}

/**
 * Whether two shapes can both match some filename. `*` stands for one
 * character or more, so this is emptiness-of-intersection over two tiny NFAs,
 * explored as a product. It is not "do they share an extension" — MATCHING.MD
 * rejects `[name]-test.ts` against `test-[name].ts` on the strength of
 * "test-x-test.ts" alone.
 */
export function intersects(
  a: string,
  b: string,
  options: { leftDotless?: boolean; rightDotless?: boolean } = {},
): boolean {
  const shaped = (shape: string, dotless: boolean): Token[] =>
    [...shape].map((char) => char === "*" ? wildcard(dotless) : { kind: "literal", char });
  return intersectTokens(shaped(a, options.leftDotless === true), shaped(b, options.rightDotless === true));
}

function intersectTokens(left: Token[], right: Token[]): boolean {
  return bothAccept(machine([left]), machine([right]), alphabet([left, right]));
}

/** Two tokens that are the same text for every match: equal literals, or the same bound name. */
function sameText(a: Token, b: Token): boolean {
  return a.kind === "literal" && b.kind === "literal"
    ? a.char === b.char
    : a.kind === "class" && b.kind === "class" && a.binding !== undefined && a.binding === b.binding;
}

/** Equal bound prefixes/suffixes cancel before the conservative wildcard check. */
function intersectBoundTokens(left: Token[], right: Token[]): boolean {
  let start = 0;
  let leftEnd = left.length;
  let rightEnd = right.length;
  while (start < leftEnd && start < rightEnd && sameText(left[start]!, right[start]!)) start++;
  while (start < leftEnd && start < rightEnd && sameText(left[leftEnd - 1]!, right[rightEnd - 1]!)) {
    leftEnd--;
    rightEnd--;
  }
  // Back-references share a value; fresh captures do not, even if named alike.
  // Remaining bindings are over-approximated as wildcards, never used to
  // declare potentially overlapping rules disjoint.
  return intersectTokens(left.slice(start, leftEnd), right.slice(start, rightEnd));
}

/** Compare all exact structural extension branches, preserving dot-free captures. */
export function intersectSegments(left: Segment, right: Segment): boolean {
  const rightVariants = segmentVariants(right);
  return segmentVariants(left).some((a) => rightVariants.some((b) => intersectBoundTokens(a, b)));
}

/** The token sequences one part can be, with a list capture contributing one per alternative. */
function partTokens(part: Part, dotless: boolean): Token[][] {
  const literal = (text: string): Token[] => [...text].map((char) => ({ kind: "literal", char }));
  if (part.kind === "literal") return [literal(part.text)];
  if (part.kind === "backref") return [[wildcard(false, part.name)]];
  const constraint = part.constraint;
  if (constraint === undefined) return [[wildcard(dotless)]];
  if (constraint.kind === "list") return constraint.values.map(literal);
  return [constraint.elements.map((element): Token => element.match.kind === "char"
    ? { kind: "literal", char: element.match.char }
    : { kind: "class", cls: element.match.cls, dotless: false, optional: element.optional, many: element.many })];
}

/** Every branch of a segment: the product of its list captures and extension union. */
function segmentVariants(segment: Segment): Token[][] {
  const stem = segment.fileStem ?? segment;
  let branches: Token[][] = [[]];
  for (const part of stem.parts) {
    const options = partTokens(part, stem.dotlessCaptures === true);
    branches = branches.flatMap((branch) => options.map((option) => [...branch, ...option]));
  }
  if (segment.fileExtensions === undefined) return branches;
  return segment.fileExtensions.flatMap((extension) => branches.map((branch) => [
    ...branch,
    ...[...`.${extension}`].map((char): Token => ({ kind: "literal", char })),
  ]));
}

const containment = new WeakMap<Segment, WeakMap<Segment, boolean>>();

/** True only when every left match is a right match, with strictly fewer names. */
export function isStrictSubset(left: Segment, right: Segment): boolean {
  let cache = containment.get(left);
  if (cache === undefined) {
    cache = new WeakMap();
    containment.set(left, cache);
  }
  const known = cache.get(right);
  if (known !== undefined) return known;

  const a = segmentVariants(left);
  const b = segmentVariants(right);
  const variants = [...a, ...b];

  // Cancel prefixes/suffixes common to every branch. A shared back-reference
  // is the same text for every match in one parent instance, not a fresh '*'.
  while (variants.every((branch) => branch.length > 0 && sameText(branch[0]!, variants[0]![0]!))) {
    for (const branch of variants) branch.shift();
  }
  while (variants.every((branch) => branch.length > 0 && sameText(branch.at(-1)!, variants[0]!.at(-1)!))) {
    for (const branch of variants) branch.pop();
  }

  // Left bindings may be over-approximated as nonempty wildcards: inclusion
  // and a strictness witness outside that larger language remain sound.
  // Right bindings must be eliminated before treating it as a regular language.
  const proven = !b.some((branch) => branch.some((token) => token.kind === "class" && token.binding !== undefined))
    && languageSubset(a, b) && !languageSubset(b, a);
  cache.set(right, proven);
  return proven;
}

/** Inclusion of finite unions of segment NFAs, by exploring their state sets. */
function languageSubset(left: Token[][], right: Token[][]): boolean {
  const symbols = alphabet([...left, ...right]);
  const a = machine(left);
  const b = machine(right);
  const key = (x: number[], y: number[]): string => `${x.join(",")}|${y.join(",")}`;
  const queue: [number[], number[]][] = [[a.starts, b.starts]];
  const seen = new Set<string>([key(a.starts, b.starts)]);
  for (let index = 0; index < queue.length; index++) {
    const [x, y] = queue[index]!;
    if (a.accepts(x) && !b.accepts(y)) return false;
    for (const char of symbols) {
      const nextX = a.step(x, char);
      if (nextX.length === 0) continue;
      const nextY = b.step(y, char);
      const id = key(nextX, nextY);
      if (seen.has(id)) continue;
      seen.add(id);
      queue.push([nextX, nextY]);
    }
  }
  return true;
}

/** A name that a segment splits between its captures in two ways, with both splits. */
export interface AmbiguousSplit {
  text: string;
  parses: Record<string, string>[];
}

/**
 * docs/MATCHING.MD "Captures must be unambiguous". Each part is its own
 * machine, determinized by keeping state sets, so the only nondeterminism
 * left is where one part ends and the next begins: two distinct runs over
 * the same text are two different splits, and nothing else. A back-reference
 * is one opaque character, fixed by the enclosing instance and matched by no
 * class. The search is the automaton's product with itself.
 */
export function ambiguousSplit(segment: Segment): AmbiguousSplit | null {
  const stem = segment.fileStem ?? segment;
  if (stem.recursive !== null || !stem.dynamic) return null;
  const dotless = stem.dotlessCaptures === true;
  const bound: string[] = [];
  const parts = stem.parts.map((part): Token[][] => {
    if (part.kind !== "backref") return partTokens(part, dotless);
    bound.push(part.name);
    return [[{ kind: "literal", char: `\0${bound.length}` }]];
  });
  if (parts.length < 2) return null;
  const machines = parts.map((branches) => machine(branches));
  const symbols = alphabet(parts.flat());

  type State = { part: number; states: number[] };
  const key = (state: State): string => `${state.part}:${state.states.join(",")}`;
  const start: State = { part: 0, states: machines[0]!.starts };
  const accepts = (state: State): boolean => state.part === parts.length - 1 && machines[state.part]!.accepts(state.states);
  const step = (state: State, char: string): State[] => {
    const out: State[] = [];
    const here = machines[state.part]!;
    const stay = here.step(state.states, char);
    if (stay.length > 0) out.push({ part: state.part, states: stay });
    if (here.accepts(state.states) && state.part + 1 < parts.length) {
      const next = machines[state.part + 1]!;
      const entered = next.step(next.starts, char);
      if (entered.length > 0) out.push({ part: state.part + 1, states: entered });
    }
    return out;
  };

  // Reach every pair of runs over a common prefix, remembering how. The
  // cheapest witness is preferred, and letters are cheaper than punctuation,
  // so "a_b_c" is reported before "___".
  type Pair = { a: State; b: State; text: string };
  const pairKey = (pair: Pair): string => `${key(pair.a)}|${key(pair.b)}`;
  const cost = (char: string): number => (cellOf(char) === "other" || cellOf(char) === "dot" ? 3 : 1);
  const search = (from: Pair, goal: (pair: Pair) => boolean): Pair | null => {
    const buckets: Pair[][] = [[from]];
    const seen = new Set<string>([pairKey(from)]);
    for (let price = 0; price < buckets.length; price += 1) {
      for (let index = 0; index < (buckets[price] ?? []).length; index += 1) {
        const pair = buckets[price]![index]!;
        if (goal(pair)) return pair;
        for (const char of symbols) {
          for (const a of step(pair.a, char)) {
            for (const b of step(pair.b, char)) {
              const next = { a, b, text: pair.text + char };
              if (seen.has(pairKey(next))) continue;
              seen.add(pairKey(next));
              (buckets[price + cost(char)] ??= []).push(next);
            }
          }
        }
      }
    }
    return null;
  };

  const divergence = search({ a: start, b: start, text: "" }, (pair) =>
    key(pair.a) !== key(pair.b) && search({ ...pair, text: "" }, (end) => accepts(end.a) && accepts(end.b)) !== null);
  if (divergence === null) return null;
  const witness = search({ ...divergence, text: "" }, (end) => accepts(end.a) && accepts(end.b))!;
  const text = divergence.text + witness.text;

  // Enumerate the splits of the witness, two are enough to show. A bare
  // capture must not absorb a sentinel here, as no class did in the search.
  const show = (value: string): string => value.replace(/\0(\d+)/g, (_, index: string) => `{${bound[Number(index) - 1]}}`);
  const regexes = stem.parts.map((part) => part.kind === "literal"
    ? escape(part.text)
    : part.kind === "capture"
      ? captureRegex(part.constraint, dotless).replace("(.+?)", "([^\\0]+?)").replace("([^.]+?)", "([^.\\0]+?)")
      : escape(`\0${bound.indexOf(part.name) + 1}`));
  const parses: Record<string, string>[] = [];
  const walk = (index: number, at: number, captures: Record<string, string>): void => {
    if (parses.length === 2) return;
    if (index === stem.parts.length) {
      if (at === text.length) parses.push(captures);
      return;
    }
    const part = stem.parts[index]!;
    const matcher = new RegExp(`^(?:${regexes[index]})$`, "s");
    for (let end = at + 1; end <= text.length; end += 1) {
      const piece = text.slice(at, end);
      if (!matcher.test(piece)) continue;
      walk(index + 1, end, part.kind === "capture" ? { ...captures, [part.name]: show(piece) } : captures);
    }
  };
  walk(0, 0, {});
  const extension = segment.fileExtensions === undefined ? "" : `.${segment.fileExtensions[0]}`;
  return { text: show(text) + extension, parses };
}
