// Reading a base revision from git, for `lint --base` only. docs/LOCKS.MD
// "Checking against a base revision".
//
// Nothing else in espalier consults git: the repository walk is a pure
// function of the working tree. A check that asks what changed needs a
// reference state, and git is where the project keeps it.

import { spawnSync } from "node:child_process";
import { fail } from "./errors.js";

/** One tracked entry at a revision: a blob, an executable blob, or a symlink. */
export interface TreeEntry {
  mode: string;
  object: string;
}

function git(root: string, args: string[], input?: string | Buffer): Buffer {
  const result = spawnSync("git", ["-C", root, ...args], {
    input,
    maxBuffer: 1024 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  if (result.error) {
    fail("base_unreadable", `git could not be run to read the base: ${result.error.message}`, { args });
  }
  if (result.status !== 0) {
    fail("base_unreadable", `git ${args[0]} failed: ${result.stderr.toString("utf8").trim()}`, { args });
  }
  return result.stdout;
}

/** The commit a revision names, or a failure naming the revision. */
export function resolveRevision(root: string, revision: string): string {
  const spawned = spawnSync("git", ["-C", root, "rev-parse", "--verify", "--quiet", `${revision}^{commit}`], { encoding: "utf8" });
  if (spawned.error) fail("base_unreadable", `git could not be run to read the base: ${spawned.error.message}`, { revision });
  if (spawned.status !== 0) {
    fail("base_unreadable", `${revision} is not a commit in the git repository at ${root}`, { revision });
  }
  return spawned.stdout.trim();
}

/**
 * Every tracked file under `root` at a commit, by path relative to `root`.
 * Submodules are another repository's business and are left out.
 */
export function listTree(root: string, commit: string): Map<string, TreeEntry> {
  const entries = new Map<string, TreeEntry>();
  for (const line of git(root, ["ls-tree", "-r", "-z", commit, "--", "."]).toString("utf8").split("\0")) {
    if (line === "") continue;
    const tab = line.indexOf("\t");
    const [mode, type, object] = line.slice(0, tab).split(" ");
    if (type !== "blob") continue;
    entries.set(line.slice(tab + 1), { mode: mode!, object: object! });
  }
  return entries;
}

/** The contents of objects, read in one batch. */
export function readObjects(root: string, objects: string[]): Map<string, Buffer> {
  const contents = new Map<string, Buffer>();
  const wanted = [...new Set(objects)];
  if (wanted.length === 0) return contents;
  const output = git(root, ["cat-file", "--batch"], `${wanted.join("\n")}\n`);
  let at = 0;
  for (const object of wanted) {
    const end = output.indexOf(0x0a, at);
    const header = output.subarray(at, end).toString("utf8").split(" ");
    if (header[1] === "missing") fail("base_unreadable", `git has no object ${object}`, { object });
    const size = Number(header[2]);
    contents.set(object, output.subarray(end + 1, end + 1 + size));
    at = end + 1 + size + 1;
  }
  return contents;
}

/**
 * The object id each working-tree file would have, with the repository's own
 * filters applied, so a line-ending conversion is not mistaken for an edit.
 */
export function hashFiles(root: string, paths: string[]): Map<string, string> {
  const hashes = new Map<string, string>();
  if (paths.length === 0) return hashes;
  const output = git(root, ["hash-object", "--stdin-paths"], `${paths.join("\n")}\n`).toString("utf8").trim().split("\n");
  paths.forEach((file, index) => hashes.set(file, output[index]!));
  return hashes;
}

/**
 * Top-level entries of the working tree that git ignores, such as build
 * output. A base revision's modules may import them, as a package importing
 * itself by name reaches its own `dist/`, and git never has them.
 */
export function ignoredEntries(root: string): string[] {
  const output = git(root, ["ls-files", "--others", "--ignored", "--exclude-standard", "--directory", "-z"]).toString("utf8");
  return [...new Set(output.split("\0").filter(Boolean).map((entry) => entry.replace(/\/$/, "")).filter((entry) => !entry.includes("/")))];
}
