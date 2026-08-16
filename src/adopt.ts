// `espalier adopt`. docs/cli/adopt/README.MD.
//
// Produces structure, never meaning. Everything here is a guess the architect
// is expected to correct, so the guesses are mechanical and the wrong ones are
// meant to look wrong — a plausible-sounding description is the one that
// survives review unread.

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fail } from "./errors.js";
import { compileIgnore, ignores } from "./ignore.js";
import type { Reporter } from "./output.js";
import { open } from "./repository.js";

export interface AdoptOptions {
  cwd: string;
  config: string | undefined;
  target: string;
  dryRun: boolean;
}

/** Naive on purpose: a trailing `s` and nothing more. */
function singular(name: string): string {
  return name.length > 1 && name.endsWith("s") ? name.slice(0, -1) : name;
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot + 1);
}

function stemOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? name : name.slice(0, dot);
}

function stub(description: string): string {
  return `export const description = "${description}";   // TODO

export const rule = \`\`;                  // TODO

export async function lint() {}
`;
}

interface Entry {
  name: string;
  directory: boolean;
}

/** Dotfiles are never inferred from: they are tooling, not architecture. */
function entries(absolute: string): Entry[] {
  return readdirSync(absolute, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith("."))
    .map((entry) => ({ name: entry.name, directory: entry.isDirectory() }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** A leaf the inference decided on: where the module goes, and its stub. */
interface Inferred {
  /** Espalier-relative, e.g. `src/clients/[client]/client.ts`. */
  at: string;
  description: string;
}

interface Inference {
  leaves: Inferred[];
  /** Repository-relative paths the inference did not declare, and why. */
  uncovered: { path: string; reason: string }[];
}

const PARTIAL = "present in some sibling directories but not all";

/**
 * Infers the shape of one directory, recursively.
 *
 * `at` is the espalier-relative path being described, which diverges from the
 * repository path as soon as a dynamic directory is introduced: several real
 * `stripe/`, `twilio/` directories collapse into one `[client]/` node.
 */
function infer(root: string, real: string[], at: string, name: string, out: Inference): void {
  const listings = real.map((directory) => entries(path.join(root, directory)));

  // Names every sibling has. With one sibling this is simply its contents.
  const common = listings[0]!.filter((entry) =>
    listings.every((other) => other.some((candidate) => candidate.name === entry.name)),
  );
  const shared = new Set(common.map((entry) => entry.name));

  if (listings.length > 1) {
    for (const [index, listing] of listings.entries()) {
      for (const entry of listing) {
        if (shared.has(entry.name)) continue;
        out.uncovered.push({ path: `${real[index]!}/${entry.name}`, reason: PARTIAL });
      }
    }
  }

  const directories = common.filter((entry) => entry.directory);
  const files = common.filter((entry) => !entry.directory);

  // Two of a thing is a pattern. The threshold comes from the failure being
  // asymmetric: a placeholder costs a rename, while separate declarations
  // forbid the third one.
  if (directories.length >= 2) {
    const family = directories.flatMap((entry) =>
      real.map((directory) => `${directory}/${entry.name}`),
    );
    const placeholder = `[${singular(name)}]`;
    infer(root, family, `${at}/${placeholder}`, singular(name), out);
  } else {
    for (const entry of directories) {
      const family = real.map((directory) => `${directory}/${entry.name}`);
      infer(root, family, `${at}/${entry.name}`, entry.name, out);
    }
  }

  const byExtension = new Map<string, Entry[]>();
  for (const entry of files) {
    const extension = extensionOf(entry.name);
    const bucket = byExtension.get(extension);
    if (bucket === undefined) byExtension.set(extension, [entry]);
    else bucket.push(entry);
  }

  for (const [extension, group] of byExtension) {
    // Inside a family, the shared filenames are the evidence that made it a
    // family. Collapsing `client.ts` and `requestModels.ts` into `[ts].ts`
    // because they share an extension would throw away the stronger finding
    // and declare something nobody observed.
    if (listings.length === 1 && group.length >= 2 && extension !== "") {
      out.leaves.push({ at: `${at}/[${extension}].${extension}`, description: `a ${extension}` });
      continue;
    }
    for (const entry of group) {
      out.leaves.push({ at: `${at}/${entry.name}`, description: `a ${stemOf(entry.name)}` });
    }
  }
}

/**
 * Whether an `ignore` entry keeps anything inside this area out of scope.
 *
 * Not the same question as "is this directory ignored". A `components/**`
 * entry does not match `components` itself — only paths under it — so the test
 * probes with a path inside, which is what actually matters: adopting an area
 * whose *contents* stay ignored would do nothing.
 */
function covers(pattern: string, target: string): boolean {
  const rules = compileIgnore([pattern]);
  return ignores(rules, target, true) || ignores(rules, `${target}/probe`);
}

/**
 * Replaces the `ignore` entry covering the adopted path with one per sibling it
 * also covered. Adopting an area that stays ignored would do nothing, which is
 * the only reason `adopt` touches configuration at all.
 */
function narrow(root: string, configPath: string, target: string): boolean {
  const original = readFileSync(configPath, "utf8");
  const lines = original.split("\n");
  let changed = false;

  const replaced: string[] = [];
  for (const line of lines) {
    const listed = /^(\s*-\s+)(.*)$/.exec(line);
    if (listed === null) {
      replaced.push(line);
      continue;
    }

    const pattern = listed[2]!.trim().replace(/^["']|["']$/g, "");
    if (!covers(pattern, target)) {
      replaced.push(line);
      continue;
    }

    changed = true;
    const base = pattern.replace(/\/\*\*$/, "");
    const inside = target.startsWith(`${base}/`) ? target.slice(base.length + 1).split("/")[0]! : null;
    if (inside === null) continue;

    for (const entry of entries(path.join(root, base))) {
      if (entry.name === inside) continue;
      const at = base === "" ? entry.name : `${base}/${entry.name}`;
      replaced.push(`${listed[1]!}${entry.directory ? `${at}/**` : at}`);
    }
  }

  if (!changed) return false;

  // An `ignore:` key with nothing left under it is invalid YAML for a list, so
  // the key goes with its last entry.
  const kept: string[] = [];
  for (const [index, line] of replaced.entries()) {
    if (/^ignore:\s*$/.test(line) && !/^\s*-\s+/.test(replaced[index + 1] ?? "")) continue;
    kept.push(line);
  }

  writeFileSync(configPath, kept.join("\n").replace(/\n{3,}/g, "\n\n"), "utf8");
  return true;
}

export async function adopt(options: AdoptOptions, reporter: Reporter): Promise<number> {
  const repository = await open(options.config, options.cwd);
  const { root, espalierRoot, configPath } = repository.config;

  const absolute = path.resolve(options.cwd, options.target);
  const target = path.relative(root, absolute).split(path.sep).join("/");

  if (target.startsWith("..") || path.isAbsolute(target)) {
    fail("invalid_adopt_target", `${options.target} is outside the repository`);
  }
  if (!existsSync(absolute) || !statSync(absolute).isDirectory()) {
    fail("invalid_adopt_target", `${options.target} is not a directory`);
  }
  if (target === espalierRoot || target.startsWith(`${espalierRoot}/`)) {
    fail("invalid_adopt_target", "the espalier root is not itself governed");
  }

  const found: Inference = { leaves: [], uncovered: [] };
  const name = target === "" ? "" : target.split("/").pop()!;
  infer(root, [target], target, name, found);

  const written: string[] = [];
  const skipped: string[] = [];

  for (const leaf of found.leaves.sort((a, b) => (a.at < b.at ? -1 : 1))) {
    const modulePath = `${espalierRoot}/${leaf.at}.mjs`;
    const moduleAbsolute = path.join(root, modulePath);

    // Never overwrite. The `rule` body is the expensive part and the whole
    // point; a re-run that ate one would be worse than no command at all.
    if (existsSync(moduleAbsolute)) {
      skipped.push(modulePath);
      continue;
    }

    if (!options.dryRun) {
      mkdirSync(path.dirname(moduleAbsolute), { recursive: true });
      writeFileSync(moduleAbsolute, stub(leaf.description), "utf8");
    }
    written.push(modulePath);
  }

  for (const at of written) reporter.record({ kind: "written", path: at });
  for (const at of skipped) reporter.record({ kind: "skipped", path: at });

  for (const entry of found.uncovered.sort((a, b) => (a.path < b.path ? -1 : 1))) {
    reporter.record({ kind: "uncovered", path: entry.path, reason: entry.reason });
  }

  if (written.length > 0) {
    const relative = path.relative(root, configPath).split(path.sep).join("/");
    const wouldNarrow = options.dryRun
      ? repository.config.ignore.some((pattern) => covers(pattern, target))
      : narrow(root, configPath, target);
    if (wouldNarrow) reporter.record({ kind: "narrowed", path: relative });
  }

  return 0;
}
