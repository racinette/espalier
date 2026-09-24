// Path segments and what they match. A direct transcription of
// docs/MATCHING.MD "Placeholders" and "Ambiguity is rejected".

import { fail } from "./errors.js";

/** A `[name]` captures a string; a `[...name]` captures the segments it spanned. */
export type CaptureValue = string | string[];

export type Part =
  | { kind: "literal"; text: string }
  | { kind: "capture"; name: string }
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

    if (!CAPTURE_NAME.test(inner)) {
      fail("malformed_placeholder", `"[${inner}]" is not a valid capture name (${context})`);
    }
    if (literal !== "") {
      parts.push({ kind: "literal", text: literal });
      literal = "";
    }
    parts.push({ kind: "capture", name: inner });
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
  const union = /^(.*)\.\{([^{}]*,[^{}]*)\}$/.exec(source);
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
  return segment.parts.some((part) => part.kind === "backref") ? segment.source : segment.shape;
}

export function captureNames(segment: Segment): string[] {
  if (segment.recursive !== null) return [segment.recursive];
  return segment.parts.flatMap((part) => (part.kind === "capture" ? [part.name] : []));
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const matchers = new Map<string, RegExp>();

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
      else if (part.kind === "capture") pieces.push(segment.dotlessCaptures ? "([^.]+?)" : "(.+?)");
      else {
        const value = bound[part.name];
        if (typeof value !== "string") return null;
        pieces.push(escape(value));
      }
    }
    return new RegExp(`^${pieces.join("")}$`);
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
  const shaped = (shape: string, dotless: boolean): IntersectionToken[] =>
    [...shape].map((char) => char === "*"
      ? { kind: "wildcard", dotless }
      : { kind: "literal", char });
  return intersectTokens(shaped(a, options.leftDotless === true), shaped(b, options.rightDotless === true));
}

type IntersectionToken =
  | { kind: "literal"; char: string }
  | { kind: "wildcard"; dotless: boolean; binding?: string };

/** Equal bound prefixes/suffixes cancel before the conservative wildcard check. */
function intersectBoundTokens(left: IntersectionToken[], right: IntersectionToken[]): boolean {
  const equal = (a: IntersectionToken, b: IntersectionToken): boolean =>
    a.kind === "literal" && b.kind === "literal"
      ? a.char === b.char
      : a.kind === "wildcard" && b.kind === "wildcard"
        && a.binding !== undefined && a.binding === b.binding;
  let start = 0;
  let leftEnd = left.length;
  let rightEnd = right.length;
  while (start < leftEnd && start < rightEnd && equal(left[start]!, right[start]!)) start++;
  while (start < leftEnd && start < rightEnd && equal(left[leftEnd - 1]!, right[rightEnd - 1]!)) {
    leftEnd--;
    rightEnd--;
  }
  // Back-references share a value; fresh captures do not, even if named alike.
  // Remaining bindings are over-approximated as wildcards, never used to
  // declare potentially overlapping rules disjoint.
  return intersectTokens(left.slice(start, leftEnd), right.slice(start, rightEnd));
}

function intersectTokens(left: IntersectionToken[], right: IntersectionToken[]): boolean {

  // Stands for "a character neither shape mentions". `/` cannot occur inside a
  // segment, so it can never collide with a real literal.
  const OTHER = "/";
  const alphabet = new Set<string>([OTHER, "."]);
  for (const token of [...left, ...right]) {
    if (token.kind === "literal") alphabet.add(token.char);
  }

  const step = (tokens: IntersectionToken[], at: number, char: string): number[] => {
    const token = tokens[at];
    if (token === undefined) return [];
    if (token.kind === "wildcard") return token.dotless && char === "." ? [] : [at, at + 1];
    return token.char === char ? [at + 1] : [];
  };

  const seen = new Set<string>(["0,0"]);
  const queue: [number, number][] = [[0, 0]];

  while (queue.length > 0) {
    const [i, j] = queue.shift()!;
    if (i === left.length && j === right.length) return true;

    for (const char of alphabet) {
      for (const x of step(left, i, char)) {
        for (const y of step(right, j, char)) {
          const key = `${x},${y}`;
          if (!seen.has(key)) {
            seen.add(key);
            queue.push([x, y]);
          }
        }
      }
    }
  }

  return false;
}

/** Compare all exact structural extension branches, preserving dot-free captures. */
export function intersectSegments(left: Segment, right: Segment): boolean {
  const tokens = (segment: Segment): IntersectionToken[] =>
    segment.parts.flatMap((part): IntersectionToken[] => part.kind === "literal"
      ? [...part.text].map((char) => ({ kind: "literal", char }))
      : [{
        kind: "wildcard",
        dotless: part.kind === "capture" && segment.dotlessCaptures === true,
        ...(part.kind === "backref" ? { binding: part.name } : {}),
      }]);
  const variants = (segment: Segment): IntersectionToken[][] =>
    segment.fileStem === undefined || segment.fileExtensions === undefined
      ? [tokens(segment)]
      : segment.fileExtensions.map((extension) => [
        ...tokens(segment.fileStem!),
        ...[...`.${extension}`].map((char): IntersectionToken => ({ kind: "literal", char })),
      ]);
  const rightVariants = variants(right);
  return variants(left).some((a) => rightVariants.some((b) => intersectBoundTokens(a, b)));
}
