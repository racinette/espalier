// Fresh coordinator rule implementations. docs/API.MD "check".

import { statSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

interface Session { token: string; ruleRoot: string; addon: string | null; tracked: Set<string> }
const sessions = new Set<Session>();
let registration: ReturnType<typeof registerHooks> | null = null;
let nextToken = 1;

function isFile(filename: string): boolean {
  try {
    return statSync(filename).isFile();
  } catch {
    return false;
  }
}

/**
 * Loaders such as tsx may append `%3F` plus query identity to a `file:`
 * pathname so Node treats each CJS interop URL as a distinct module. That
 * encoded path is not on disk. Prefer the longest prefix before `?` that is
 * a real file, so stamps follow the source on Node versions that rewrite
 * and on those that do not.
 */
function recoverSource(filename: string): string {
  if (filename.indexOf("?") === -1 || isFile(filename)) return filename;
  let best: string | null = null;
  for (let cut = filename.indexOf("?"); cut !== -1; cut = filename.indexOf("?", cut + 1)) {
    const candidate = filename.slice(0, cut);
    if (isFile(candidate)) best = candidate;
  }
  return best ?? filename;
}

/** Absolute path for a resolved `file:` URL, after loader-identity recovery. */
export function implementationFile(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "file:") return null;
    return recoverSource(path.resolve(fileURLToPath(parsed)));
  } catch {
    return null;
  }
}

function canonical(url: string | undefined): string | null {
  if (url === undefined) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "file:") {
      parsed.search = "";
      parsed.hash = "";
      const filename = implementationFile(parsed.href);
      if (filename === null) return parsed.href;
      const naive = path.resolve(fileURLToPath(parsed));
      return filename === naive ? parsed.href : pathToFileURL(filename).href;
    }
    return parsed.href;
  } catch {
    return null;
  }
}

function fileOf(url: string): string | null {
  return implementationFile(url);
}

function inheritedToken(url: string | undefined): string | null {
  if (url === undefined) return null;
  try {
    return new URL(url).searchParams.get("__espalier_run");
  } catch {
    return null;
  }
}

function inside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}


/** Fresh ES imports for coordinator checks; worker lifetimes isolate their imports. */
export function startImplementations(root: string, espalierRoot: string, addon: string | null): { close(): void } {
  if (registration === null) registration = registerHooks({
    resolve(specifier, context, nextResolve) {
      const result = nextResolve(specifier, context);
      const parent = canonical(context.parentURL);
      const child = canonical(result.url);
      if (child === null) return result;
      const filename = fileOf(child);
      if (filename === null) return result;
      for (const session of sessions) {
        if (!inside(session.ruleRoot, filename) && filename !== session.addon &&
            (parent === null || !session.tracked.has(parent))) continue;
        session.tracked.add(child);
        const url = new URL(result.url);
        url.searchParams.set("__espalier_run", inheritedToken(context.parentURL) ?? session.token);
        return { ...result, url: url.href };
      }
      return result;
    },
  });
  const session: Session = {
    token: String(nextToken++), ruleRoot: path.resolve(root, espalierRoot),
    addon: addon === null ? null : path.resolve(root, addon), tracked: new Set(),
  };
  sessions.add(session);
  return { close() { sessions.delete(session); } };
}
