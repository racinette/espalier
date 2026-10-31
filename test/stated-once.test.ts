// Generated documents state author guidance once. src/render.ts guidance;
// docs/cli/build/README.MD "Stated once". Every fixture's expected documents
// are read together, and every guidance an author wrote must appear in them,
// and no more often than the authors wrote it. Fixed text the tool writes is not checked:
// it may repeat where that is cheaper than a reference.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { TrieNode } from "../src/compile.js";
import { open } from "../src/repository.js";

const fixtures = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "fixtures");

/** Shorter text is too likely to occur in the tool's own sentences to count. */
const SHORTEST = 20;

function documents(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const at = path.join(dir, entry);
    return statSync(at).isDirectory() ? documents(at) : [readFileSync(at, "utf8")];
  });
}

function occurrences(haystack: string, needle: string): number {
  let count = 0;
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + 1)) count += 1;
  return count;
}

/** Author text keyed by its source, so a rule cloned into many places counts once. */
function authored(node: TrieNode, into: Map<string, string>): void {
  if (node.rule !== null) {
    into.set(node.rule.modulePath, node.rule.module.guidance);
    for (const grouping of node.rule.module.groups) {
      into.set(`${node.rule.modulePath}#${grouping.name}`, grouping.guidance);
      for (const instance of grouping.instances) into.set(instance.modulePath, instance.module.guidance);
    }
  }
  for (const child of node.children.values()) authored(child, into);
}

for (const name of readdirSync(fixtures).sort()) {
  const dir = path.join(fixtures, name);
  if (!existsSync(path.join(dir, "expected-build")) || !existsSync(path.join(dir, "espalier.config.yaml"))) continue;
  test(`${name}: generated documents state author guidance once`, async () => {
    // Nested espaliers write their own guidance into the same tree.
    const sources = new Map<string, string>();
    const collect = async (root: string): Promise<void> => {
      const repository = await open(undefined, root);
      const { espalier } = repository;
      const local = new Map<string, string>();
      authored(espalier.root, local);
      for (const constraint of espalier.constraints) local.set(constraint.modulePath, constraint.module.guidance);
      for (const [at, doc] of espalier.nodes) local.set(`${at}/`, doc.body);
      for (const [key, text] of local) sources.set(`${root}:${key}`, text);
      for (const child of repository.children) await collect(path.join(root, child));
    };
    await collect(dir);
    const written = [...sources.values()].map((text) => text.trim());
    const corpus = written.join("\n\0\n");
    const generated = documents(path.join(dir, "expected-build")).join("\n\0\n");
    for (const text of new Set(written)) {
      if (text.length < SHORTEST) continue;
      const allowed = occurrences(corpus, text);
      const found = occurrences(generated, text);
      assert.ok(found <= allowed, `"${text.slice(0, 60)}…" appears ${found} times in the generated documents and is written ${allowed}`);
      assert.ok(found >= 1, `"${text.slice(0, 60)}…" is written and appears in no generated document`);
    }
  });
}
