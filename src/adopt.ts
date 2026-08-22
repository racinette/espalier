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
import { delegated } from "./nested.js";
import { open } from "./repository.js";

export interface AdoptOptions {
  cwd: string;
  config: string | undefined;
  target: string;
  dryRun: boolean;
}

/**
 * Naive on purpose: a trailing `s` and nothing more.
 *
 * The repository root is the one directory with no name to borrow — paths are
 * root-relative, so its name is the empty string, and `[]` is not a valid
 * capture name. docs/cli/adopt/README.MD "Placeholder names".
 */
function singular(name: string): string {
  if (name === "") return "directory";
  return name.length > 1 && name.endsWith("s") ? name.slice(0, -1) : name;
}

/** Joins an espalier-relative path, where the root itself is the empty string. */
function under(at: string, name: string): string {
  return at === "" ? name : `${at}/${name}`;
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot + 1);
}

function stemOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? name : name.slice(0, dot);
}

function stub(description: string, optional: boolean): string {
  // The optional line carries its own TODO because it is the guess most worth
  // reviewing: `adopt` has seen one sibling with this file and cannot know
  // whether that makes it part of the shape or makes that sibling unusual.
  const marker = optional ? "\nexport const optional = true;             // TODO\n" : "";
  return `export const description = "${description}";   // TODO

export const rule = \`\`;                  // TODO
${marker}
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
  /** Present in some siblings but not all, or inside something that is. */
  optional: boolean;
}

interface Inference {
  leaves: Inferred[];
}

/** One sibling's contribution to the union: the entry, and who has it. */
interface Member {
  name: string;
  directory: boolean;
  /** The real directories holding it. */
  holders: string[];
  optional: boolean;
}

/**
 * Infers the shape of one directory, recursively.
 *
 * `at` is the espalier-relative path being described, which diverges from the
 * repository path as soon as a dynamic directory is introduced: several real
 * `stripe/`, `twilio/` directories collapse into one `[client]/` node.
 */
function infer(
  root: string,
  real: string[],
  at: string,
  name: string,
  out: Inference,
  outside: Set<string>,
  optional = false,
): void {
  // What this espalier does not describe is not evidence of a shape either: two
  // packages of which one has an espalier of its own are one package as far as
  // the inference is concerned, and the espalier root counted as a sibling is
  // how a whole tree collapses into a placeholder nobody chose.
  // docs/cli/adopt/README.MD "What it refuses" and "Nested espaliers".
  const listings = real.map((directory) =>
    entries(path.join(root, directory)).filter(
      (entry) => !outside.has(directory === "" ? entry.name : `${directory}/${entry.name}`),
    ),
  );

  // The union of every sibling's contents, not the intersection. A name only
  // some of them carry is declared optional rather than left out: "a client
  // may have a webhook" is what the tree says, and it is the only statement
  // available here that is true. docs/cli/adopt/README.MD "Siblings that only
  // partly match".
  const union = new Map<string, Member>();
  for (const [index, listing] of listings.entries()) {
    for (const entry of listing) {
      const found = union.get(entry.name);
      if (found === undefined) {
        union.set(entry.name, {
          name: entry.name,
          directory: entry.directory,
          holders: [real[index]!],
          optional: false,
        });
      } else {
        found.holders.push(real[index]!);
      }
    }
  }

  const members = [...union.values()]
    .map((member) => ({
      ...member,
      // Optionality is inherited: everything inside a directory only some
      // siblings have is itself only sometimes present.
      optional: optional || member.holders.length !== listings.length,
      holders: member.holders.map((holder) => `${holder}/${member.name}`),
    }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  const directories = members.filter((member) => member.directory);
  const files = members.filter((member) => !member.directory);
  const shared = directories.filter((member) => !member.optional);

  // Two of a thing is a pattern. The threshold comes from the failure being
  // asymmetric: a placeholder costs a rename, while separate declarations
  // forbid the third one. Only shared directories count — a directory one
  // sibling has is not evidence of a repeating unit.
  if (shared.length >= 2) {
    const placeholder = `[${singular(name)}]`;
    infer(
      root,
      shared.flatMap((member) => member.holders),
      under(at, placeholder),
      singular(name),
      out,
      outside,
      optional,
    );
  } else {
    for (const member of shared) {
      infer(root, member.holders, under(at, member.name), member.name, out, outside, optional);
    }
  }

  // Declared where they are, with everything inside them optional. They never
  // join a family: the shape they would be claiming to share is one nobody
  // observed twice.
  for (const member of directories.filter((entry) => entry.optional)) {
    infer(root, member.holders, under(at, member.name), member.name, out, outside, true);
  }

  const byExtension = new Map<string, Member[]>();
  for (const entry of files) {
    const extension = extensionOf(entry.name);
    const bucket = byExtension.get(extension);
    if (bucket === undefined) byExtension.set(extension, [entry]);
    else bucket.push(entry);
  }

  // Several real directories collapsed into this node, so `name` is the
  // placeholder they are matched by and a back-reference to it can be written.
  const capture = listings.length >= 2 ? name : null;

  for (const [extension, remaining] of byExtension) {
    let group = remaining;

    // A file named after the directory holding it — `stripe/stripe.ts` — is
    // that directory's own, and `{client}.ts` is the only statement here that
    // is true of all of them. Read as ordinary members they are one name per
    // sibling, which becomes a set of optional leaves that forbids the next
    // client rather than describing the convention.
    // docs/cli/adopt/README.MD "A file named after its directory".
    if (capture !== null && extension !== "") {
      const named = group.filter((entry) =>
        entry.holders.every((holder) => stemOf(entry.name) === path.basename(path.dirname(holder))),
      );
      // Every instance, not two of them. Being wrong here costs a
      // `missing_required_file` on a directory that never had one, reported the
      // moment the espalier is written — so a convention two siblings follow
      // and a third does not is not a convention.
      if (named.length >= 2 && named.length === listings.length) {
        out.leaves.push({
          at: under(at, `{${capture}}.${extension}`),
          description: `the ${capture} itself`,
          optional: false,
        });
        const collapsed = new Set(named.map((entry) => entry.name));
        group = group.filter((entry) => !collapsed.has(entry.name));
        if (group.length === 0) continue;
      }
    }

    // Inside a family, the shared filenames are the evidence that made it a
    // family. Collapsing `client.ts` and `requestModels.ts` into `[ts].ts`
    // because they share an extension would throw away the stronger finding
    // and declare something nobody observed.
    if (listings.length === 1 && group.length >= 2 && extension !== "") {
      // A dynamic leaf already matches nothing without complaint, so the
      // collapsed node is never optional — only what it stands in for was.
      out.leaves.push({
        at: under(at, `[${extension}].${extension}`),
        description: `a ${extension}`,
        optional: false,
      });
      continue;
    }
    for (const entry of group) {
      out.leaves.push({
        at: under(at, entry.name),
        description: `a ${stemOf(entry.name)}`,
        optional: entry.optional,
      });
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

  // The nearest espalier at or above the target is the one that gains the
  // modules, exactly as with `explain`. Writing them into the outer espalier
  // would declare files it cannot see and will never lint.
  // docs/cli/adopt/README.MD "Nested espaliers".
  const child = repository.children.find(
    (at) => target === at || target.startsWith(`${at}/`),
  );
  if (child !== undefined) {
    return await adopt(
      { ...options, cwd: path.join(root, child), config: undefined, target: absolute },
      delegated(reporter, child),
    );
  }
  if (target === espalierRoot || target.startsWith(`${espalierRoot}/`)) {
    fail("invalid_adopt_target", "the espalier root is not itself governed");
  }
  // `entries` refuses to infer *from* a dotfile, but the target itself was
  // never checked — so `adopt .cursor` wrote modules under `espalier/.cursor/`,
  // which the compiler skips, and reported success while `lint` went on calling
  // every file under it undeclared.
  if (target.split("/").some((segment) => segment.startsWith("."))) {
    fail(
      "invalid_adopt_target",
      `${options.target} has a dot-prefixed segment and cannot be declared; use \`ignore\``,
    );
  }

  const found: Inference = { leaves: [] };
  const name = target === "" ? "" : target.split("/").pop()!;
  // Everything this espalier does not describe: the subtrees it gave to a child,
  // and its own machinery.
  const configRelative = path.relative(root, configPath).split(path.sep).join("/");
  const outside = new Set([...repository.children, espalierRoot, configRelative]);
  infer(root, [target], target, name, found, outside);

  const written: { path: string; optional: boolean }[] = [];
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
      writeFileSync(moduleAbsolute, stub(leaf.description, leaf.optional), "utf8");
    }
    written.push({ path: modulePath, optional: leaf.optional });
  }

  for (const entry of written) {
    reporter.record(
      entry.optional
        ? { kind: "written", path: entry.path, optional: true }
        : { kind: "written", path: entry.path },
    );
  }
  for (const at of skipped) reporter.record({ kind: "skipped", path: at });

  if (written.length > 0) {
    const relative = path.relative(root, configPath).split(path.sep).join("/");
    const wouldNarrow = options.dryRun
      ? repository.config.ignore.some((pattern) => covers(pattern, target))
      : narrow(root, configPath, target);
    if (wouldNarrow) reporter.record({ kind: "narrowed", path: relative });
  }

  return 0;
}
