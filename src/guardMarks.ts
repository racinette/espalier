// The marks `guard` leaves in espalier modules, and how `unguard` reads them
// back. docs/cli/guard/README.MD "What it writes".
//
// A guard never deletes what an author wrote. Each statement it changes is
// commented out line by line and its replacement is fenced, so the original
// is restored byte for byte by one pass that only reads comments. Every edit is
// checked by restoring it before anything is written: a change that would not
// come back exactly is refused rather than made.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parse, type Comment } from "acorn";
import { fail } from "./errors.js";

/** The exports a guard sets. docs/LOCKS.MD. */
export type Protection = "locked" | "frozen" | "sealed";

/** What a guard sets an export to: a value, or null to take a reopening away. */
export type Setting = boolean | null;

const COMMENTED = "// espalier guard: ";
const BEGIN = "// espalier guard begin";
const END = "// espalier guard end";
const CREATED = "// espalier guard created ";

interface Located {
  type: string;
  start: number;
  end: number;
  loc: { start: { line: number }; end: { line: number } };
}

interface Parsed {
  body: Located[];
  comments: Comment[];
}

function parseModule(source: string): Parsed | null {
  const comments: Comment[] = [];
  try {
    const program = parse(source, { ecmaVersion: "latest", sourceType: "module", locations: true, onComment: comments });
    return { body: program.body as unknown as Located[], comments };
  } catch {
    return null;
  }
}

/** The name an export specifier or `export * as` gives: an identifier or a string. */
function exportedName(node: { type: string; name?: string; value?: unknown }): string {
  return node.type === "Identifier" ? node.name! : String(node.value);
}

/** Every name a destructuring pattern binds. */
function patternNames(pattern: Record<string, unknown>): string[] {
  switch (pattern["type"]) {
    case "Identifier": return [pattern["name"] as string];
    case "ObjectPattern":
      return (pattern["properties"] as Record<string, unknown>[]).flatMap((property) =>
        patternNames((property["type"] === "RestElement" ? property["argument"] : property["value"]) as Record<string, unknown>));
    case "ArrayPattern":
      return (pattern["elements"] as (Record<string, unknown> | null)[]).flatMap((element) => element === null ? [] : patternNames(element));
    case "RestElement": return patternNames(pattern["argument"] as Record<string, unknown>);
    case "AssignmentPattern": return patternNames(pattern["left"] as Record<string, unknown>);
    default: return [];
  }
}

/** Names the module declares at its top level, imports included. */
function topLevelNames(body: Located[]): Set<string> {
  const names = new Set<string>();
  for (const statement of body as unknown as Record<string, unknown>[]) {
    const declared = statement["type"] === "ExportNamedDeclaration" ? statement["declaration"] as Record<string, unknown> | null : statement;
    if (statement["type"] === "ImportDeclaration") {
      for (const specifier of statement["specifiers"] as Record<string, unknown>[]) names.add((specifier["local"] as { name: string }).name);
    }
    if (declared === null || declared === undefined) continue;
    if (declared["type"] === "VariableDeclaration") {
      for (const declarator of declared["declarations"] as Record<string, unknown>[]) {
        for (const name of patternNames(declarator["id"] as Record<string, unknown>)) names.add(name);
      }
    } else if ((declared["type"] === "FunctionDeclaration" || declared["type"] === "ClassDeclaration") && declared["id"] !== null) {
      names.add((declared["id"] as { name: string }).name);
    }
  }
  return names;
}

/** One top-level statement the guard rewrites, and what replaces it. */
interface Rewrite {
  statement: Located;
  replacement: string;
  /** Names it took away and that the guard declares again with a value. */
  redeclare: Protection[];
  /** Whether a redeclared name keeps its local binding, so it is exported under an alias. */
  aliased: boolean;
}

function literalValue(declarator: Record<string, unknown>): unknown {
  const init = declarator["init"] as { type: string; value?: unknown } | null;
  return init !== null && init.type === "Literal" ? init.value : undefined;
}

/** How the guard declares a name it set. */
function declare(name: Protection, value: boolean, aliased: boolean): string {
  if (!aliased) return `export const ${name} = ${value};`;
  const local = `espalierGuard${name[0]!.toUpperCase()}${name.slice(1)}`;
  return `const ${local} = ${value}; export { ${local} as ${name} };`;
}

/**
 * Sets each named export of a module's source, marking every change so that
 * `restoreSource` gives the source back. A setting equal to a literal the
 * module already exports is left alone. `modulePath` names the module in a
 * refusal.
 */
export function markExports(source: string, settings: Partial<Record<Protection, Setting>>, modulePath: string): string {
  const parsed = parseModule(source);
  if (parsed === null) fail("guard_unsupported_module", `${modulePath} does not parse as a JavaScript module`, { module: modulePath });
  const wanted = new Map(Object.entries(settings) as [Protection, Setting][]);
  const declared = topLevelNames(parsed.body);
  const rewrites: Rewrite[] = [];
  const handled = new Set<Protection>();

  for (const statement of parsed.body as unknown as (Located & Record<string, unknown>)[]) {
    const text = (node: Located): string => source.slice(node.start, node.end);
    if (statement.type === "ExportNamedDeclaration" && statement["declaration"] !== null) {
      const declaration = statement["declaration"] as Located & Record<string, unknown>;
      if (declaration.type === "VariableDeclaration") {
        const declarators = declaration["declarations"] as (Located & Record<string, unknown>)[];
        const taken: Protection[] = [];
        const kept: string[] = [];
        for (const declarator of declarators) {
          const bound = patternNames(declarator["id"] as Record<string, unknown>).filter((name) => wanted.has(name as Protection));
          if (bound.length > 0 && (declarator["id"] as { type: string }).type !== "Identifier") {
            fail("guard_unsupported_export", `${modulePath} exports ${bound.join(", ")} by destructuring; write it as \`export const ${bound[0]} = …\` so the guard can set it`, { module: modulePath });
          }
          const name = bound[0] as Protection | undefined;
          const setting = name === undefined ? undefined : wanted.get(name);
          if (name !== undefined && declarators.length === 1 && declaration["kind"] === "const" && setting !== null && literalValue(declarator) === setting) {
            handled.add(name);
            continue;
          }
          if (name === undefined) kept.push(text(declarator));
          else taken.push(name);
        }
        if (taken.length === 0) continue;
        for (const name of taken) handled.add(name);
        rewrites.push({
          statement,
          replacement: kept.length === 0 ? "" : `export ${declaration["kind"] as string} ${kept.join(", ")};`,
          redeclare: taken.filter((name) => wanted.get(name) !== null),
          aliased: false,
        });
      } else if (declaration["id"] !== null && wanted.has((declaration["id"] as { name: string }).name as Protection)) {
        const name = (declaration["id"] as { name: string }).name as Protection;
        handled.add(name);
        rewrites.push({ statement, replacement: "", redeclare: wanted.get(name) === null ? [] : [name], aliased: false });
      }
    } else if (statement.type === "ExportNamedDeclaration") {
      const specifiers = statement["specifiers"] as (Located & Record<string, unknown>)[];
      const taken = specifiers.filter((specifier) => wanted.has(exportedName(specifier["exported"] as never) as Protection));
      if (taken.length === 0) continue;
      const names = taken.map((specifier) => exportedName(specifier["exported"] as never) as Protection);
      for (const name of names) handled.add(name);
      const kept = specifiers.filter((specifier) => !taken.includes(specifier)).map(text);
      const from = statement["source"] === null ? ";" : ` from ${source.slice((statement["source"] as Located).start, statement.end)}`;
      rewrites.push({
        statement,
        replacement: kept.length === 0 ? "" : `export { ${kept.join(", ")} }${from}`,
        redeclare: names.filter((name) => wanted.get(name) !== null),
        aliased: statement["source"] === null,
      });
    } else if (statement.type === "ExportAllDeclaration" && statement["exported"] !== null) {
      const name = exportedName(statement["exported"] as never) as Protection;
      if (!wanted.has(name)) continue;
      handled.add(name);
      rewrites.push({ statement, replacement: "", redeclare: wanted.get(name) === null ? [] : [name], aliased: false });
    }
  }

  // A name nothing exports, or only an `export *` does, is declared anew; a
  // module's own export takes precedence over a star export.
  const added = [...wanted].filter(([name, setting]) => !handled.has(name) && setting !== null)
    .map(([name, setting]) => declare(name, setting as boolean, declared.has(name)));
  if (rewrites.length === 0 && added.length === 0) return source;

  const crlf = source.includes("\r\n");
  const lines = source.split("\n");
  const lineStart = (line: number): number => lines.slice(0, line - 1).reduce((offset, text) => offset + text.length + 1, 0);
  // Statements that share a line are rewritten as one region of whole lines.
  const regions: { first: number; last: number; rewrites: Rewrite[] }[] = [];
  for (const rewrite of [...rewrites].sort((a, b) => a.statement.start - b.statement.start)) {
    const first = rewrite.statement.loc.start.line;
    const last = rewrite.statement.loc.end.line;
    const previous = regions[regions.length - 1];
    if (previous !== undefined && first <= previous.last) {
      previous.last = Math.max(previous.last, last);
      previous.rewrites.push(rewrite);
    } else {
      regions.push({ first, last, rewrites: [rewrite] });
    }
  }

  const output: string[] = [];
  const end = crlf ? "\r" : "";
  let next = 1;
  for (const region of regions) {
    output.push(...lines.slice(next - 1, region.first - 1));
    const from = lineStart(region.first);
    const to = lineStart(region.last) + lines[region.last - 1]!.replace(/\r$/, "").length;
    let rewritten = "";
    let at = from;
    for (const rewrite of region.rewrites) {
      rewritten += source.slice(at, rewrite.statement.start) + rewrite.replacement;
      at = rewrite.statement.end;
    }
    rewritten += source.slice(at, to);
    const declarations = region.rewrites.flatMap((rewrite) =>
      rewrite.redeclare.map((name) => declare(name, wanted.get(name) as boolean, rewrite.aliased)));
    output.push(...lines.slice(region.first - 1, region.last).map((line) => `${COMMENTED}${line}`));
    const fenced = [...(rewritten.trim() === "" ? [] : rewritten.split(/\r?\n/)), ...declarations];
    if (fenced.length > 0) output.push(`${BEGIN}${end}`, ...fenced.map((line) => `${line}${end}`), `${END}${end}`);
    next = region.last + 1;
  }
  const rest = lines.slice(next - 1);
  if (added.length > 0) {
    const tail = rest[rest.length - 1] === "" ? rest.pop() : undefined;
    rest.push(`${BEGIN}${end}`, ...added.map((line) => `${line}${end}`), `${END}${end}`);
    if (tail !== undefined) rest.push(tail);
  }
  output.push(...rest);
  const guarded = output.join("\n");

  if (parseModule(guarded) === null || restoreSource(guarded, modulePath) !== source) {
    fail("guard_unsupported_module", `${modulePath}: the guard could not set ${[...wanted.keys()].join(", ")} in a way it can undo exactly; set them by hand`, { module: modulePath });
  }
  return guarded;
}

/** A module the guard creates, carrying a hash of its body so `unguard` deletes only what it wrote. */
export function createdModule(body: string[]): string {
  const text = `${body.join("\n")}\n`;
  return `${CREATED}${hash(text)}\n${text}`;
}

function hash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

/** Line numbers, from one, of the guard's marks that are real comments rather than text inside a string. */
function markLines(source: string): Set<number> | null {
  if (!source.includes("// espalier guard")) return new Set();
  const parsed = parseModule(source);
  if (parsed === null) return null;
  const starts = new Set(parsed.comments.filter((comment) => comment.type === "Line").map((comment) => comment.start));
  const marked = new Set<number>();
  let offset = 0;
  for (const [index, line] of source.split("\n").entries()) {
    if (line.startsWith("// espalier guard") && starts.has(offset)) marked.add(index + 1);
    offset += line.length + 1;
  }
  return marked;
}

/** The espalier modules, by espalier-relative path, that carry a guard's marks. */
export function guardedModules(rulesRoot: string, modules: Iterable<string>): string[] {
  return [...modules].filter((module) => {
    try { return hasMarks(readFileSync(path.join(rulesRoot, module), "utf8")); } catch { return false; }
  }).sort();
}

/** Whether a module carries a guard's marks. */
export function hasMarks(source: string): boolean {
  const marked = markLines(source);
  return marked === null ? source.includes("// espalier guard") : marked.size > 0;
}

/** Whether the module is one the guard created and nobody has edited since. */
export function createdIntact(source: string): boolean | null {
  if (!source.startsWith(CREATED)) return null;
  const cut = source.indexOf("\n");
  return source.slice(CREATED.length, cut).trim() === hash(source.slice(cut + 1));
}

/**
 * The source a guard started from: commented lines uncommented, fenced
 * replacements removed. A module whose marks no longer pair up was edited
 * after the guard, and is refused rather than guessed at.
 */
export function restoreSource(source: string, modulePath: string): string {
  const marked = markLines(source);
  const tampered = (): never => fail("guard_tampered", `${modulePath} was edited after the guard; restore it by hand, then run unguard again`, { module: modulePath });
  if (marked === null) tampered();
  if (marked!.size === 0) return source;
  const output: string[] = [];
  let fenced = false;
  for (const [index, line] of source.split("\n").entries()) {
    const bare = line.replace(/\r$/, "");
    if (!marked!.has(index + 1)) {
      if (!fenced) output.push(line);
      continue;
    }
    if (bare === BEGIN) {
      if (fenced) tampered();
      fenced = true;
    } else if (bare === END) {
      if (!fenced) tampered();
      fenced = false;
    } else if (line.startsWith(COMMENTED) || bare === COMMENTED.trimEnd()) {
      if (fenced) tampered();
      output.push(line.slice(COMMENTED.length));
    } else {
      tampered();
    }
  }
  if (fenced) tampered();
  return output.join("\n");
}
