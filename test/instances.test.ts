// Cross-command specialization behavior. Fixtures pin matching; these tests
// observe removal invariants, template captures, and build/check transitions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { check } from '../src/api.js';
import { VERSION } from '../src/version.js';

const cli = fileURLToPath(new URL('../src/cli.js', import.meta.url));
const api = pathToFileURL(fileURLToPath(new URL('../src/api.js', import.meta.url))).href;
const rule = 'export const description="module"; export const rule="Shared obligation"; export function lint() {}\n';
function run(root: string, args: string[]) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8' });
  if (result.error) throw result.error;
  return result;
}
async function scratch(body: (root: string, put: (name: string, contents: string) => void) => void | Promise<void>) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'espalier-instances-'));
  const put = (name: string, contents: string) => {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), contents);
  };
  try {
    put('espalier.config.yaml', `pin: ${VERSION}\nignoreFiles: []\nskip: []\n`);
    await body(root, put);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test('named directory creation uses inherited template captures, and guidance stays local', async () => {
  await scratch(async (root, put) => {
    put('espalier/[group]/ESPALIER.mjs', 'export const guidance="COMMON CONTRACT";');
    put('espalier/[group]/{group}.ts.mjs', `${rule}import {createTemplate} from ${JSON.stringify(api)};\nexport const template=createTemplate(({captures})=> '// '+captures.group);`);
    put('espalier/flights/ESPALIER.mjs', 'export const instanceOf="../[group]"; export async function guidance({config,path,captures}) { return `DOMAIN ${path} ${captures.group} ${config.build.guidanceMode}`; }');
    const created = run(root, ['create', 'flights']);
    assert.equal(created.status, 0, created.stdout + created.stderr);
    assert.equal(readFileSync(path.join(root, 'flights/flights.ts'), 'utf8'), '// flights');
    assert.deepEqual(await check({cwd:root, jobs:1}), []);
    const build = run(root, ['build']);
    assert.equal(build.status, 0, build.stdout + build.stderr);
    const local = readFileSync(path.join(root, 'flights/AGENTS.MD'), 'utf8');
    assert.match(local, /DOMAIN flights flights evolving/);
    assert.match(local, /Shared contract/);
    assert.match(local, /flights\.ts/);
    assert.doesNotMatch(local, /\{group\}\.ts/);
    assert.doesNotMatch(local, /COMMON CONTRACT|Shared obligation/);
    assert.match(readFileSync(path.join(root, 'AGENTS.MD'), 'utf8'), /COMMON CONTRACT/);
    assert.equal(run(root, ['build','--check']).status, 0);
    put('espalier.config.yaml', `pin: ${VERSION}\nignoreFiles: []\nskip: []\nbuild: {guidanceMode: fixed}\n`);
    assert.equal(run(root, ['build','--check']).status, 1);
    assert.equal(readFileSync(path.join(root, 'flights/AGENTS.MD'), 'utf8'), local);
    assert.equal(run(root, ['build']).status, 0);
    assert.match(readFileSync(path.join(root, 'flights/AGENTS.MD'), 'utf8'), /DOMAIN flights flights fixed/);
    rmSync(path.join(root, 'espalier/flights'), {recursive:true});
    assert.deepEqual(await check({cwd:root, jobs:2}), []);
  });
});

test('optional named leaves apply per existing dynamic parent without requiring new parents', async () => {
  await scratch(async (root, put) => {
    put('espalier/[group]/[area]/[module].ts.mjs', rule);
    put('espalier/flights/ESPALIER.mjs', 'export const instanceOf="../[group]";');
    put('espalier/flights/[area]/offline.ts.mjs', `${rule}export const instanceOf="[module].ts.mjs"; export const optional=true;`);
    mkdirSync(path.join(root, 'flights'));
    assert.deepEqual(await check({cwd:root, jobs:1}), []);
    put('flights/search/other.ts', '');
    assert.deepEqual(await check({cwd:root, jobs:1}), []);
    put('espalier/flights/[area]/offline.ts.mjs', `${rule}export const instanceOf="[module].ts.mjs";`);
    assert.deepEqual((await check({cwd:root, jobs:1})).map(({path,code})=>({path,code})), [{path:'flights/search/offline.ts',code:'missing_required_file'}]);
    put('flights/search/offline.ts', '');
    assert.deepEqual(await check({cwd:root, jobs:1}), []);
    rmSync(path.join(root, 'espalier/flights'), {recursive:true});
    assert.deepEqual(await check({cwd:root, jobs:1}), []);
  });
});

test('optional directory instances require their inherited contents only when present', async () => {
  await scratch(async (root, put) => {
    put('espalier/[group]/model.ts.mjs', rule);
    put('espalier/flights/ESPALIER.mjs', 'export const instanceOf="../[group]"; export const optional=true;');
    assert.deepEqual(await check({cwd:root, jobs:1}), []);
    mkdirSync(path.join(root, 'flights'));
    assert.equal((await check({cwd:root, jobs:1}))[0]?.code, 'missing_required_file');
    put('flights/model.ts', '');
    assert.deepEqual(await check({cwd:root, jobs:1}), []);
  });
});

test('named files count toward minMatches, which can exceed one', async () => {
  await scratch(async (root, put) => {
    put('espalier/[module].ts.mjs', `${rule}export const minMatches=2;`);
    put('espalier/search.ts.mjs', `${rule}export const instanceOf="[module].ts.mjs";`);
    put('search.ts','');
    const issues = await check({cwd:root, jobs:1});
    assert.equal(issues.length,1);
    assert.equal(issues[0]?.code,'missing_required_match');
    put('other.ts','');
    assert.deepEqual(await check({cwd:root, jobs:1}), []);
    rmSync(path.join(root,'espalier/search.ts.mjs'));
    assert.deepEqual(await check({cwd:root, jobs:1}), []);
  });
});

for (const [name, files] of Object.entries({
  unsupported: {'espalier/[group]/model.ts.mjs':rule,'espalier/flights/ESPALIER.mjs':'export const instanceOf="../[group]";', 'espalier/flights/new.ts.mjs':rule},
  weaker: {'espalier/[group]/model.ts.mjs':rule,'espalier/flights/ESPALIER.mjs':'export const instanceOf="../[group]";', 'espalier/flights/model.ts.mjs':`${rule}export const optional=true;`},
  bypass: {'espalier/[module].ts.mjs':rule,'espalier/test-[module].ts.mjs':rule,'espalier/test-one.ts.mjs':`${rule}export const instanceOf="[module].ts.mjs";`},
  missing: {'espalier/search.ts.mjs':`${rule}export const instanceOf="[missing].ts.mjs";`},
  mismatch: {'espalier/[migrations].tables.sql.mjs':rule,'espalier/users.sql.mjs':`${rule}export const instanceOf="[migrations].tables.sql.mjs";`},
  'mismatch directory': {'espalier/[migrations].tables/schema.sql.mjs':rule,'espalier/users/ESPALIER.mjs':'export const instanceOf="../[migrations].tables";'},
})) {
  test(`invalid specialization is rejected before source exists: ${name}`, async () => {
    await scratch(async (root,put)=>{
      for (const [at,source] of Object.entries(files)) put(at,source);
      await assert.rejects(check({cwd:root,jobs:1}), {code:'invalid_instance'});
    });
  });
}

test('template arguments require -- and preserve framework-like template names', async () => {
  await scratch((root,put)=>{
    put('espalier/[module].ts.mjs', `${rule}import {createTemplate} from ${JSON.stringify(api)};\nexport const template=createTemplate({config:{type:"string",description:"configuration",required:true}},({config})=>config);`);
    const refused=run(root,['create','search.ts','--config','value']);
    assert.equal(refused.status,2);
    assert.match(refused.stdout,/must follow --/);
    assert.equal(existsSync(path.join(root,'search.ts')),false);
    const created=run(root,['create','search.ts','--','--config','value']);
    assert.equal(created.status,0,created.stdout+created.stderr);
    assert.equal(readFileSync(path.join(root,'search.ts'),'utf8'),'value');
  });
});

test('build does not instantiate an absent optional directory', async () => {
  await scratch(async (root,put)=>{
    put('espalier/[group]/model.ts.mjs',rule);
    put('espalier/flights/ESPALIER.mjs','export const instanceOf="../[group]"; export const optional=true; export const guidance="Flight notes";');
    const built=run(root,['build']);
    assert.equal(built.status,0,built.stdout+built.stderr);
    assert.equal(existsSync(path.join(root,'flights')),false);
    assert.deepEqual(await check({cwd:root,jobs:1}),[]);
    assert.equal(run(root,['build','--check']).status,0);
  });
});

test('empty named directories are required and can be created from a guidance-only contract', async () => {
  await scratch(async(root,put)=>{
    put('espalier/[group]/ESPALIER.mjs','export const guidance="An empty role";');
    put('espalier/flights/ESPALIER.mjs','export const instanceOf="../[group]";');
    assert.equal((await check({cwd:root,jobs:1}))[0]?.code,'missing_required_directory');
    const created=run(root,['create','flights']);
    assert.equal(created.status,0,created.stdout+created.stderr);
    assert.deepEqual(await check({cwd:root,jobs:1}),[]);
  });
});

test('migration ignores export-shaped prose and preserves literal collection semantics', async () => {
  await scratch((root,put)=>{
    const source='export const description="source";\nexport const rule=`Example:\nexport const optional = false;\n`;\nexport const optional = false;\nexport function lint() {}\n';
    put('espalier/[module].ts.mjs',source);
    put('espalier/ESPALIER.MD','---\ndescription: Root\n---\nProse with `code` and ${expressions}.\n');
    const dry=run(root,['migrate','--dry-run']);
    assert.equal(dry.status,0,dry.stdout+dry.stderr);
    assert.equal(readFileSync(path.join(root,'espalier/[module].ts.mjs'),'utf8'),source);
    assert.equal(existsSync(path.join(root,'espalier/ESPALIER.mjs')),false);
    const migrated=run(root,['migrate']);
    assert.equal(migrated.status,0,migrated.stdout+migrated.stderr);
    const next=readFileSync(path.join(root,'espalier/[module].ts.mjs'),'utf8');
    assert.match(next,/Example:\nexport const optional = false;/);
    assert.match(next,/export const minMatches = 1;/);
    assert.equal(existsSync(path.join(root,'espalier/ESPALIER.MD')),false);
    assert.equal(run(root,['build']).status,0);
    const before=readFileSync(path.join(root,'espalier/ESPALIER.mjs'),'utf8');
    assert.equal(run(root,['migrate']).status,0);
    assert.equal(readFileSync(path.join(root,'espalier/ESPALIER.mjs'),'utf8'),before);
  });
});

test('migration refuses computed collection optional exports before changing any inputs', async () => {
  await scratch((root,put)=>{
    put('espalier/ESPALIER.MD','Authored guidance.');
    put('espalier/[module].ts.mjs',`${rule}export const optional = Boolean(1);`);
    const before=readFileSync(path.join(root,'espalier.config.yaml'),'utf8');
    const migrated=run(root,['migrate']);
    assert.equal(migrated.status,2);
    assert.match(migrated.stdout,/convert the computed/);
    assert.equal(readFileSync(path.join(root,'espalier.config.yaml'),'utf8'),before);
    assert.equal(existsSync(path.join(root,'espalier/ESPALIER.MD')),true);
    assert.equal(existsSync(path.join(root,'espalier/ESPALIER.mjs')),false);
  });
});
