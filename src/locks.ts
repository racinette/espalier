// Checking a change against a base revision: the espalier against the locks
// in force there, and the files against what was frozen and sealed there. docs/LOCKS.MD
// "Checking against a base revision".
//
// Every question is answered from the base: a change is judged by the locks
// that were in force before it, so a change cannot unlock what it edits. A
// module is compared together with every repository file it imports, since a
// locked rule changes when a helper it imports does.

import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { directoryLock, type Espalier, type ModuleRecord } from "./compile.js";
import { loadConfig, type Config } from "./config.js";
import { hashFiles, ignoredEntries, listTree, readObjects, resolveRevision, type TreeEntry } from "./git.js";
import { fileFrozen, fileSeals, isOwnership } from "./match.js";
import { openConfig, type Repository } from "./repository.js";
import { fail, OperationalError } from "./errors.js";
import { init, parse } from "es-module-lexer";

/** One change a lock forbids without explicit authorization. */
export interface LockViolation {
  /** Espalier-relative module path. */
  module: string;
  code: "locked_module_changed" | "locked_directory_changed" | "lock_changed" | "untraceable_import";
  message: string;
  /** The module whose `locked` export decided it; null for a lock change, which needs no lock. */
  lockedBy: string | null;
}

/**
 * A repository file that changed and that locked modules import, reported
 * once on the file rather than once per module, since one edit is one change.
 */
export interface ImportViolation {
  /** Repository-relative path of the file that changed. */
  file: string;
  code: "locked_module_changed";
  message: string;
  /** The locked modules that import it, and the modules whose `locked` exports decided each. */
  modules: string[];
  lockedBy: string[];
}

/** Both sides of the comparison: an espalier and where its files live. */
interface Side {
  config: Config;
  espalier: Espalier;
  /** Absolute espalier root. */
  rules: string;
}

/** The base revision, opened as a repository of its own. */
export interface Base {
  side: Side;
  repository: Repository;
  /** Tracked files at the base, by path relative to the repository root. */
  tree: Map<string, TreeEntry>;
  /** Removes the temporary copy. */
  dispose(): void;
}

/** The nearest `node_modules` at or above a directory, which the base's imports resolve from. */
function nearestPackages(from: string): string | null {
  for (let directory = from; ; directory = path.dirname(directory)) {
    const candidate = path.join(directory, "node_modules");
    if (existsSync(candidate)) return candidate;
    if (path.dirname(directory) === directory) return null;
  }
}

/**
 * Opens a git revision of this repository as a repository of its own. Its
 * tracked files are written to a temporary directory, and the project's
 * installed packages are linked beside it, outside the copy, so the base's
 * rule modules import what the head's would and no walk wanders into them.
 * Null when the revision has no espalier, and so no locks.
 */
export async function loadBase(root: string, revision: string): Promise<Base | null> {
  const commit = resolveRevision(root, revision);
  const tree = listTree(root, commit);
  if (!tree.has("espalier.config.yaml")) return null;
  const holder = mkdtempSync(path.join(os.tmpdir(), "espalier-base-"));
  const mirror = path.join(holder, "repository");
  const dispose = (): void => rmSync(holder, { recursive: true, force: true });
  try {
    const contents = readObjects(root, [...tree.values()].map((entry) => entry.object));
    for (const [file, entry] of tree) {
      const target = path.join(mirror, file);
      mkdirSync(path.dirname(target), { recursive: true });
      const data = contents.get(entry.object)!;
      if (entry.mode === "120000") symlinkSync(data.toString("utf8"), target);
      else writeFileSync(target, data, { mode: entry.mode === "100755" ? 0o755 : 0o644 });
    }
    // Installed packages are linked beside the copy, where resolution finds
    // them and no walk does. Other ignored build output, which a module may
    // import by the package's own name, is linked into the copy, where the
    // base's own ignore files keep it out of governance as they do here.
    const packages = nearestPackages(root);
    if (packages !== null) symlinkSync(packages, path.join(holder, "node_modules"), "dir");
    for (const entry of ignoredEntries(root)) {
      if (entry === "node_modules" || existsSync(path.join(mirror, entry))) continue;
      symlinkSync(path.join(root, entry), path.join(mirror, entry));
    }

    let repository: Repository;
    try {
      repository = await openConfig(loadConfig(undefined, mirror, { ignoreVersionRecords: true }));
    } catch (cause) {
      // Said as the base's failure, so it is not mistaken for one in the change.
      if (!(cause instanceof OperationalError)) throw cause;
      fail("base_unreadable", `${revision} could not be read: ${cause.message}`, { revision, cause: cause.code });
    }
    const { config } = repository;
    return { side: { config, espalier: repository.espalier, rules: path.join(config.root, config.espalierRoot) }, repository, tree, dispose };
  } catch (cause) {
    dispose();
    throw cause;
  }
}

/** A frozen file at the base that the working tree changed or removed. */
export interface FrozenViolation {
  path: string;
  /** The module whose `frozen` export decided it. */
  frozenBy: string | null;
  deleted: boolean;
  /** Its rule is a pattern, so a new file can take its place; a named file has no such sibling. */
  appendable: boolean;
}

/**
 * Every file frozen at the base whose content differs in the working tree,
 * or which is gone. New files are never violations: a frozen collection is
 * append-only. docs/LOCKS.MD "Frozen files".
 */
export function frozenViolations(base: Base, root: string): FrozenViolation[] {
  const frozen: Array<{ path: string; by: string | null; appendable: boolean }> = [];
  for (const file of base.repository.visible) {
    const owner = base.repository.resolve(file);
    if (!isOwnership(owner)) continue;
    const freeze = fileFrozen(base.repository.espalier, file, owner);
    if (freeze.frozen && base.tree.has(file)) frozen.push({ path: file, by: freeze.by, appendable: owner.rule.segments?.at(-1)?.dynamic === true });
  }
  const exists = (file: string): boolean => { try { lstatSync(path.join(root, file)); return true; } catch { return false; } };
  const present = new Set(frozen.filter((entry) => exists(entry.path)).map((entry) => entry.path));
  const isLink = (file: string): boolean => base.tree.get(file)!.mode === "120000";
  const hashes = hashFiles(root, [...present].filter((file) => !isLink(file)));
  const linked = readObjects(root, [...present].filter(isLink).map((file) => base.tree.get(file)!.object));
  const violations: FrozenViolation[] = [];
  for (const entry of frozen) {
    const was = base.tree.get(entry.path)!;
    let changed: boolean;
    if (!present.has(entry.path)) changed = true;
    else if (isLink(entry.path)) {
      let target: string | null = null;
      try { target = readlinkSync(path.join(root, entry.path)); } catch { /* no longer a link */ }
      changed = target !== linked.get(was.object)!.toString("utf8");
    } else changed = hashes.get(entry.path) !== was.object;
    if (changed) violations.push({ path: entry.path, frozenBy: entry.by, deleted: !present.has(entry.path), appendable: entry.appendable });
  }
  return violations;
}

/** A file that joined or left a collection sealed at the base. */
export interface SealViolation {
  path: string;
  /** True when it joined; false when it left, by removal or a rename. */
  added: boolean;
  /** The modules whose `sealed` exports sealed the collections it changed. */
  sealedBy: string[];
}

/**
 * Every file that joined or left a collection sealed at the base. Both sides
 * are read by the base's espalier, since a change is judged by the seals in
 * force before it. A sealed grouping changes only when a whole group joins or
 * leaves it. docs/LOCKS.MD "Sealed collections".
 */
export function sealedViolations(base: Base, head: Repository): SealViolation[] {
  const { espalier } = base.repository;
  const members = (files: Iterable<string>): Map<string, { by: string; files: Map<string, string | undefined> }> => {
    const collections = new Map<string, { by: string; files: Map<string, string | undefined> }>();
    for (const file of files) {
      for (const seal of fileSeals(espalier, file, base.repository.resolve(file))) {
        let collection = collections.get(seal.key);
        if (collection === undefined) collections.set(seal.key, collection = { by: seal.by, files: new Map() });
        collection.files.set(file, seal.group);
      }
    }
    return collections;
  };
  const before = members(base.repository.visible.filter((file) => base.tree.has(file)));
  const after = members(head.visible);
  const found = new Map<string, SealViolation>();
  const report = (file: string, added: boolean, by: string): void => {
    const key = `${added} ${file}`;
    const violation = found.get(key) ?? { path: file, added, sealedBy: [] };
    if (!violation.sealedBy.includes(by)) violation.sealedBy.push(by);
    found.set(key, violation);
  };
  for (const [key, was] of before) {
    const now = after.get(key)?.files ?? new Map<string, string | undefined>();
    const groupsWere = new Set(was.files.values());
    const groupsNow = new Set(now.values());
    for (const [file, group] of was.files) {
      if (group === undefined ? !now.has(file) : !groupsNow.has(group)) report(file, false, was.by);
    }
    for (const [file, group] of now) {
      if (group === undefined ? !was.files.has(file) : !groupsWere.has(group)) report(file, true, was.by);
    }
  }
  return [...found.values()].sort((left, right) => left.path.localeCompare(right.path) || Number(left.added) - Number(right.added));
}

/** What a module's file and its local imports contain, by repository-relative path. */
interface Closure {
  files: Map<string, string>;
  /** An import whose target is computed, so no reading of the source can follow it. */
  untraceable: boolean;
}

/**
 * The module and every repository file reachable from it by relative
 * imports, read with a module lexer rather than guessed at. Packages and
 * `node:` built-ins are outside the repository's control and are not
 * followed; an import whose path is computed cannot be followed at all.
 */
function closure(entry: string, root: string, extra: string[] = []): Closure {
  const files = new Map<string, string>();
  let untraceable = false;
  const pending = [entry, ...extra];
  while (pending.length > 0) {
    const absolute = pending.pop()!;
    const relative = path.relative(root, absolute).split(path.sep).join("/");
    if (files.has(relative) || relative.startsWith("..") || !existsSync(absolute) || !statSync(absolute).isFile()) continue;
    const source = readFileSync(absolute, "utf8");
    files.set(relative, source);
    let imports: ReturnType<typeof parse>[0];
    try {
      [imports] = parse(source);
    } catch {
      // A file the lexer cannot read is one whose imports no check can name.
      untraceable = true;
      continue;
    }
    for (const found of imports) {
      const specifier = found.specifier;
      if (specifier === undefined || specifier === null) {
        untraceable = true;
        continue;
      }
      if (specifier.startsWith("./") || specifier.startsWith("../")) {
        pending.push(path.resolve(path.dirname(absolute), specifier));
      }
    }
  }
  return { files, untraceable };
}

/** The repository-relative files two closures differ on. */
function differs(before: Closure, after: Closure): string[] {
  const files = [...after.files].filter(([file, contents]) => before.files.get(file) !== contents).map(([file]) => file);
  return [...files, ...[...before.files.keys()].filter((file) => !after.files.has(file))];
}

/** "locked by src/core/ESPALIER.mjs", or "locked" when the module locks itself. */
const lockedBy = (module: string, by: string | null): string => by === null || by === module ? "locked" : `locked by ${by}`;

/**
 * Every change between the base's espalier and this one that a base lock
 * covers, and every lock export added, removed or changed.
 */
export async function lockViolations(base: Side, head: Side): Promise<Array<LockViolation | ImportViolation>> {
  await init;
  const violations: Array<LockViolation | ImportViolation> = [];
  const importers = new Map<string, Array<{ module: string; lockedBy: string | null }>>();
  const addons = (side: Side): string[] => side.config.addons === null ? [] : [path.resolve(side.config.root, side.config.addons)];
  const record = (side: Side, module: string): ModuleRecord | undefined => side.espalier.modules.get(module);
  const isRule = (module: string): boolean => !/(^|\/)ESPALIER\.(mjs|MD)$/.test(module);
  const closureOf = (side: Side, module: string): Closure =>
    closure(path.join(side.rules, module), side.config.root, isRule(module) ? addons(side) : []);
  const directoryOf = (module: string): string => {
    // A directory module is added to its directory, which its parent's lock governs.
    const cut = module.lastIndexOf("/");
    return cut === -1 ? "" : module.slice(0, cut);
  };

  const all = new Set([...base.espalier.modules.keys(), ...head.espalier.modules.keys()]);
  for (const module of [...all].sort()) {
    const before = record(base, module);
    const after = record(head, module);

    if (before?.lockExport !== after?.lockExport) {
      violations.push({
        module, code: "lock_changed", lockedBy: null,
        message: `${module} ${before?.lockExport === undefined ? "adds" : after?.lockExport === undefined ? "removes" : "changes"} its \`locked\` export, a policy change that always needs explicit authorization`,
      });
    }

    if (before !== undefined && after !== undefined) {
      const was = closureOf(base, module);
      const now = closureOf(head, module);
      const changed = differs(was, now);
      const itself = path.relative(base.config.root, path.join(base.rules, module)).split(path.sep).join("/");
      if (changed.length > 0 && before.locked) {
        // The module's own edit is its own; an imported file's is reported once, on that file.
        if (changed.includes(itself)) {
          violations.push({ module, code: "locked_module_changed", lockedBy: before.lockedBy, message: `${module} is ${lockedBy(module, before.lockedBy)} and changed` });
        }
        // A file it imports counts when that file itself changed or went away;
        // one it merely stopped or started importing is its own edit's doing.
        const touched = changed.filter((file) => file !== itself && (now.files.has(file)
          ? was.files.has(file)
          : !existsSync(path.join(head.config.root, file))));
        for (const file of touched) {
          importers.set(file, [...importers.get(file) ?? [], { module, lockedBy: before.lockedBy }]);
        }
      }
    } else {
      const added = before === undefined;
      const directory = directoryLock(base.espalier.nodes, directoryOf(module));
      if (directory.locked || (!added && before!.locked)) {
        const by = directory.locked ? directory.by : before!.lockedBy;
        violations.push({
          module, code: added ? "locked_directory_changed" : "locked_module_changed", lockedBy: by,
          message: added
            ? `${module} is added to a directory ${lockedBy("", by)}`
            : `${module} is removed, and it is ${lockedBy(module, by)}`,
        });
      }
    }

    // A lock is only as good as the reading of what the module depends on.
    if (after !== undefined && after.locked && closureOf(head, module).untraceable) {
      violations.push({
        module, code: "untraceable_import", lockedBy: after.lockedBy,
        message: `${module} is ${lockedBy(module, after.lockedBy)} and imports a computed path, which no check can follow; import with a literal path`,
      });
    }
  }
  for (const [file, modules] of [...importers].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    const named = modules.slice(0, 3).map((entry) => entry.module).join(", ");
    const more = modules.length > 3 ? ` and ${modules.length - 3} more` : "";
    violations.push({
      file, code: "locked_module_changed",
      modules: modules.map((entry) => entry.module),
      lockedBy: [...new Set(modules.flatMap((entry) => entry.lockedBy === null ? [] : [entry.lockedBy]))],
      message: modules.length === 1
        ? `${file} changed, and ${modules[0]!.module}, which imports it, is ${lockedBy(modules[0]!.module, modules[0]!.lockedBy)}`
        : `${file} changed, and ${modules.length} locked modules import it: ${named}${more}`,
    });
  }
  return violations;
}
