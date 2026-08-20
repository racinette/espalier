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
  options: { backrefs?: boolean } = {},
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
          `${context}: "{${inner}}" lists extensions, and only a constraint leaf may do that; "{name}" here is a back-reference`,
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
      else if (part.kind === "capture") pieces.push("(.+?)");
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
    matcher = matchers.get(segment.source) ?? null;
    if (matcher === null) {
      matcher = build()!;
      matchers.set(segment.source, matcher);
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
export function intersects(a: string, b: string): boolean {
  const left = [...a];
  const right = [...b];

  // Stands for "a character neither shape mentions". `/` cannot occur inside a
  // segment, so it can never collide with a real literal.
  const OTHER = "/";
  const alphabet = new Set<string>([OTHER]);
  for (const token of [...left, ...right]) {
    if (token !== "*") alphabet.add(token);
  }

  const step = (tokens: string[], at: number, char: string): number[] => {
    const token = tokens[at];
    if (token === undefined) return [];
    if (token === "*") return [at, at + 1];
    return token === char ? [at + 1] : [];
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
