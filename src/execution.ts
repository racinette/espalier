// Addon lifecycle and isolated lint invocations. docs/CONFIG.MD "addons".

import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createEmit, within } from "./context.js";
import { fail, OperationalError } from "./errors.js";
import { matchGlob } from "./files.js";
import type { CaptureValue } from "./match.js";
import type { Issue } from "./output.js";

export interface PrepareContext {
  files(pattern: string): Promise<string[]>;
  read(path: string): Promise<string>;
}

export type SourceSnapshot = Map<string, { contents: string } | { error: string }>;

/** Capture inputs once, deferring unreadable-file failures until a consumer reads. */
export function snapshot(root: string, visible: readonly string[]): SourceSnapshot {
  return new Map<string, { contents: string } | { error: string }>(visible.map((file) => {
    try { return [file, { contents: readFileSync(path.join(root, file), "utf8") }]; }
    catch (cause) { return [file, { error: (cause as Error).message }]; }
  }));
}

export function inputs(sources: SourceSnapshot, whose: string): PrepareContext {
  return {
    async files(pattern) { return [...sources.keys()].filter((file) => matchGlob(pattern, file)); },
    async read(target) {
      const normalized = within(target, whose);
      const source = sources.get(normalized);
      if (source === undefined) fail("read_ungoverned", `${whose}: "${normalized}" is not among the files this espalier governs — ignored, invisible, or absent`);
      if ("error" in source) fail("read_failed", `${whose}: could not read "${normalized}": ${source.error}`);
      return source.contents;
    },
  };
}

interface AddonModule {
  prepare?: (context: PrepareContext) => unknown;
  setup?: (prepared: unknown) => unknown;
}

async function loadAddon(filename: string | null): Promise<AddonModule> {
  if (filename === null) return {};
  let addon: AddonModule;
  try { addon = await import(pathToFileURL(filename).href); }
  catch (cause) { fail("addons_import_failed", `addons module could not be imported: ${(cause as Error).message}`); }
  if ("unobservedImplementationDependencies" in addon) fail("addons_invalid_export", "unobservedImplementationDependencies is not supported");
  for (const key of ["prepare", "setup"] as const) {
    if (addon[key] !== undefined && typeof addon[key] !== "function") {
      fail("addons_invalid_export", `addons ${key} must be a function`);
    }
  }
  return addon;
}

export async function prepareAddons(filename: string | null, sources: SourceSnapshot): Promise<unknown> {
  const addon = await loadAddon(filename);
  let prepared: unknown;
  try { prepared = await addon.prepare?.(inputs(sources, "addons prepare")); }
  catch (cause) {
    if (cause instanceof OperationalError) throw cause;
    fail("addons_prepare_failed", `addons prepare threw: ${(cause as Error).message}`);
  }
  try { return structuredClone(prepared); }
  catch (cause) { fail("addons_invalid_prepared", `addons prepare must return cloneable data: ${(cause as Error).message}`); }
}

export async function setupAddons(filename: string | null, prepared: unknown): Promise<{
  addons: Record<string, unknown>; dispose(): Promise<void>;
}> {
  const addon = await loadAddon(filename);
  let result: unknown;
  try { result = await addon.setup?.(prepared); }
  catch (cause) { fail("addons_setup_failed", `addons setup threw: ${(cause as Error).message}`); }
  if (result !== undefined && (result === null || typeof result !== "object" || Array.isArray(result))) {
    fail("addons_invalid_export", "addons setup must return an object or undefined");
  }
  const addons = (result ?? {}) as Record<string, unknown>;
  return { addons, async dispose() {
    try {
      const disposable = addons as Record<symbol, unknown>;
      if (typeof disposable[Symbol.asyncDispose] === "function") {
        await (disposable[Symbol.asyncDispose] as () => unknown).call(addons);
      } else if (typeof disposable[Symbol.dispose] === "function") {
        (disposable[Symbol.dispose] as () => unknown).call(addons);
      }
    } catch (cause) { fail("addons_dispose_failed", `addons disposal threw: ${(cause as Error).message}`); }
  } };
}

export interface Invocation {
  modulePath: string;
  pattern: string;
  path: string;
  captures: Record<string, CaptureValue>;
  ruleText: string | null;
  description: string | null;
  referenceImplementation: string | null;
  matches?: Array<{ path: string; captures: Record<string, CaptureValue> }>;
  patterns?: string[];
  /** A grouping of a dynamic structural rule: `module.groups[group].lint` runs over `matches`. */
  group?: string;
}
export type Job = Invocation[];
export interface WorkerInputs {
  ruleRoot: string;
  addon: string | null;
  prepared: unknown;
  sources: SourceSnapshot;
}
export interface Failure { code: string; message: string; detail: Record<string, unknown> }
export function failure(cause: unknown): Failure {
  return cause instanceof OperationalError
    ? { code: cause.code, message: cause.message, detail: cause.detail }
    : { code: "worker_failed", message: (cause as Error)?.message ?? String(cause), detail: {} };
}

export async function executeJob(data: WorkerInputs, job: Job, addons: Record<string, unknown>, record: (issue: Issue) => void): Promise<void> {
  for (const invocation of job) {
    const module = await import(pathToFileURL(path.join(data.ruleRoot, invocation.modulePath)).href);
    const context = inputs(data.sources, invocation.modulePath);
    const emit = createEmit({ ...invocation, record });
    try {
      // A module, or a grouping, may carry guidance and nothing to check.
      const check = invocation.group === undefined ? module.lint : module.groups[invocation.group].lint;
      if (typeof check !== "function") continue;
      if (invocation.group !== undefined) {
        await check({
          group: invocation.group, path: invocation.path, pattern: invocation.pattern, captures: invocation.captures,
          matches: invocation.matches, files: context.files, emit, addons,
          read: (target?: string) => {
            if (target === undefined) fail("read_failed", `${invocation.modulePath}: a grouping must name the file to read`);
            return context.read(target);
          },
        });
      } else if (invocation.matches !== undefined) {
        await check({
          matches: invocation.matches, patterns: invocation.patterns, files: context.files, emit, addons,
          read: (target?: string) => {
            if (target === undefined) fail("read_failed", `${invocation.modulePath}: an aggregate constraint must name the file to read`);
            return context.read(target);
          },
        });
      } else {
        await check({ path: invocation.path, pattern: invocation.pattern, captures: invocation.captures,
          read: (target?: string) => context.read(target ?? invocation.path), files: context.files, emit, addons });
      }
    } catch (cause) {
      if (cause instanceof OperationalError) throw cause;
      fail("rule_threw", `${invocation.modulePath} threw while linting ${invocation.path}: ${(cause as Error).message}`);
    }
  }
}
