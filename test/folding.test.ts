// Documentation folding across builds. docs/cli/build/README.MD "Folding subtrees".
// Fixtures pin the rendered content; these tests observe no-write checks,
// fold/unfold transitions, and adoption's treatment of existing documents.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VERSION } from '../src/version.js';

const cli = fileURLToPath(new URL('../src/cli.js', import.meta.url));
function run(root: string, args: string[]) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8' });
  if (result.error) throw result.error;
  return result;
}
function scratch(body: (root: string, put: (at: string, text: string) => void) => void) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'espalier-fold-'));
  const put = (at: string, text: string) => {
    mkdirSync(path.dirname(path.join(root, at)), { recursive: true });
    writeFileSync(path.join(root, at), text);
  };
  try {
    put('espalier.config.yaml', `pin: ${VERSION}\nignoreFiles: []\nskip: []\n`);
    put('espalier/src/ESPALIER.MD', 'Source guidance.\n');
    put('espalier/src/deep/[name].ts.mjs', 'export const description = "source";\nexport const rule = "Keep it local.";\nexport async function lint() {}\n');
    body(root, put);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test('fold checks do not write; folding removes marked documents and unfolding restores boundaries', () => {
  scratch((root, put) => {
    assert.equal(run(root, ['build']).status, 0);
    const paths = ['AGENTS.MD', 'src/AGENTS.MD', 'src/deep/AGENTS.MD'];
    const before = paths.map(at => readFileSync(path.join(root, at), 'utf8'));
    put('espalier/src/ESPALIER.MD', '---\nfold: true\n---\nSource guidance.\n');
    const check = run(root, ['build', '--check', '--format', 'jsonl']);
    assert.equal(check.status, 1, check.stdout + check.stderr);
    for (const at of paths.slice(1)) assert.match(check.stdout, new RegExp(`"path":"${at}","state":"stale"`));
    assert.deepEqual(paths.map(at => readFileSync(path.join(root, at), 'utf8')), before);
    assert.equal(run(root, ['build']).status, 0);
    assert.equal(existsSync(path.join(root, 'src/AGENTS.MD')), false);
    assert.equal(existsSync(path.join(root, 'src/deep/AGENTS.MD')), false);
    assert.equal(run(root, ['build', '--check']).status, 0);
    const folded = readFileSync(path.join(root, 'AGENTS.MD'), 'utf8');
    put('espalier/src/ESPALIER.MD', '---\nfold: false\n---\nSource guidance.\n');
    put('src/AGENTS.MD', 'Handwritten.\n');
    const blocked = run(root, ['build']);
    assert.equal(blocked.status, 2, blocked.stdout + blocked.stderr);
    assert.equal(readFileSync(path.join(root, 'AGENTS.MD'), 'utf8'), folded);
    assert.equal(readFileSync(path.join(root, 'src/AGENTS.MD'), 'utf8'), 'Handwritten.\n');
    assert.equal(existsSync(path.join(root, 'src/deep/AGENTS.MD')), false);
    assert.equal(run(root, ['build', '--force']).status, 0);
    assert.deepEqual(paths.map(at => readFileSync(path.join(root, at), 'utf8')), before);
  });
});

test('adopt respects folded document ownership and does not infer obsolete generated documents', () => {
  scratch((root, put) => {
    assert.equal(run(root, ['build']).status, 0);
    put('espalier/src/ESPALIER.MD', '---\nfold: true\n---\nSource guidance.\n');
    put('src/area/AGENTS.MD', 'Ordinary file below a fold.\n');
    put('src/area/main.ts', 'export {};\n');
    const adopted = run(root, ['adopt', 'src/area']);
    assert.equal(adopted.status, 0, adopted.stdout + adopted.stderr);
    assert.ok(existsSync(path.join(root, 'espalier/src/area/AGENTS.MD.mjs')));
    assert.equal(run(root, ['adopt', 'src/deep']).status, 0);
    assert.equal(existsSync(path.join(root, 'espalier/src/AGENTS.MD.mjs')), false);
    assert.equal(existsSync(path.join(root, 'espalier/src/deep/AGENTS.MD.mjs')), false);
    put('other/AGENTS.MD', 'Retained boundary conflict.\n');
    put('other/main.ts', 'export {};\n');
    const rejected = run(root, ['adopt', 'other']);
    assert.equal(rejected.status, 2, rejected.stdout + rejected.stderr);
    assert.equal(existsSync(path.join(root, 'espalier/other/main.ts.mjs')), false);
  });
});
