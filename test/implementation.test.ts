// Recovering a source path from a loader-encoded `file:` URL.
// docs/cli/lint/README.MD "Implementation dependencies".
//
// tsx (and similar CJS interop) can stuff query identity into the pathname
// as `%3F…`. That is not a filesystem path. The recovery must work whether
// the current Node version triggers the rewrite or not.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { implementationFile } from "../src/implementation.js";

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
