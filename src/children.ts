// Where one espalier's authority ends. docs/CONFIG.MD "Nested espaliers".

import path from "node:path";
import { CONFIG_FILENAME } from "./config.js";
import { ignores, type IgnoreRule } from "./ignore.js";

/**
 * The child espaliers directly below this root: every directory holding a
 * config of its own that `ignore` does not match.
 *
 * `ignore` is consulted first, and demotes a config to plain content. That is
 * what a repository storing configs as data needs — this one keeps sixty under
 * `fixtures/` — and it is the only way to say a config is not a boundary.
 *
 * One boundary deep is all a run ever sees. A config inside a child belongs to
 * that child's run, which finds it the same way, so the recursion rather than
 * this function is what gives nesting its depth.
 */
export function findChildren(
  candidates: string[],
  configRelative: string,
  ignoreRules: IgnoreRule[],
): string[] {
  const found: string[] = [];

  for (const candidate of candidates) {
    if (candidate === configRelative) continue;
    if (path.basename(candidate) !== CONFIG_FILENAME) continue;
    if (ignores(ignoreRules, candidate)) continue;

    const at = path.dirname(candidate);
    // A second config in the root directory itself, reachable only when
    // `--config` named a file by another name. There is no subtree to give up.
    if (at === ".") continue;
    // Candidates are sorted, so a child is always seen before its own children.
    if (found.some((child) => at === child || at.startsWith(`${child}/`))) continue;

    found.push(at);
  }

  return found;
}
