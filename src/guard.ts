// `espalier guard`: close parts of a repository for one piece of work, and
// open what the work needs. docs/cli/guard/README.MD, docs/LOCKS.MD
// "Guarding a branch".
//
// A guard is an ordinary change to the espalier: `locked`, `frozen` and
// `sealed` exports, and the declarations an opening needs. Every change is
// marked (src/guardMarks.ts) so `unguard` takes the whole guard back in one
// pass. Everything is planned and checked before the first write, and the
// written espalier is compiled before the guard is reported done; a guard
// that would not compile is taken back.

import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { build } from "./build.js";
import {
  boundCaptures,
  contractDirectories,
  declaration,
  moduleUrl,
  NODE_DESCRIPTION,
  reimportModules,
  type Espalier,
  type StructuralRule,
  type TrieNode,
} from "./compile.js";
import { fail, OperationalError } from "./errors.js";
import { createdModule, guardedModules, markExports, type Protection, type Setting } from "./guardMarks.js";
import { isDirectoryOwnership, isOwnership, resolve, resolveDirectory } from "./match.js";
import type { Reporter } from "./output.js";
import { open, type Repository } from "./repository.js";

export interface GuardOptions {
  cwd: string;
  config: string | undefined;
  /** Lock, freeze and seal. */
  close: string[];
  freeze: string[];
  seal: string[];
  lock: string[];
  /** Edit, add and remove. */
  open: string[];
  edit: string[];
  add: string[];
  dryRun: boolean;
  /** Rebuild the generated documents afterwards. */
  build: boolean;
}

/** One module a target speaks through, and what lies beneath it. */
interface Slot {
  /** The target as given, for messages. */
  target: string;
  /** Espalier-relative module path. */
  module: string;
  /** What closing the target also closes: a directory's subtree, a contract's members, or nothing. */
  scope: { kind: "directory"; at: string } | { kind: "rule"; module: string } | { kind: "member" };
  /** For a module the guard creates: the contract it declares a member of, or null for a directory module. */
  create?: { instanceOf: string | null };
  /** The target names a repository file that exists. */
  file?: string;
}

const CLOSING: Record<"close" | "freeze" | "seal" | "lock", Protection[]> = {
  close: ["locked", "frozen", "sealed"],
  freeze: ["frozen"],
  seal: ["sealed"],
  lock: ["locked"],
};
const OPENING: Record<"open" | "edit" | "add", Protection[]> = {
  open: ["frozen", "sealed"],
  edit: ["frozen"],
  add: ["sealed"],
};

/** Every structural rule in the trie, with its authored directory. */
function rules(node: TrieNode, at = ""): { rule: StructuralRule; directory: string }[] {
  const found: { rule: StructuralRule; directory: string }[] = [];
  for (const child of node.children.values()) {
    if (child.rule !== null) found.push({ rule: child.rule, directory: at });
    const below = at === "" ? child.display : `${at}/${child.display}`;
    found.push(...rules(child, below));
  }
  return found;
}

const parent = (at: string): string => at.includes("/") ? at.slice(0, at.lastIndexOf("/")) : "";
const leaf = (at: string): string => at.slice(at.lastIndexOf("/") + 1);

/** The module that speaks for exactly the set a target names. */
function resolveTarget(repository: Repository, cwd: string, target: string): Slot {
  const { config, espalier } = repository;
  const rulesRoot = path.join(config.root, config.espalierRoot);
  const relative = path.relative(config.root, path.resolve(cwd, target)).split(path.sep).join("/");
  const unknown = (reason: string): never => fail("guard_unknown_target", `${target}: ${reason}`, { target });
  if (relative.startsWith("..") || path.isAbsolute(relative)) unknown("outside this repository");
  if (relative === config.espalierRoot || relative.startsWith(`${config.espalierRoot}/`)) {
    unknown("a guard names repository paths, never the espalier's own modules; a feature works within the architecture");
  }
  const wantsDirectory = target.endsWith("/") || relative === ""
    || (existsSync(path.join(config.root, relative)) && statSync(path.join(config.root, relative)).isDirectory());
  const rulesDirectory = (at: string): boolean => {
    try { return statSync(path.join(rulesRoot, at)).isDirectory(); } catch { return false; }
  };

  // The espalier's own vocabulary first: a module or directory it already has.
  if (!wantsDirectory && espalier.modules.has(`${relative}.mjs`)) {
    const module = `${relative}.mjs`;
    const record = espalier.modules.get(module)!;
    const rule = rules(espalier.root).find((entry) => entry.rule.modulePath === module);
    return {
      target, module,
      scope: record.contract === undefined && rule !== undefined ? { kind: "rule", module } : { kind: "member" },
      ...(existsSync(path.join(config.root, relative)) ? { file: relative } : {}),
    };
  }
  if (wantsDirectory && rulesDirectory(relative)) {
    const module = relative === "" ? NODE_DESCRIPTION : `${relative}/${NODE_DESCRIPTION}`;
    const source = espalier.nodes.get(relative)?.source;
    if (source !== undefined && source !== NODE_DESCRIPTION) unknown(`its directory guidance is ${source}; run espalier migrate first`);
    return {
      target, module, scope: { kind: "directory", at: relative },
      ...(espalier.modules.has(module) ? {} : { create: { instanceOf: null } }),
    };
  }

  // A concrete directory the espalier admits through a contract: declare it.
  if (wantsDirectory) {
    const found = resolveDirectory(espalier, relative);
    if (!isDirectoryOwnership(found)) unknown("no directory of the espalier admits it");
    const authored = (found as { path: string }).path;
    if (parent(authored) !== parent(relative)) {
      unknown(`it lies under ${parent(relative)}/, which the espalier admits only through ${parent(authored)}/; declare ${parent(relative)}/ first`);
    }
    return {
      target, module: `${relative}/${NODE_DESCRIPTION}`, scope: { kind: "directory", at: relative },
      create: { instanceOf: `../${leaf(authored)}` },
    };
  }

  // A group: a rule's name with its grouping's captures written as values.
  // Brackets are the espalier's, so this comes before reading it as a file.
  if (relative.includes("[") && rulesDirectory(parent(relative))) {
    const name = leaf(relative);
    const candidates = rules(espalier.root).filter(({ rule, directory }) => {
      if (directory !== parent(relative) || rule.module.groups.length === 0) return false;
      const bound = boundCaptures(leaf(declaration(rule.modulePath)), name);
      if (bound === null || Object.keys(bound).length === 0) return false;
      const names = Object.keys(bound).sort().join();
      return rule.module.groups.some((grouping) => [...grouping.by].sort().join() === names);
    });
    if (candidates.length > 1) {
      fail("guard_ambiguous_target", `${target} names a group of ${candidates.map(({ rule }) => rule.modulePath).join(" and ")}; declare it by hand`, { target });
    }
    if (candidates.length === 1) {
      return {
        target, module: `${relative}.mjs`, scope: { kind: "member" },
        create: { instanceOf: `${leaf(declaration(candidates[0]!.rule.modulePath))}.mjs` },
      };
    }
  }

  // A concrete file: its own rule when it has a fixed name, else a declaration.
  const owner = resolve(espalier, relative);
  if (isOwnership(owner)) {
    const authored = declaration(owner.rule.modulePath);
    if (parent(authored) !== parent(relative)) {
      unknown(`its rule ${owner.rule.modulePath} is declared under ${parent(authored)}/; open ${parent(relative)}/ instead, or declare the file by hand`);
    }
    return {
      target, module: `${relative}.mjs`, scope: { kind: "member" },
      ...(existsSync(path.join(config.root, relative)) ? { file: relative } : {}),
      create: { instanceOf: `${leaf(authored)}.mjs` },
    };
  }
  return unknown("the espalier admits no such file, directory, group or pattern");
}

/** Whether a module lies beneath a closed directory, through a contract or not. */
function beneath(espalier: Espalier, module: string, at: string, throughContracts: boolean): boolean {
  // A directory module speaks for its own directory, a rule for the one it sits in.
  const directory = parent(module);
  const under = (candidate: string): boolean => at === "" || candidate === at || candidate.startsWith(`${at}/`);
  return throughContracts ? contractDirectories(espalier.nodes, directory).some(under) : under(directory);
}

/** A module's current export values, as the compiled espalier read them. */
async function exported(rulesRoot: string, module: string): Promise<Record<string, unknown>> {
  try {
    return await import(moduleUrl(path.join(rulesRoot, module))) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function guard(options: GuardOptions, reporter: Reporter): Promise<number> {
  const repository = await open(options.config, options.cwd);
  const { config, espalier } = repository;
  const rulesRoot = path.join(config.root, config.espalierRoot);
  const shown = (module: string): string => `${config.espalierRoot}/${module}`;

  const already = guardedModules(rulesRoot, espalier.modules.keys());
  if (already.length > 0) {
    fail("already_guarded", `a guard is already in place in ${already.map(shown).join(", ")}; run espalier unguard first`, { modules: already.map(shown) });
  }
  const closing = (Object.keys(CLOSING) as (keyof typeof CLOSING)[]).flatMap((flag) => options[flag].map((target) => ({ flag, target })));
  const opening = (Object.keys(OPENING) as (keyof typeof OPENING)[]).flatMap((flag) => options[flag].map((target) => ({ flag, target })));
  if (closing.length === 0 && opening.length === 0) {
    fail("missing_argument", "guard needs something to close or open: --close, --freeze, --seal, --lock, --open, --edit or --add");
  }

  // What each module's exports become: a value, or null to take a reopening away.
  interface Planned { slot: Slot; settings: Partial<Record<Protection, Setting>>; closed: Set<Protection> }
  const plan = new Map<string, Planned>();
  const entry = (slot: Slot): Planned => {
    const existing = plan.get(slot.module);
    if (existing !== undefined) return existing;
    const created: Planned = { slot, settings: {}, closed: new Set<Protection>() };
    plan.set(slot.module, created);
    return created;
  };

  for (const { flag, target } of closing) {
    const slot = resolveTarget(repository, options.cwd, target);
    const planned = entry(slot);
    for (const protection of CLOSING[flag]) {
      planned.settings[protection] = true;
      planned.closed.add(protection);
    }
    // Closing covers everything beneath: a reopening there would leave a hole.
    const below = [...espalier.modules.keys()].filter((module) => module !== slot.module && (
      slot.scope.kind === "directory" ? beneath(espalier, module, slot.scope.at, true)
        : slot.scope.kind === "rule" ? espalier.modules.get(module)?.contract === slot.module
          : false));
    for (const module of below) {
      const values = await exported(rulesRoot, module);
      for (const protection of CLOSING[flag]) {
        if (values[protection] !== false) continue;
        // Only a directory reopens a seal, and a lock follows directories, not contracts.
        const directoryModule = module === NODE_DESCRIPTION || module.endsWith(`/${NODE_DESCRIPTION}`);
        if (protection === "sealed" && !directoryModule) continue;
        if (protection === "locked" && (slot.scope.kind !== "directory" || !beneath(espalier, module, (slot.scope as { at: string }).at, false))) continue;
        const reopening = entry({ target, module, scope: { kind: "member" } });
        if (reopening.settings[protection] === undefined) reopening.settings[protection] = null;
      }
    }
  }

  for (const { flag, target } of opening) {
    const slot = resolveTarget(repository, options.cwd, target);
    if (flag !== "edit" && slot.scope.kind !== "directory") {
      fail("guard_invalid_target", `${target}: --${flag} opens a directory for new files, and this is not one; a single file is opened with --edit`, { target });
    }
    if (flag === "edit" && slot.scope.kind === "member" && slot.file === undefined && !target.includes("[")) {
      fail("guard_invalid_target", `${target} does not exist; to let the work create it, open its directory with --add or --open`, { target });
    }
    const planned = entry(slot);
    for (const protection of OPENING[flag]) {
      if (planned.closed.has(protection)) {
        fail("guard_conflict", `${target} is both closed and opened for ${protection}; name it once`, { target, export: protection });
      }
      planned.settings[protection] = false;
    }
  }

  // Plan every write before making one.
  const writes: { module: string; contents: string; created: boolean }[] = [];
  for (const [module, { slot, settings }] of [...plan].sort(([a], [b]) => a.localeCompare(b))) {
    const absolute = path.join(rulesRoot, module);
    if (existsSync(absolute)) {
      const source = readFileSync(absolute, "utf8");
      const guarded = markExports(source, settings, shown(module));
      if (guarded !== source) writes.push({ module, contents: guarded, created: false });
      continue;
    }
    const values = (Object.entries(settings) as [Protection, Setting][]).filter(([, value]) => value !== null);
    if (values.length === 0) continue;
    const instanceOf = slot.create?.instanceOf ?? null;
    writes.push({
      module, created: true,
      contents: createdModule([
        ...(instanceOf === null ? [] : [`export const instanceOf = ${JSON.stringify(instanceOf)};`]),
        ...values.map(([name, value]) => `export const ${name} = ${value};`),
      ]),
    });
  }

  if (options.dryRun) {
    for (const write of writes) reporter.record({ kind: "written", path: shown(write.module) });
    return 0;
  }

  const originals = new Map<string, string | null>();
  const createdDirectories: string[] = [];
  const takeBack = (): void => {
    for (const [module, contents] of originals) {
      const absolute = path.join(rulesRoot, module);
      if (contents === null) rmSync(absolute, { force: true });
      else writeFileSync(absolute, contents, "utf8");
    }
    for (const directory of createdDirectories.reverse()) rmSync(directory, { recursive: true, force: true });
  };
  try {
    for (const write of writes) {
      const absolute = path.join(rulesRoot, write.module);
      originals.set(write.module, write.created ? null : readFileSync(absolute, "utf8"));
      let missing = path.dirname(absolute);
      const toCreate: string[] = [];
      while (!existsSync(missing)) { toCreate.unshift(missing); missing = path.dirname(missing); }
      createdDirectories.push(...toCreate);
      mkdirSync(path.dirname(absolute), { recursive: true });
      writeFileSync(absolute, write.contents, "utf8");
    }
    // The guarded espalier must compile, or the guard is taken back.
    reimportModules();
    await open(options.config, options.cwd);
  } catch (cause) {
    takeBack();
    reimportModules();
    if (cause instanceof OperationalError) {
      fail("guard_invalid", `the guard would leave an espalier that does not compile, so nothing was written: ${cause.message}`, { cause: cause.code });
    }
    throw cause;
  }
  for (const write of writes) reporter.record({ kind: "written", path: shown(write.module) });
  if (!options.build) return 0;
  return await build({ cwd: options.cwd, config: options.config, check: false, force: false }, reporter);
}
