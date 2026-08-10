// Path segments and what they match. A direct transcription of
// docs/MATCHING.MD "Placeholders" and "Ambiguity is rejected".

import { fail } from "./errors.js";

export type Part =
  | { kind: "literal"; text: string }
  | { kind: "capture"; name: string };

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
  dynamic: boolean;
}

const CAPTURE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function parseSegment(source: string, context: string): Segment {
  const parts: Part[] = [];
  let recursive: string | null = null;
  let literal = "";

  for (let i = 0; i < source.length; ) {
    const char = source[i]!;

    if (char === "]") {
      fail("malformed_placeholder", `unmatched "]" in "${source}" (${context})`);
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
    return { source, parts: [], recursive, shape: "**", dynamic: true };
  }
  if (literal !== "") parts.push({ kind: "literal", text: literal });

  const shape = parts
    .map((part) => (part.kind === "literal" ? part.text : "*"))
    .join("");

  return {
    source,
    parts,
    recursive: null,
    shape,
    dynamic: parts.some((part) => part.kind === "capture"),
  };
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
 * Matches one path segment. Returns the captures, or null. A `[name]` matches
 * one character or more, so `[button].tsx` does not match a file named `.tsx`.
 */
export function matchSegment(
  segment: Segment,
  text: string,
): Record<string, string> | null {
  if (segment.recursive !== null) return null;
  if (!segment.dynamic) return segment.shape === text ? {} : null;

  let matcher = matchers.get(segment.source);
  if (matcher === undefined) {
    const source = segment.parts
      .map((part) => (part.kind === "literal" ? escape(part.text) : "(.+?)"))
      .join("");
    matcher = new RegExp(`^${source}$`);
    matchers.set(segment.source, matcher);
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
