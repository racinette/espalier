// Checking a change to the espalier against the locks of a base checkout.
// docs/LOCKS.MD "Enforcing locks".
//
// Every question is answered from the base: a change is judged by the locks
// that were in force before it, so a change cannot unlock what it edits. A
// module is compared together with every repository file it imports, since a
// locked rule changes when a helper it imports does.

import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { compile, directoryLock, type Espalier, type ModuleRecord } from "./compile.js";
import { loadConfig, type Config } from "./config.js";
import { fail, OperationalError } from "./errors.js";
import { init, parse } from "es-module-lexer";

/** One change a lock forbids without explicit authorization. */
export interface LockViolation {
  /** Espalier-relative module path. */
  module: string;
  code: "locked_module_changed" | "locked_directory_changed" | "locked_contract_changed" | "lock_changed" | "untraceable_import";
  message: string;
  /** The module whose `locked` export decided it; null for a lock change, which needs no lock. */
  lockedBy: string | null;
  /** A file the module imports, when that file is what changed. */
  via?: string;
}

/** Both sides of the comparison: an espalier and where its files live. */
interface Side {
  config: Config;
  espalier: Espalier;
  /** Absolute espalier root. */
  rules: string;
}

/** Compiles the base checkout's espalier with the base's own configuration. */
export async function loadBase(base: string): Promise<Side | null> {
  if (!existsSync(path.join(base, "espalier.config.yaml"))) return null;
  let config: Config;
  try {
    config = loadConfig(undefined, base);
  } catch (cause) {
    if (cause instanceof OperationalError && cause.code === "version_mismatch") {
      fail("base_unreadable", `the base checkout at ${base} pins a different espalier version; lock checks compare two espaliers read by the same version`, { base });
    }
    throw cause;
  }
  let espalier: Espalier;
  try {
    espalier = await compile(config.root, config.espalierRoot, config.skip, config);
  } catch (cause) {
    // Said as the base's failure, so it is not mistaken for one in the change.
    if (!(cause instanceof OperationalError)) throw cause;
    fail("base_unreadable", `the base checkout at ${base} could not be read: ${cause.message}`, { base, cause: cause.code });
  }
  return { config, espalier, rules: path.join(config.root, config.espalierRoot) };
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

/** The repository-relative file a closure entry differs on, or null when both sides agree. */
function differs(before: Closure, after: Closure): string | null {
  for (const [file, contents] of after.files) if (before.files.get(file) !== contents) return file;
  for (const file of before.files.keys()) if (!after.files.has(file)) return file;
  return null;
}

/** "locked by src/core/ESPALIER.mjs", or "locked" when the module locks itself. */
const lockedBy = (module: string, by: string | null): string => by === null || by === module ? "locked" : `locked by ${by}`;

/**
 * Every change between the base's espalier and this one that a base lock
 * covers, and every lock export added, removed or changed.
 */
export async function lockViolations(base: Side, head: Side): Promise<LockViolation[]> {
  await init;
  const violations: LockViolation[] = [];
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
  // A declaration joins or leaves its contract's member list, which a locked
  // abstract contract declares. A declared group belongs to an abstract grouping.
  const contractLocked = (declared: ModuleRecord | undefined): ModuleRecord | null => {
    if (declared?.contract === undefined) return null;
    const contract = record(base, declared.contract);
    if (contract === undefined || !contract.locked) return null;
    return contract.abstract || contract.abstractGroupings.length > 0 ? contract : null;
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
      const via = differs(closureOf(base, module), closureOf(head, module));
      if (via !== null && before.locked) {
        const itself = via === path.relative(base.config.root, path.join(base.rules, module)).split(path.sep).join("/");
        violations.push({
          module, code: "locked_module_changed", lockedBy: before.lockedBy, ...(itself ? {} : { via }),
          message: itself
            ? `${module} is ${lockedBy(module, before.lockedBy)} and changed`
            : `${module} is ${lockedBy(module, before.lockedBy)}, and ${via}, which it imports, changed`,
        });
      }
      if (before.contract !== after.contract) {
        for (const contract of [contractLocked(before), contractLocked(after)]) {
          if (contract !== null) violations.push({
            module, code: "locked_contract_changed", lockedBy: contract.lockedBy,
            message: `${module} changes which contract it belongs to, and the member list of ${contract.path} is ${lockedBy(contract.path, contract.lockedBy)}`,
          });
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
      const contract = contractLocked(added ? after : before);
      if (contract !== null) {
        violations.push({
          module, code: "locked_contract_changed", lockedBy: contract.lockedBy,
          message: `${module} ${added ? "declares a new member of" : "removes a member of"} ${contract.path}, whose member list is ${lockedBy(contract.path, contract.lockedBy)}`,
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
  return violations;
}
