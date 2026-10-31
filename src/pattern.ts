// Path segments and what they match. A direct transcription of
// docs/MATCHING.MD "Placeholders" and "Ambiguity is rejected".

import { fail } from "./errors.js";

/** A `[name]` captures a string; a `[...name]` captures the segments it spanned. */
export type CaptureValue = string | string[];

/**
 * One character class of a mask. docs/MATCHING.MD "Masks". `upper` has no
 * mask character; a case style uses it. The last four are the characters of
 * kebab-case and snake_case names, lowercase or screaming.
 */
export type MaskClass = "digit" | "letter" | "lower" | "upper" | "alnum" | "lowerAlnum" | "kebab" | "screamingKebab" | "snake" | "screamingSnake";

/** One element of a mask, after `(n)` or `(m..n)` has been expanded into copies. */
export interface MaskElement {
  match: { kind: "class"; cls: MaskClass } | { kind: "char"; char: string };
  /** `#`, or any element followed by `+` after `#`: may match nothing. */
  optional: boolean;
  /** Followed by `+`: may repeat. */
  many: boolean;
}

/**
 * One mask character as written, with its repetition: what a legend explains.
 * `elements` is what matching uses, with every repetition expanded.
 */
export interface MaskTerm {
  /** `0`, `#`, `A`, `a`, `X`, `x`, `-` or `_`. */
  symbol: string;
  /** `(n)` as [n, n], `(m..n)` as [m, n], `(m..)` as [m, null], `(..n)` as [0, n]; absent when not written. */
  count?: [number, number | null];
  /** Followed by `+`. */
  many: boolean;
}

/** A naming convention a capture may require by name. docs/MATCHING.MD "Case styles". */
export type CaseStyle = "kebab-case" | "snake_case" | "camelCase" | "PascalCase";

/** What a `[name=…]` accepts: a mask, a list of literal names, or a case style. */
export type Constraint =
  | { kind: "mask"; source: string; terms: MaskTerm[]; elements: MaskElement[] }
  | { kind: "list"; source: string; values: string[] }
  | { kind: "style"; source: CaseStyle };

/** Each style as a regular expression, and in words for generated guidance. */
export const CASE_STYLES: Record<CaseStyle, { regex: string; words: string }> = {
  "kebab-case": { regex: "[a-z][a-z0-9]*(?:-[a-z0-9]+)*", words: "lowercase words of letters and digits joined by dashes, starting with a letter" },
  "snake_case": { regex: "[a-z][a-z0-9]*(?:_[a-z0-9]+)*", words: "lowercase words of letters and digits joined by underscores, starting with a letter" },
  "camelCase": { regex: "[a-z][A-Za-z0-9]*", words: "letters and digits starting with a lowercase letter" },
  "PascalCase": { regex: "[A-Z][A-Za-z0-9]*", words: "letters and digits starting with a capital letter" },
};

const isCaseStyle = (source: string): source is CaseStyle => Object.hasOwn(CASE_STYLES, source);

/** A part of one alternative: alternatives do not nest. */
export type SimplePart =
  | { kind: "literal"; text: string }
  | { kind: "capture"; name: string; constraint?: Constraint }
  | { kind: "backref"; name: string };

/**
 * `{a,b}` in a name: exactly one alternative matches, and an empty one makes
 * the part optional. docs/MATCHING.MD "Alternatives".
 */
export type Part = SimplePart | { kind: "alternatives"; source: string; branches: SimplePart[][] };

export interface Segment {
  /** As authored: `clients`, `[provider]`, `test-[name].ts`, `[...path]`. */
  source: string;
  /** Empty for a recursive segment. */
  parts: Part[];
  /** The capture name when this segment is exactly `[...name]`. */
  recursive: string | null;
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
  /**
   * The module declared `literalName`: brackets and braces in the name are
   * the name, as in a Next.js `[slug]` route. docs/MATCHING.MD "Literal names".
   */
  literal?: boolean;
}

const CAPTURE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

const MASK_CLASSES: Record<string, MaskClass> = {
  "0": "digit",
  "#": "digit",
  A: "letter",
  a: "lower",
  X: "alnum",
  x: "lowerAlnum",
  k: "kebab",
  K: "screamingKebab",
  s: "snake",
  S: "screamingSnake",
};

/** `(n)` and `+` apply to the element before them, so an element is parsed and then possibly repeated. */
function parseMask(source: string, context: string, placeholder: string): Constraint {
  const elements: MaskElement[] = [];
  const terms: MaskTerm[] = [];
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
      return bad(`"${char}" is not a mask character; the mask vocabulary is 0 # A a X x k K s S - _ with +, (n) and (m..n) for repetition${styleHint(source)}`);
    }
    i += 1;
    // `(n)` is exactly n copies; `(m..n)`, `(m..)` and `(..n)` are m required
    // copies followed by optional ones, or by a repeating one.
    let least = 1;
    let most: number | null = 1;
    const term: MaskTerm = { symbol: char, many: false };
    if (source[i] === "(") {
      const close = source.indexOf(")", i);
      const inside = close === -1 ? "" : source.slice(i + 1, close);
      const range = /^(0|[1-9][0-9]*)?\.\.([1-9][0-9]*)?$/.exec(inside);
      if (/^[1-9][0-9]*$/.test(inside)) {
        least = most = Number(inside);
      } else if (range !== null && (range[1] !== undefined || range[2] !== undefined)) {
        least = Number(range[1] ?? 0);
        most = range[2] === undefined ? null : Number(range[2]);
        if (most !== null && least >= most) return bad(`"(${inside})" needs a smaller count before ".." than after it; exactly n times is written "(n)"`);
      } else {
        return bad(`"(" must be followed by a count or a range, such as (4), (2..6), (2..) or (..6), and ")"`);
      }
      term.count = [least, most];
      i = close + 1;
    }
    if (source[i] === "+") {
      if (most !== least) return bad(`"+" cannot follow another repetition`);
      most = null;
      term.many = true;
      i += 1;
    }
    terms.push(term);
    if (source[i] === "(" || source[i] === "+") return bad(`"${source[i]}" cannot follow another repetition`);
    for (let n = 0; n < least; n += 1) elements.push({ ...element });
    if (most === null) {
      if (least === 0) elements.push({ ...element, optional: true, many: true });
      else elements.at(-1)!.many = true;
    } else {
      for (let n = least; n < most; n += 1) elements.push({ ...element, optional: true });
    }
  }
  if (!elements.some((element) => !element.optional)) {
    bad("a mask must require at least one character; \"#\", \"#+\" and a range from 0, such as \"a(..6)\", alone match nothing");
  }
  return { kind: "mask", source, terms, elements };
}

/** A pointer to the case style a misspelled mask seems to mean, such as `kebab`. */
function styleHint(source: string): string {
  const loose = source.toLowerCase().replace(/[-_]/g, "");
  const meant = (Object.keys(CASE_STYLES) as CaseStyle[]).find((style) => {
    const word = style.toLowerCase().replace(/[-_]/g, "");
    return loose === word || loose === word.replace(/case$/, "");
  });
  return meant === undefined ? "" : `; the case style is written "${meant}"`;
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
  const constraint: Constraint = isCaseStyle(rest)
    ? { kind: "style", source: rest }
    : rest.startsWith("{") ? parseList(rest, context, placeholder) : parseMask(rest, context, placeholder);
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
  options: { backrefs?: boolean; dotlessCaptures?: boolean; literal?: boolean } = {},
): Segment {
  if (options.literal === true) {
    return { source, parts: [{ kind: "literal", text: source }], recursive: null, dynamic: false, resolved: false, literal: true };
  }
  const backrefs = options.backrefs !== false;

  if (source.startsWith("[...")) {
    const close = source.indexOf("]");
    const name = source.slice(4, close === -1 ? undefined : close);
    if (close === -1) fail("malformed_placeholder", `unclosed "[" in "${source}" (${context})`);
    if (source !== `[...${name}]`) {
      fail("malformed_placeholder", `"[...${name}]" must occupy a whole segment, but the segment is "${source}" (${context})`);
    }
    if (!CAPTURE_NAME.test(name)) fail("malformed_placeholder", `"...${name}" is not a valid capture name (${context})`);
    return { source, parts: [], recursive: name, dynamic: true, resolved: false };
  }

  const parts = parseParts(source, source, context, backrefs, true);
  const dynamic = parts.some((part) => part.kind === "capture"
    || (part.kind === "alternatives" && part.branches.some((branch) => branch.some((inner) => inner.kind === "capture"))));
  // A name with alternatives and no placeholder names several files, so
  // whether it is required has no one answer.
  if (!dynamic && parts.some((part) => part.kind === "alternatives")) {
    fail(
      "extension_list_on_structural_leaf",
      `${context}: "${source}" lists alternatives without a placeholder, so it names several files and its requiredness is ambiguous; a single alternative without a comma, "{name}", is a back-reference`,
    );
  }

  return {
    source,
    parts,
    recursive: null,
    dynamic,
    resolved: !dynamic && parts.some((part) => part.kind === "backref"),
    dotlessCaptures: options.dotlessCaptures === true,
  };
}

/**
 * Literals, placeholders, back-references and, at the top level only,
 * alternatives. `{name}` is a back-reference and `{a,b}` alternatives: a
 * comma outside brackets is what tells them apart.
 */
function parseParts(text: string, source: string, context: string, backrefs: boolean, top: boolean): Part[] {
  const parts: Part[] = [];
  let literal = "";
  const flush = (): void => {
    if (literal !== "") parts.push({ kind: "literal", text: literal });
    literal = "";
  };

  for (let i = 0; i < text.length; ) {
    const char = text[i]!;

    if (char === "]") {
      fail("malformed_placeholder", `unmatched "]" in "${source}" (${context})`);
    }

    if (backrefs && char === "{") {
      const close = closingBrace(text, i, source, context);
      const inner = text.slice(i + 1, close);
      const branches = splitBranches(inner);
      if (branches.length > 1) {
        if (!top) fail("malformed_placeholder", `"{${inner}}" is nested inside alternatives, which do not nest (${context})`);
        if (new Set(branches).size !== branches.length) {
          fail("malformed_placeholder", `"{${inner}}" repeats an alternative (${context})`);
        }
        flush();
        parts.push({
          kind: "alternatives",
          source: `{${inner}}`,
          branches: branches.map((branch) => parseParts(branch, source, context, backrefs, false) as SimplePart[]),
        });
        i = close + 1;
        continue;
      }
      if (inner.includes("=")) {
        fail("malformed_placeholder", `"{${inner}}" is a back-reference, which repeats bound text and carries no mask (${context})`);
      }
      if (!CAPTURE_NAME.test(inner)) {
        fail("malformed_placeholder", `"{${inner}}" is not a valid capture name (${context})`);
      }
      flush();
      parts.push({ kind: "backref", name: inner });
      i = close + 1;
      continue;
    }

    if (char !== "[") {
      literal += char;
      i += 1;
      continue;
    }

    const close = text.indexOf("]", i);
    if (close === -1) {
      fail("malformed_placeholder", `unclosed "[" in "${source}" (${context})`);
    }
    const inner = text.slice(i + 1, close);
    if (inner.startsWith("...")) {
      fail("malformed_placeholder", `"[${inner}]" must occupy a whole segment, but the segment is "${source}" (${context})`);
    }
    flush();
    parts.push({ kind: "capture", ...parseCapture(inner, context) });
    i = close + 1;
  }
  flush();
  return parts;
}

/** The `}` closing the brace at `open`; braces inside a placeholder are its list. */
function closingBrace(text: string, open: number, source: string, context: string): number {
  for (let i = open + 1; i < text.length; i += 1) {
    if (text[i] === "[") {
      const close = text.indexOf("]", i);
      if (close === -1) break;
      i = close;
    } else if (text[i] === "{") {
      // A back-reference inside an alternative is fine; alternatives inside one are not.
      const inner = text.indexOf("}", i);
      if (inner === -1 || text.slice(i + 1, inner).includes(",")) {
        fail("malformed_placeholder", `"${source}" opens alternatives inside alternatives, which do not nest (${context})`);
      }
      i = inner;
    } else if (text[i] === "}") {
      return i;
    }
  }
  return fail("malformed_placeholder", `unclosed "{" in "${source}" (${context})`);
}

/** Split on commas outside brackets: `[kind={a,b}],x` is two alternatives. */
function splitBranches(inner: string): string[] {
  const branches: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of inner) {
    if (char === "[" || char === "{") depth += 1;
    if (char === "]" || char === "}") depth -= 1;
    if (char === "," && depth === 0) {
      branches.push(current);
      current = "";
    } else current += char;
  }
  branches.push(current);
  return branches;
}

/** A dynamic structural filename has an exact full extension after its last placeholder. */
export function parseStructuralLeaf(source: string, context: string, options: { literal?: boolean } = {}): Segment {
  if (options.literal === true) return parseSegment(source, context, options);
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
    fileStem: stem,
    fileExtensions: extensions,
  };
}

/** The captures a segment refers back to, in order. */
export function backrefNames(segment: Segment): string[] {
  return segment.parts.flatMap((part) => part.kind === "backref" ? [part.name]
    : part.kind === "alternatives" ? part.branches.flat().flatMap((inner) => inner.kind === "backref" ? [inner.name] : []) : []);
}

/**
 * How the trie keys a segment: its literals, with every capture reduced to
 * what it admits. Two segments with the same key are one node — which is what
 * makes `clients/[provider]` and `clients/[vendor]` a contradiction rather
 * than two directories — except where a back-reference is involved, because
 * two of those are two different rules that happen to share a key.
 *
 * The key is internal. It is not a glob and nothing matches against it.
 */
export function trieKey(segment: Segment): string {
  if (segment.recursive !== null) return "\0...";
  if (segment.parts.some((part) => part.kind === "backref")) return segment.source;
  // A placeholder keys with a NUL, which no filename can contain, so a
  // literal name such as `[slug]` can never share a node with a capture.
  const key = (part: SimplePart): string =>
    part.kind === "literal" ? part.text : part.kind === "capture" && part.constraint ? `\0=${part.constraint.source}` : "\0*";
  const stem = segment.parts
    .map((part) => part.kind === "alternatives"
      ? `\0{${part.branches.map((branch) => branch.map(key).join("")).join("\0|")}\0}`
      : key(part))
    .join("");
  if (segment.fileExtensions === undefined) return stem;
  const { fileExtensions } = segment;
  return `${stem}.${fileExtensions.length === 1 ? fileExtensions[0] : `{${fileExtensions.join(",")}}`}`;
}

export function captureNames(segment: Segment): string[] {
  if (segment.recursive !== null) return [segment.recursive];
  // A name in several alternatives is one capture, bound by whichever matched.
  return segment.parts.flatMap((part) => part.kind === "capture" ? [part.name]
    : part.kind === "alternatives" ? [...new Set(part.branches.flat().flatMap((inner) => inner.kind === "capture" ? [inner.name] : []))] : []);
}

/** Captures that some alternative leaves unbound, so a match may not have them. */
export function optionalCaptureNames(segment: Segment): string[] {
  return segment.parts.flatMap((part) => {
    if (part.kind !== "alternatives") return [];
    const names = new Set(part.branches.flat().flatMap((inner) => inner.kind === "capture" ? [inner.name] : []));
    return [...names].filter((name) => part.branches.some((branch) => !branch.some((inner) => inner.kind === "capture" && inner.name === name)));
  });
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const matchers = new Map<string, RegExp>();

const CLASS_REGEX: Record<MaskClass, string> = {
  digit: "[0-9]",
  letter: "[A-Za-z]",
  lower: "[a-z]",
  upper: "[A-Z]",
  alnum: "[A-Za-z0-9]",
  lowerAlnum: "[a-z0-9]",
  kebab: "[a-z0-9-]",
  screamingKebab: "[A-Z0-9-]",
  snake: "[a-z0-9_]",
  screamingSnake: "[A-Z0-9_]",
};

/**
 * One capturing group. Compilation has already proven the segment splits
 * only one way (docs/MATCHING.MD "Captures must be unambiguous"), so the
 * laziness of the unconstrained group is never what decides a capture.
 */
function captureRegex(constraint: Constraint | undefined, dotless: boolean): string {
  if (constraint === undefined) return dotless ? "([^.]+?)" : "(.+?)";
  if (constraint.kind === "list") return `(${constraint.values.map(escape).join("|")})`;
  if (constraint.kind === "style") return `(${CASE_STYLES[constraint.source].regex})`;
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
    if (part.kind === "capture" || part.kind === "alternatives") return null;
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

  if (!segment.dynamic) return segment.source === text ? {} : null;

  const held = backrefNames(segment);
  const build = (): RegExp | null => {
    const piece = (part: SimplePart): string | null => {
      if (part.kind === "literal") return escape(part.text);
      if (part.kind === "capture") return captureRegex(part.constraint, segment.dotlessCaptures === true);
      const value = bound[part.name];
      return typeof value === "string" ? escape(value) : null;
    };
    const pieces: string[] = [];
    for (const part of segment.parts) {
      if (part.kind !== "alternatives") {
        const one = piece(part);
        if (one === null) return null;
        pieces.push(one);
        continue;
      }
      const branches: string[] = [];
      for (const branch of part.branches) {
        const inner = branch.map(piece);
        if (inner.includes(null)) return null;
        branches.push(inner.join(""));
      }
      pieces.push(`(?:${branches.join("|")})`);
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

  // Groups are numbered in source order. A capture in an alternative that
  // did not match is left out, not bound to "".
  const captures: Record<string, string> = {};
  let index = 1;
  const take = (part: SimplePart): void => {
    if (part.kind !== "capture") return;
    const value = found[index++];
    if (value !== undefined) captures[part.name] = value;
  };
  for (const part of segment.parts) {
    if (part.kind === "alternatives") for (const inner of part.branches.flat()) take(inner);
    else take(part);
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
type Cell = "digit" | "lower" | "upper" | "dash" | "underscore" | "dot" | "other" | "bound";

function cellOf(char: string): Cell {
  // A NUL-prefixed symbol is a back-reference's sentinel; NUL is in no filename. Astral characters are two code units.
  if (char.startsWith("\0")) return "bound";
  if (char === ".") return "dot";
  if (char === "-") return "dash";
  if (char === "_") return "underscore";
  if (char >= "0" && char <= "9") return "digit";
  if (char >= "a" && char <= "z") return "lower";
  if (char >= "A" && char <= "Z") return "upper";
  return "other";
}

const CLASS_CELLS: Record<MaskClass | "any", readonly Cell[]> = {
  digit: ["digit"],
  letter: ["lower", "upper"],
  lower: ["lower"],
  upper: ["upper"],
  alnum: ["digit", "lower", "upper"],
  lowerAlnum: ["digit", "lower"],
  kebab: ["digit", "lower", "dash"],
  screamingKebab: ["digit", "upper", "dash"],
  snake: ["digit", "lower", "underscore"],
  screamingSnake: ["digit", "upper", "underscore"],
  any: ["digit", "lower", "upper", "dash", "underscore", "other", "dot"],
};

/**
 * `open` and `close` bracket a group that matches nothing themselves: the
 * group may be skipped, from `open` to past its `close` `span` tokens on,
 * and re-entered from `close`. Only a case style's repeated words use one.
 */
type Token =
  | { kind: "literal"; char: string }
  | { kind: "class"; cls: MaskClass | "any"; dotless: boolean; optional: boolean; many: boolean; binding?: string }
  | { kind: "open"; span: number }
  | { kind: "close"; span: number };

const wildcard = (dotless: boolean, binding?: string): Token =>
  ({ kind: "class", cls: "any", dotless, optional: false, many: true, ...(binding === undefined ? {} : { binding }) });

function admits(token: Token, char: string): boolean {
  if (token.kind === "open" || token.kind === "close") return false;
  if (token.kind === "literal") return token.char === char;
  const cell = cellOf(char);
  if (token.dotless && cell === "dot") return false;
  return CLASS_CELLS[token.cls].includes(cell);
}

/** Every symbol the product automata need to try: mentioned literals, one representative per other cell. */
function alphabet(branches: Token[][]): string[] {
  // The dash and underscore are cells of their own, which some classes admit.
  const mentioned = new Set<string>([".", "-", "_"]);
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
 * optional token or group may be skipped, a repeating one re-entered. State
 * sets are kept closed over skips and sorted, so a set is also its own key.
 */
function machine(branches: Token[][]): Machine {
  const tokens: (Token | undefined)[] = [];
  const starts = new Set<number>();
  const closure = (at: number, into: Set<number>): void => {
    if (into.has(at)) return;
    into.add(at);
    const token = tokens[at];
    if (token === undefined || token.kind === "literal") return;
    if (token.kind === "open") {
      closure(at + 1, into);
      closure(at + token.span + 1, into);
    } else if (token.kind === "close") {
      closure(at + 1, into);
      closure(at - token.span + 1, into);
    } else if (token.optional) closure(at + 1, into);
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

/**
 * The shortest name two segments both match, to show why they overlap; null
 * when they are disjoint, or when a back-reference would make the name one
 * no single instance could have.
 */
export function commonName(left: Segment, right: Segment): string | null {
  const a = segmentVariants(left);
  const b = segmentVariants(right);
  if ([...a, ...b].some((branch) => branch.some((token) => token.kind === "class" && token.binding !== undefined))) return null;
  return commonText(a, b);
}

/** Compare all exact structural extension branches, preserving dot-free captures. */
export function intersectSegments(left: Segment, right: Segment): boolean {
  const rightVariants = segmentVariants(right);
  return segmentVariants(left).some((a) => rightVariants.some((b) => intersectBoundTokens(a, b)));
}

/** The token sequences one part can be, with a list capture contributing one per alternative. */
function partTokens(part: Part, dotless: boolean): Token[][] {
  const literal = (text: string): Token[] => [...text].map((char) => ({ kind: "literal", char }));
  if (part.kind === "alternatives") {
    // Each alternative is the product of its own parts; an empty one is the empty sequence.
    return part.branches.flatMap((branch) => branch.reduce<Token[][]>(
      (sequences, inner) => sequences.flatMap((sequence) => partTokens(inner, dotless).map((option) => [...sequence, ...option])),
      [[]],
    ));
  }
  if (part.kind === "literal") return [literal(part.text)];
  if (part.kind === "backref") return [[wildcard(false, part.name)]];
  const constraint = part.constraint;
  if (constraint === undefined) return [[wildcard(dotless)]];
  if (constraint.kind === "list") return constraint.values.map(literal);
  if (constraint.kind === "style") return [styleTokens(constraint.source)];
  return [constraint.elements.map((element): Token => element.match.kind === "char"
    ? { kind: "literal", char: element.match.char }
    : { kind: "class", cls: element.match.cls, dotless: false, optional: element.optional, many: element.many })];
}

/** A case style as tokens: CASE_STYLES' expressions, transcribed. */
function styleTokens(style: CaseStyle): Token[] {
  const one = (cls: MaskClass): Token => ({ kind: "class", cls, dotless: false, optional: false, many: false });
  const any = (cls: MaskClass): Token => ({ kind: "class", cls, dotless: false, optional: true, many: true });
  if (style === "camelCase") return [one("lower"), any("alnum")];
  if (style === "PascalCase") return [one("upper"), any("alnum")];
  // A first word, then any number of separated words: (sep [a-z0-9]+)*.
  const separator: Token = { kind: "literal", char: style === "kebab-case" ? "-" : "_" };
  return [
    one("lower"), any("lowerAlnum"),
    { kind: "open", span: 3 }, separator, { kind: "class", cls: "lowerAlnum", dotless: false, optional: false, many: true }, { kind: "close", span: 3 },
  ];
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
function splitOf(simple: SimplePart[], dotless: boolean): AmbiguousSplit | null {
  const bound: string[] = [];
  const parts = simple.map((part): Token[][] => {
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
  const cost = (char: string): number => (["other", "dot", "dash", "underscore"].includes(cellOf(char)) ? 3 : 1);
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
  const regexes = simple.map((part) => part.kind === "literal"
    ? escape(part.text)
    : part.kind === "capture"
      ? captureRegex(part.constraint, dotless).replace("(.+?)", "([^\\0]+?)").replace("([^.]+?)", "([^.\\0]+?)")
      : escape(`\0${bound.indexOf(part.name) + 1}`));
  const parses: Record<string, string>[] = [];
  const walk = (index: number, at: number, captures: Record<string, string>): void => {
    if (parses.length === 2) return;
    if (index === simple.length) {
      if (at === text.length) parses.push(captures);
      return;
    }
    const part = simple[index]!;
    const matcher = new RegExp(`^(?:${regexes[index]})$`, "s");
    for (let end = at + 1; end <= text.length; end += 1) {
      const piece = text.slice(at, end);
      if (!matcher.test(piece)) continue;
      walk(index + 1, end, part.kind === "capture" ? { ...captures, [part.name]: show(piece) } : captures);
    }
  };
  walk(0, 0, {});
  return { text: show(text), parses };
}

/** The segment's parts once per combination of its alternatives. */
function expansions(parts: Part[]): SimplePart[][] {
  return parts.reduce<SimplePart[][]>((sequences, part) => part.kind === "alternatives"
    ? sequences.flatMap((sequence) => part.branches.map((branch) => [...sequence, ...branch]))
    : sequences.map((sequence) => [...sequence, part]), [[]]);
}

/** Tokens for a sequence of parts, a back-reference as a sentinel no class admits. */
function sentinelTokens(parts: SimplePart[], dotless: boolean, bound: string[]): Token[][] {
  return parts.reduce<Token[][]>((sequences, part) => {
    let options: Token[][];
    if (part.kind === "backref") {
      if (!bound.includes(part.name)) bound.push(part.name);
      options = [[{ kind: "literal", char: `\0${bound.indexOf(part.name) + 1}` }]];
    } else options = partTokens(part, dotless);
    return sequences.flatMap((sequence) => options.map((option) => [...sequence, ...option]));
  }, [[]]);
}

/** The cheapest name both token unions accept, or null when they are disjoint. */
function commonText(left: Token[][], right: Token[][]): string | null {
  const a = machine(left);
  const b = machine(right);
  const symbols = alphabet([...left, ...right]);
  const key = (x: number[], y: number[]): string => `${x.join(",")}|${y.join(",")}`;
  const queue: [number[], number[], string][] = [[a.starts, b.starts, ""]];
  const seen = new Set<string>([key(a.starts, b.starts)]);
  for (let index = 0; index < queue.length; index += 1) {
    const [x, y, text] = queue[index]!;
    if (a.accepts(x) && b.accepts(y)) return text;
    for (const char of symbols) {
      const nextX = a.step(x, char);
      if (nextX.length === 0) continue;
      const nextY = b.step(y, char);
      if (nextY.length === 0) continue;
      const id = key(nextX, nextY);
      if (seen.has(id)) continue;
      seen.add(id);
      queue.push([nextX, nextY, text + char]);
    }
  }
  return null;
}

/** The captures one sequence of parts binds in `text`, back-references as sentinels. */
function capturesOf(parts: SimplePart[], text: string, dotless: boolean, bound: string[]): Record<string, string> {
  const show = (value: string): string => value.replace(/\0(\d+)/g, (_, index: string) => `{${bound[Number(index) - 1]}}`);
  const pattern = parts.map((part) => part.kind === "literal"
    ? escape(part.text)
    : part.kind === "capture"
      ? captureRegex(part.constraint, dotless).replace("(.+?)", "([^\\0]+?)").replace("([^.]+?)", "([^.\\0]+?)")
      : escape(`\0${bound.indexOf(part.name) + 1}`)).join("");
  const found = new RegExp(`^${pattern}$`, "s").exec(text);
  const captures: Record<string, string> = {};
  let index = 1;
  for (const part of parts) if (part.kind === "capture") captures[part.name] = show(found?.[index++] ?? "");
  return captures;
}

/**
 * docs/MATCHING.MD "Captures must be unambiguous" and "Alternatives". Every
 * combination of alternatives must split one way, and no two combinations
 * may match one name: the name would not say which alternative it took.
 */
export function ambiguousSplit(segment: Segment): AmbiguousSplit | null {
  const stem = segment.fileStem ?? segment;
  if (stem.recursive !== null || !stem.dynamic) return null;
  const dotless = stem.dotlessCaptures === true;
  const extension = segment.fileExtensions === undefined ? "" : `.${segment.fileExtensions[0]}`;
  const variants = expansions(stem.parts);
  for (const parts of variants) {
    const found = splitOf(parts, dotless);
    if (found !== null) return { text: found.text + extension, parses: found.parses };
  }
  const bound: string[] = [];
  const tokens = variants.map((parts) => sentinelTokens(parts, dotless, bound));
  for (let i = 0; i < variants.length; i += 1) {
    for (let j = i + 1; j < variants.length; j += 1) {
      const text = commonText(tokens[i]!, tokens[j]!);
      if (text === null) continue;
      const show = text.replace(/\0(\d+)/g, (_, index: string) => `{${bound[Number(index) - 1]}}`);
      return {
        text: show + extension,
        parses: [capturesOf(variants[i]!, text, dotless, bound), capturesOf(variants[j]!, text, dotless, bound)],
      };
    }
  }
  return null;
}
