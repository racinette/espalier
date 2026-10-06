// Implementation loading without caching, and source-path recovery for loaders.
// docs/CACHE.MD "Implementation dependencies".
//
// tsx (and similar CJS interop) can stuff query identity into the pathname
// as `%3F…`. That is not a filesystem path. The recovery must work whether
// the current Node version triggers the rewrite or not.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { implementationFile, startImplementations } from "../src/implementation.js";

test("uncached sessions reload transitive helpers without collecting a dependency manifest", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "espalier-implementation-"));
  try {
    mkdirSync(path.join(root, "espalier"));
    mkdirSync(path.join(root, "support"));
    writeFileSync(path.join(root, "support", "grammar.wasm"), "grammar");
    writeFileSync(path.join(root, "espalier", "a.mjs"), 'export { shared } from "../helper.mjs";\n');
    writeFileSync(path.join(root, "espalier", "b.mjs"), 'export { shared } from "../helper.mjs";\n');
    writeFileSync(path.join(root, "helper.mjs"), 'import { answer } from "./deep.mjs";\nexport const shared = { answer };\n');
    for (const answer of ["first", "changed"]) {
      writeFileSync(path.join(root, "deep.mjs"), `export const answer = ${JSON.stringify(answer)};\n`);
      const session = startImplementations(root, "espalier", null, false);
      try {
        session.declare(["support/**/*.wasm"]);
        const a = await import(pathToFileURL(path.join(root, "espalier", "a.mjs")).href);
        const b = await import(pathToFileURL(path.join(root, "espalier", "b.mjs")).href);
        assert.equal(a.shared.answer, answer);
        assert.equal(a.shared, b.shared, "helpers must remain singletons within a run");
        const manifest = session.snapshot();
        assert.equal(manifest.files.size, 0);
        assert.equal(manifest.edges.size, 0);
        assert.equal(manifest.globs.size, 0);
        assert.deepEqual(manifest.conditions, []);
      } finally {
        session.close();
      }
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function encoded(source: string, query: string): string {
  const url = new URL(pathToFileURL(source).href);
  url.pathname += `%3F${query}`;
  url.search = "?tsx-commonjs-virtual-query=1";
  return url.href;
}

test("a tsx-encoded file URL recovers the source path", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "espalier-implementation-"));
  try {
    const source = path.join(root, "analyzer.ts");
    writeFileSync(source, "export const answer = 1;\n");
    assert.equal(
      implementationFile(encoded(source, "tsx-commonjs-export-preparse=1")),
      source,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a clean file URL is left alone", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "espalier-implementation-"));
  try {
    const source = path.join(root, "analyzer.ts");
    writeFileSync(source, "export const answer = 1;\n");
    assert.equal(implementationFile(pathToFileURL(source).href), source);
    assert.equal(
      implementationFile(`${pathToFileURL(source).href}?__espalier_run=1`),
      source,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a literal file whose name contains ? wins over its prefix", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "espalier-implementation-"));
  try {
    const source = path.join(root, "analyzer.ts");
    const literal = `${source}?tsx-commonjs-export-preparse=1`;
    writeFileSync(source, "prefix\n");
    writeFileSync(literal, "literal\n");
    const url = pathToFileURL(literal).href;
    assert.equal(implementationFile(url), literal);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the longest existing prefix before ? is the source", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "espalier-implementation-"));
  try {
    const source = path.join(root, "foo?bar.ts");
    writeFileSync(source, "source\n");
    const url = encoded(source, "tsx-commonjs-export-preparse=1");
    assert.equal(implementationFile(url), source);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a missing encoded path stays the encoded path", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "espalier-implementation-"));
  try {
    const missing = path.join(root, "gone.ts");
    const url = encoded(missing, "tsx-commonjs-export-preparse=1");
    assert.equal(implementationFile(url), `${missing}?tsx-commonjs-export-preparse=1`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("non-file URLs are not paths", () => {
  assert.equal(implementationFile("node:fs"), null);
  assert.equal(implementationFile("data:text/javascript,export default 1"), null);
});
