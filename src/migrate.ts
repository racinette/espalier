// `espalier migrate`. docs/cli/migrate/README.MD, docs/AUTHORING.MD.
//
// Rewrites the configuration for the running CLI. Every other command dies in
// `loadConfig` on a pin mismatch; this one is allowed to see the old file,
// edit it as text, and visit children the way `lint` and `build` do.

import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isMap, isNode, parseDocument } from "yaml";
import { findChildren } from "./children.js";
import {
  CONFIG_FILENAME,
  IGNORE_FILENAME,
  SHIPPED_SKIP,
  locateConfig,
  parseGuidanceMode,
  parseLintConfig,
  readConfigFile,
} from "./config.js";
import { listEntries, readLegacyNodeDoc, sourceCode } from "./compile.js";
import { parseStructuralLeaf } from "./pattern.js";
import { vendorAuthoring } from "./init.js";
import { fail } from "./errors.js";
import { collectCandidates } from "./files.js";
import { compileIgnore, ignores } from "./ignore.js";
import { eachChild } from "./nested.js";
import type { Reporter } from "./output.js";
import { readIgnoreFile } from "./repository.js";
import { VERSION } from "./version.js";
import { compileVisibility } from "./visibility.js";

const CURRENT_KEYS = new Set([
  "pin",
  "name",
  "root",
  "ignoreFiles",
  "skip",
  "addons",
  "build",
  "lint",
  "version",
]);

export interface MigrateOptions {
  cwd: string;
  config: string | undefined;
  dryRun: boolean;
}

function compareRelease(left: string, right: string): number {
  const parse = (value: string): number[] | null => {
    const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value);
    return match === null ? null : [Number(match[1]), Number(match[2]), Number(match[3])];
  };
  const a = parse(left);
  const b = parse(right);
  if (a === null || b === null) return left === right ? 0 : left < right ? -1 : 1;
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i]! < b[i]! ? -1 : 1;
  }
  return 0;
}

/** Rewrite one config's YAML as text so comments and key order survive. */
export function rewriteConfigText(
  text: string,
  values: Record<string, unknown>,
  version: string,
): string {
  parseLintConfig(values["lint"]);
  const inline = legacyInline(values);
  const skip = skipAfterRewrite(values, version);
  if (inline !== undefined || ("skip" in values && JSON.stringify(skip) !== JSON.stringify(values["skip"]))) {
    const document = parseDocument(text);
    if (inline !== undefined) document.deleteIn(["build", "inline"]);
    if ("skip" in values) {
      for (const entry of skip.slice((values["skip"] as string[]).length)) {
        document.addIn(["skip"], entry);
      }
    }
    text = document.toString();
  }
  let lines = text.split(/\r?\n/);
  if (lines[lines.length - 1] === "") lines = lines.slice(0, -1);

  lines = lines.filter((line) => !/^version\s*:/.test(line));

  let sawPin = false;
  lines = lines.map((line) => {
    if (/^pin\s*:/.test(line)) {
      sawPin = true;
      return `pin: ${version}`;
    }
    return line;
  });
  if (!sawPin) lines = [`pin: ${version}`, "", ...lines];

  const additions: string[] = [];
  if (!("ignoreFiles" in values)) additions.push("ignoreFiles: []");
  if (!("skip" in values)) {
    additions.push(["skip:", ...SHIPPED_SKIP.map((entry) => `  - ${entry}`)].join("\n"));
  }

  let body = lines.join("\n").replace(/^\n+/, "").replace(/\n+$/, "");
  if (additions.length > 0) body = `${body}\n\n${additions.join("\n\n")}`;
  return `${body}\n`;
}

/** Validate the obsolete setting before planning either migration write. */
function legacyInline(values: Record<string, unknown>): boolean | undefined {
  const build = values["build"];
  if (build === undefined || build === null) return undefined;
  if (typeof build !== "object" || Array.isArray(build)) {
    fail("config_invalid_value", "build must be a mapping");
  }
  const entries = build as Record<string, unknown>;
  for (const key of Object.keys(entries)) {
    if (!["filename", "espalierGuidance", "guidanceMode", "inline"].includes(key)) {
      fail("config_unknown_key", `unknown configuration key "build.${key}"`);
    }
  }
  if ("guidanceMode" in entries) parseGuidanceMode(entries["guidanceMode"]);
  if (!("inline" in entries)) return undefined;
  if (typeof entries["inline"] !== "boolean") {
    fail("config_invalid_value", "build.inline must be a boolean");
  }
  return entries["inline"];
}

/** Change only the frontmatter; the authored Markdown body stays byte-for-byte. */
function foldRoot(text: string, source: string): string {
  const framed = /^---[^\S\n]*\r?\n(?:([\s\S]*?)\r?\n)?---[^\S\n]*(?:\r?\n|$)/.exec(text);
  if (framed === null) {
    if (/^---[^\S\n]*(?:\r?\n|$)/.test(text)) {
      fail("malformed_node_description", `${source}: frontmatter has no closing delimiter`);
    }
    return `---\nfold: true\n---\n${text}`;
  }
  const document = parseDocument(framed[1] ?? "");
  if (document.errors.length > 0 || (document.contents !== null && !isMap(document.contents))) {
    fail("malformed_node_description", `${source}: frontmatter must be a valid YAML mapping`);
  }
  const description = document.get("description");
  const fold = document.get("fold");
  if (document.has("description") && typeof description !== "string") {
    fail("malformed_node_description", `${source}: \`description\` must be a string`);
  }
  if (document.has("fold") && typeof fold !== "boolean") {
    fail("malformed_node_description", `${source}: \`fold\` must be a boolean`);
  }
  if (fold === true) return text;
  document.set("fold", true);
  return `---\n${document.toString()}---\n${text.slice(framed[0].length)}`;
}

function discoverChildren(
  root: string,
  configPath: string,
  values: Record<string, unknown>,
  ignore: string[],
): string[] {
  const written = typeof values["root"] === "string" ? values["root"] : "espalier";
  const espalierRoot = path.posix
    .normalize(written.split(path.sep).join("/"))
    .replace(/\/+$/, "");

  let ignoreFiles: string[] = [];
  if ("ignoreFiles" in values) {
    const listed = values["ignoreFiles"];
    if (!Array.isArray(listed) || listed.some((entry) => typeof entry !== "string")) {
      fail("config_invalid_value", "ignoreFiles must be a list of strings");
    }
    ignoreFiles = listed as string[];
  }

  const ignoreRules = compileIgnore(ignore);
  const visibilityRules = ignoreFiles.map((entry) =>
    compileVisibility(readIgnoreFile(root, entry), entry),
  );
  const discoverGitignores = ignoreFiles.includes(".gitignore");
  const configRelative = path.relative(root, configPath).split(path.sep).join("/");

  const candidates = collectCandidates(
    root,
    ignoreRules,
    espalierRoot === "" || espalierRoot === "." ? undefined : espalierRoot,
    (absolute, at) => {
      const origin = `${at}/${IGNORE_FILENAME}`;
      if (!existsSync(path.join(absolute, IGNORE_FILENAME))) return [];
      return compileIgnore(readFileSync(path.join(absolute, IGNORE_FILENAME), "utf8").split("\n"), origin, at);
    },
    undefined,
    visibilityRules,
    (absolute, at) => {
      if (!discoverGitignores || !existsSync(path.join(absolute, ".gitignore"))) return [];
      const origin = `${at}/.gitignore`;
      return [compileVisibility(readFileSync(path.join(root, origin), "utf8").split("\n"), origin, at)];
    },
  );

  return findChildren(candidates, configRelative, ignoreRules);
}

function migrateOne(options: MigrateOptions, reporter: Reporter): { root: string; children: string[] } {
  const configPath = locateConfig(options.config, options.cwd);
  const root = path.dirname(configPath);
  const { text, values } = readConfigFile(configPath);

  for (const key of Object.keys(values)) {
    if (!CURRENT_KEYS.has(key)) {
      fail("config_unknown_key", `unknown configuration key "${key}"`);
    }
  }

  if ("pin" in values) {
    if (typeof values["pin"] !== "string") {
      fail("config_invalid_value", "pin must be a string");
    }
    if (compareRelease(values["pin"], VERSION) > 0) {
      fail(
        "cannot_downgrade",
        `this repository pins espalier ${values["pin"]}, which is newer than ${VERSION}; install that version rather than migrating downward`,
        { pinned: values["pin"], running: VERSION },
      );
    }
  }

  const inline = legacyInline(values);
  const written = "root" in values ? values["root"] : "espalier";
  if (typeof written !== "string" || path.isAbsolute(written) || written.split(/[\\/]/).includes("..")) {
    fail("config_invalid_value", "root must be a relative path inside the repository");
  }
  const espalierRoot = path.posix.normalize(written.split(path.sep).join("/")).replace(/\/+$/, "");
  if (espalierRoot === "" || espalierRoot === ".") {
    fail("config_invalid_value", "root must name a directory inside the repository");
  }
  const wanted = rewriteConfigText(text, values, VERSION);
  const skip = skipAfterRewrite(values);
  const ignorePath = path.join(root, IGNORE_FILENAME);
  const previousIgnore = existsSync(ignorePath) ? readFileSync(ignorePath, "utf8") : "";
  let wantedIgnore = previousIgnore;
  if (upgradesDotPaths(values, VERSION)) {
    const rules = compileIgnore(previousIgnore.split("\n"));
    if (!ignores(rules, ".git") || !ignores(rules, ".git", true) ||
        !ignores(rules, "nested/.git") || !ignores(rules, "nested/.git", true)) {
      wantedIgnore += `${wantedIgnore.endsWith("\n") || wantedIgnore === "" ? "" : "\n"}\n# Version control metadata. Remove this entry to govern it explicitly.\n.git\n`;
    }
    reviewDotEntries(path.join(root, espalierRoot), espalierRoot, skip, reporter);
  }
  const changes = planGrammarMigration(root, espalierRoot, skip, inline === true);
  for (const change of changes) {
    if (!options.dryRun) {
      mkdirSync(path.dirname(change.path), { recursive: true });
      writeFileSync(change.path, change.contents, "utf8");
      if (change.remove) unlinkSync(change.remove);
    }
    reporter.record({ kind: "written", path: path.relative(root, change.path).split(path.sep).join("/") });
    if (change.remove) reporter.record({ kind: "deleted", path: path.relative(root, change.remove).split(path.sep).join("/") });
  }
  const reported = path.relative(root, configPath).split(path.sep).join("/") || CONFIG_FILENAME;
  if (wanted === text) {
    reporter.record({ kind: "skipped", path: reported });
  } else {
    if (!options.dryRun) writeFileSync(configPath, wanted, "utf8");
    reporter.record({ kind: "written", path: reported });
  }

  if (wantedIgnore !== previousIgnore) {
    if (!options.dryRun) writeFileSync(ignorePath, wantedIgnore, "utf8");
    reporter.record({ kind: "written", path: IGNORE_FILENAME });
  }
  vendorAuthoring(root, espalierRoot, skip, reporter, options.dryRun);

  return { root, children: discoverChildren(root, configPath, values, wantedIgnore.split("\n")) };
}

function upgradesDotPaths(values: Record<string, unknown>, version: string): boolean {
  return compareRelease(version, "0.7.0") >= 0 &&
    (typeof values["pin"] !== "string" || compareRelease(values["pin"], "0.7.0") < 0);
}

/** Report old hidden boundaries without opening them or importing rule modules. */
function reviewDotEntries(root: string, source: string, skip: string[], reporter: Reporter): void {
  if (!existsSync(root)) return;
  const rules = compileIgnore(skip, "skip");
  const ancestors = new Set<string>();
  const walk = (directory: string, prefix: string): void => {
    let identity: string;
    let entries;
    try {
      identity = realpathSync(directory);
      if (ancestors.has(identity)) return;
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      reporter.warning(`${source}${prefix ? `/${prefix}` : ""}: could not inspect rule-tree entries; review dot-prefixed paths before lint or build`);
      return;
    }
    ancestors.add(identity);
    for (const entry of entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (relative === ".cache" || ignores(rules, relative, entry.isDirectory()) ||
          (entry.isSymbolicLink() && ignores(rules, relative, true))) continue;
      if (entry.name.startsWith(".")) {
        reporter.warning(`${source}/${relative}: previously hidden rule-tree entry is now eligible; review it as a rule or exclude it explicitly with skip`);
        continue;
      }
      const absolute = path.join(directory, entry.name);
      let directoryEntry = entry.isDirectory();
      if (entry.isSymbolicLink()) {
        try { directoryEntry = statSync(absolute).isDirectory(); } catch { continue; }
      }
      if (directoryEntry) walk(absolute, relative);
    }
    ancestors.delete(identity);
  };
  walk(root, "");
}

function skipAfterRewrite(values: Record<string, unknown>, version = VERSION): string[] {
  if (!("skip" in values)) return SHIPPED_SKIP;
  const listed = values["skip"];
  if (!Array.isArray(listed) || listed.some((entry) => typeof entry !== "string")) {
    fail("config_invalid_value", "skip must be a list of strings");
  }
  const skip = [...listed] as string[];
  if (upgradesDotPaths(values, version)) {
    for (const entry of [".git", ".gitkeep"]) {
      const rules = compileIgnore(skip, "skip");
      if (!ignores(rules, entry) || !ignores(rules, entry, true) ||
          !ignores(rules, `nested/${entry}`) || !ignores(rules, `nested/${entry}`, true)) skip.push(entry);
    }
  }
  return skip;
}

export async function migrate(options: MigrateOptions, reporter: Reporter): Promise<number> {
  const { root, children } = migrateOne(options, reporter);
  return await eachChild(root, children, reporter, (childRoot, childReporter) =>
    migrate({ ...options, cwd: childRoot, config: undefined }, childReporter),
  );
}

/** Keep authored annotations and unknown metadata without echoing converted fields. */
function remainingFrontmatter(source: string): string {
  const document = parseDocument(source);
  const comments: string[] = [];
  const retainComment = (text: string | null | undefined): void => {
    if (text) comments.push(...text.split("\n").map((line) => `#${line}`));
  };
  if (isMap(document.contents)) {
    for (const key of ["description", "fold"]) {
      const pair = document.contents.items.find((item) => isNode(item.key) && item.key.toJSON() === key);
      if (!pair) continue;
      for (const node of [pair.key, pair.value]) {
        if (isNode(node)) { retainComment(node.commentBefore); retainComment(node.comment); }
      }
      document.delete(key);
    }
    if (document.contents.items.length > 0) {
      comments.push(document.toString({ verifyAliasOrder: false }).trimEnd());
    } else {
      retainComment(document.commentBefore);
      retainComment(document.contents.commentBefore);
      retainComment(document.contents.comment);
      retainComment(document.comment);
    }
  } else {
    retainComment(document.commentBefore);
    retainComment(document.comment);
  }
  return comments.flatMap((text) => text.split("\n")).map((line) => `// ${line}\n`).join("");
}

/** Ordinary template literals retain readable line breaks without evaluating Markdown. */
function proseLiteral(body: string): string {
  const escaped = body.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${")
    .replace(/[\u0000-\u0008\u000b-\u001f]/g, (char) => `\\x${char.charCodeAt(0).toString(16).padStart(2, "0")}`);
  return `\`${escaped}\``;
}

/**
 * `rule` became `guidance`, on the module and inside each grouping. Only
 * direct declarations are rewritten; a destructured or re-exported `rule`
 * has no source-only rewrite and is reported instead.
 */
function renameRuleExport(source: string, entry: string): string {
  const code = sourceCode(source);
  const edits: Array<[number, number]> = [];
  for (const match of code.matchAll(/(^|\n)[ \t]*export\s+(?:const|async\s+function|function)\s+(rule)\b/g)) {
    const at = match.index! + match[0].length - "rule".length;
    edits.push([at, at + "rule".length]);
  }
  const groups = /export\s+const\s+groups\s*=\s*\{/.exec(code);
  if (groups !== null) {
    let depth = 0;
    let end = code.length;
    for (let i = groups.index + groups[0].length - 1; i < code.length; i += 1) {
      if (code[i] === "{") depth += 1;
      else if (code[i] === "}" && --depth === 0) { end = i; break; }
    }
    for (const match of code.slice(groups.index, end).matchAll(/(^|[{,]\s*)(rule)\s*:/g)) {
      const at = groups.index + match.index! + match[1]!.length;
      edits.push([at, at + "rule".length]);
    }
  }
  if (/export\s+(?:const\s*)?\{[^}]*\brule\b/.test(code)) {
    fail("module_invalid_export", `${entry}: rename the destructured or re-exported \`rule\` to \`guidance\` by hand before migrating`);
  }
  let out = source;
  for (const [start, end] of edits.sort((a, b) => b[0] - a[0])) out = `${out.slice(0, start)}guidance${out.slice(end)}`;
  return out;
}

/** Plan all syntax conversions before changing configuration or authored inputs. */
function planGrammarMigration(root: string, rules: string, skip: string[], fold: boolean): Array<{ path: string; contents: string; remove?: string }> {
  const directory = path.join(root, rules);
  const entries = existsSync(directory) ? listEntries(directory, compileIgnore(skip, "skip")) : [];
  const changes: Array<{ path: string; contents: string; remove?: string }> = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry);
    if (path.basename(entry) === "ESPALIER.MD") {
      const destination = absolute.slice(0, -"ESPALIER.MD".length) + "ESPALIER.mjs";
      if (existsSync(destination)) fail("malformed_node_description", `${entry}: both directory formats exist; resolve the conflict before migrating`);
      const original = readFileSync(absolute, "utf8");
      // Validate the complete frontmatter before generating executable source.
      foldRoot(original, entry);
      const doc = readLegacyNodeDoc(absolute, entry);
      const framed = /^---[^\S\n]*\r?\n(?:([\s\S]*?)\r?\n)?---[^\S\n]*(?:\r?\n|$)/.exec(original);
      const comment = framed ? remainingFrontmatter(framed[1] ?? "") : "";
      const body = framed ? original.slice(framed[0].length) : original;
      const exports = [
        ...(doc.description === null ? [] : [`export const description = ${JSON.stringify(doc.description)};`]),
        ...(doc.fold || (fold && entry === "ESPALIER.MD") ? ["export const fold = true;"] : []),
        ...(body === "" ? [] : [`export const guidance = ${proseLiteral(body)};`]),
      ];
      changes.push({ path: destination, remove: absolute, contents: comment + exports.join("\n") + (exports.length ? "\n" : "") });
      continue;
    }
    if (!entry.endsWith(".mjs") || path.basename(entry) === "ESPALIER.mjs") continue;
    const original = readFileSync(absolute, "utf8");
    const source = renameRuleExport(original, entry);
    const renamed = source !== original;
    // Constraints have nothing else to migrate; a literal name only looks
    // dynamic, and its `optional` is a named file's; a dynamic name with
    // `instanceOf` declares a group, and its `optional` is the group's.
    if (entry.includes("[...") || /\bexport\s+const\s+(literalName\s*=\s*true|instanceOf)\b/.test(sourceCode(source))
        || !parseStructuralLeaf(path.basename(entry).slice(0, -4), entry).dynamic) {
      if (renamed) changes.push({ path: absolute, contents: source });
      continue;
    }
    // Only a direct literal declaration has a source-only, unambiguous rewrite.
    const declaration = /(^|\n)([ \t]*)export\s+const\s+optional\s*=\s*(true|false)\s*;/g;
    const code = sourceCode(source);
    const found = [...code.matchAll(declaration)];
    if (found.length === 1 && !/\bminMatches\b/.test(code)) {
      const match = found[0]!;
      const start = match.index!;
      const original = source.slice(start, start + match[0].length);
      const nameAt = match[0].indexOf("optional");
      const valueAt = match[0].lastIndexOf(match[3]!);
      const replacement = original.slice(0, nameAt) + "minMatches" + original.slice(nameAt + "optional".length, valueAt) +
        (match[3] === "false" ? "1" : "0") + original.slice(valueAt + match[3]!.length);
      changes.push({ path: absolute, contents: source.slice(0, start) + replacement + source.slice(start + match[0].length) });
    } else if (/export[^;]*\boptional\b/.test(code)) {
      fail("module_invalid_export", `${entry}: convert the computed or re-exported optional value to minMatches before migrating (false becomes 1; true becomes 0)`);
    } else if (renamed) {
      changes.push({ path: absolute, contents: source });
    }
  }
  if (fold && !entries.includes("ESPALIER.MD")) {
    const target = path.join(directory, "ESPALIER.mjs");
    if (existsSync(target)) {
      const source = readFileSync(target, "utf8");
      const code = sourceCode(source);
      if (/export\s+const\s+fold\s*=\s*true\s*;/.test(code)) return changes;
      const declaration = /export\s+const\s+fold\s*=\s*(false)\s*;/.exec(code);
      if (declaration) {
        const at = declaration.index + declaration[0].lastIndexOf("false");
        changes.push({ path: target, contents: source.slice(0, at) + "true" + source.slice(at + 5) });
      }
      else if (/\bfold\b/.test(code)) fail("malformed_node_description", "set fold = true in the directory module before migrating inline placement");
      else changes.push({ path: target, contents: `${source}\nexport const fold = true;\n` });
    } else changes.push({ path: target, contents: "export const fold = true;\n" });
  }
  return changes;
}
