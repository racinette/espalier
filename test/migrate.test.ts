// `espalier migrate`: no-write guarantees, dry-run/real-run output parity,
// and idempotent rewrites. docs/cli/migrate/README.MD.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SHIPPED_SKIP, shippedAuthoring, AUTHORING_SENTINEL } from "../src/config.js";
import { eitherCaseMasks, rewriteConfigText } from "../src/migrate.js";

const cli = path.join(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".."),
  "dist",
  "src",
  "cli.js",
);

function run(cwd: string, args: string[]) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd, encoding: "utf8" });
  if (result.error) throw result.error;
  return { status: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

const DRY_RUN_NOTICE = "Dry run: no migration files will be changed.";

/** Only the notice distinguishes the simulated output from the real run. */
function simulatedOutput(stdout: string, format: "human" | "jsonl"): string {
  const notice = format === "jsonl"
    ? `${JSON.stringify({ kind: "warning", message: DRY_RUN_NOTICE })}\n`
    : `\n${DRY_RUN_NOTICE}\n`;
  assert.equal(stdout.split(notice).length, 2, "exactly one dry-run notice");
  return stdout.replace(notice, "");
}

function scratch(body: (root: string) => void): void {
  const root = mkdtempSync(path.join(os.tmpdir(), "espalier-migrate-"));
  try {
    mkdirSync(path.join(root, "espalier"));
    body(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("rewrite drops version records, keeps comments, and inserts omitted keys", () => {
  const text = `# the project
version: 1
pin: 0.0.9

name: demo
# keep me
root: espalier
`;
  const values = { version: 1, pin: "0.0.9", name: "demo", root: "espalier" };
  const next = rewriteConfigText(text, values);
  assert.equal(
    next,
    `# the project
name: demo
# keep me
root: espalier

ignoreFiles: []

skip:
  - AGENTS.MD
  - AGENTS.md
  - CLAUDE.md
  - .git
  - .gitkeep
`,
  );
  assert.deepEqual(SHIPPED_SKIP, ["AGENTS.MD", "AGENTS.md", "CLAUDE.md", ".git", ".gitkeep"]);
});

test("rewrite leaves an existing skip and ignoreFiles alone", () => {
  const text = `root: espalier
ignoreFiles: []
skip: []
`;
  const values = { root: "espalier", ignoreFiles: [], skip: [] };
  assert.equal(rewriteConfigText(text, values), text);
});

test("migrate rewrites an old config and is then loadable", () => {
  scratch((root) => {
    writeFileSync(
      path.join(root, "espalier.config.yaml"),
      "version: 1\npin: 0.1.0\nroot: espalier\n",
    );
    const migrated = run(root, ["migrate", "--format", "jsonl"]);
    assert.equal(migrated.status, 0, migrated.stdout + migrated.stderr);
    assert.match(migrated.stdout, /"kind":"written"/);

    const written = readFileSync(path.join(root, "espalier.config.yaml"), "utf8");
    assert.equal(written.includes("version:"), false);
    assert.equal(written.includes("pin:"), false);
    assert.match(written, /^ignoreFiles: \[\]$/m);
    assert.match(written, /^skip:$/m);
    for (const name of SHIPPED_SKIP) {
      assert.match(written, new RegExp(`^ {2}- ${name}$`, "m"));
    }

    const contract = readFileSync(path.join(root, "espalier", "AGENTS.MD"), "utf8");
    assert.equal(contract, shippedAuthoring());

    const lint = run(root, ["lint", "--format", "jsonl"]);
    assert.equal(lint.status, 0, lint.stdout + lint.stderr);
  });
});

test("A and X masks become l and w, and nothing else does", () => {
  assert.equal(eitherCaseMasks("[code=AAA]-[n=X(2)0]"), "[code=lll]-[n=w(2)0]");
  assert.equal(eitherCaseMasks("[kind={A,X}].sql"), "[kind={A,X}].sql", "a list is names");
  assert.equal(eitherCaseMasks("AX-[n].ts"), "AX-[n].ts", "literal text");
  assert.equal(eitherCaseMasks("{,.[role=A+]}"), "{,.[role=l+]}");
});

test("migrating from 0.10 keeps what A and X masks matched, once", () => {
  scratch((root) => {
    const write = (relative: string, contents: string): void => {
      mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
      writeFileSync(path.join(root, relative), contents);
    };
    write("espalier.config.yaml", "pin: 0.10.0\nroot: espalier\nignoreFiles: []\nskip: []\n");
    write("espalier/codes/[code=AAA].txt.mjs", "export const description = \"a code\";\n");
    write("espalier/codes/[kind={A,X}].sql.mjs", "export const description = \"a kind\";\n");
    write("espalier/pages/[id=AA].tsx.mjs", "export const literalName = true;\n");
    write("espalier/regions/[region=X+]/ESPALIER.mjs", "export const description = \"a region\";\n");
    write("espalier/regions/[region=X+]/api.ts.mjs", "export const description = \"its api\";\n");
    write("espalier/regions/eu/ESPALIER.mjs", "export const instanceOf = \"../[region=X+]\";\n");
    for (const file of ["codes/usa.txt", "codes/A.sql", "pages/[id=AA].tsx", "regions/eu/api.ts", "regions/us/api.ts"]) write(file, "");

    const migrated = run(root, ["migrate"]);
    assert.equal(migrated.status, 0, migrated.stdout + migrated.stderr);
    assert.match(migrated.stdout + migrated.stderr, /`A` and `X` in masks now mean capitals only/);
    const at = (relative: string): boolean => existsSync(path.join(root, "espalier", relative));
    assert.ok(at("codes/[code=lll].txt.mjs") && !at("codes/[code=AAA].txt.mjs"));
    assert.ok(at("codes/[kind={A,X}].sql.mjs"), "a list keeps its letters");
    assert.ok(at("pages/[id=AA].tsx.mjs"), "a literal name keeps its letters");
    assert.ok(at("regions/[region=w+]/api.ts.mjs") && !at("regions/[region=X+]"), "the directory moves, and the old one goes");
    assert.equal(readFileSync(path.join(root, "espalier/regions/eu/ESPALIER.mjs"), "utf8"), "export const instanceOf = \"../[region=w+]\";\n");

    const lint = run(root, ["lint", "--format", "jsonl"]);
    assert.equal(lint.status, 0, lint.stdout + lint.stderr);

    // The pin is gone, so a capitals-only A written since stays one.
    write("espalier/codes/[code=AAA].md.mjs", "export const description = \"a capital code\";\n");
    const again = run(root, ["migrate"]);
    assert.equal(again.status, 0);
    assert.ok(at("codes/[code=AAA].md.mjs"));
    assert.doesNotMatch(again.stdout + again.stderr, /mean capitals only/);
  });
});

test("migrate names each module whose code reads the removed guidance mode, and nothing that only mentions it", () => {
  scratch((root) => {
    const write = (relative: string, contents: string): void => {
      mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
      writeFileSync(path.join(root, relative), contents);
    };
    write("espalier.config.yaml", "pin: 0.10.0\nroot: espalier\nignoreFiles: []\nskip: []\n");
    write("espalier/a.ts.mjs", "export const guidance = ({ config }) => config.build.guidanceMode === \"fixed\" ? \"Fixed.\" : \"Evolving.\";\n");
    write("espalier/b.ts.mjs", "export const guidance = ({ config }) => `Mode: ${config.build[\"guidanceMode\"]}.`;\n");
    write("espalier/c.ts.mjs", "// guidanceMode is gone\nexport const guidance = \"The guidanceMode setting is gone.\";\n");
    const migrated = run(root, ["migrate"]);
    assert.equal(migrated.status, 0, migrated.stdout + migrated.stderr);
    const said = migrated.stdout + migrated.stderr;
    assert.match(said, /espalier\/a\.ts\.mjs: reads `build\.guidanceMode`, which no longer exists; read the context's `locked` instead/);
    assert.match(said, /espalier\/b\.ts\.mjs: reads `build\.guidanceMode`/, "a read inside a template literal counts");
    assert.doesNotMatch(said, /c\.ts\.mjs/, "prose and comments do not");
  });
});

test("migrate removes a 0.2.0 pin without rewriting old rule selectors", () => {
  scratch((root) => {
    const directory = path.join(root, "espalier", "[...path]");
    mkdirSync(directory);
    const rulePath = path.join(directory, "element-frequency.mjs");
    const oldRule = `export const aggregate = true;
export const guidance = "Check the whole selected group.";
export async function lint() {}
`;
    writeFileSync(rulePath, oldRule);
    writeFileSync(
      path.join(root, "espalier.config.yaml"),
      "pin: 0.2.0\nroot: espalier\nignoreFiles: []\nskip: []\n",
    );

    const migrated = run(root, ["migrate", "--format", "jsonl"]);
    assert.equal(migrated.status, 0, migrated.stdout + migrated.stderr);
    assert.equal(readFileSync(path.join(root, "espalier.config.yaml"), "utf8").includes("pin:"), false);
    assert.equal(readFileSync(rulePath, "utf8"), oldRule);

    const lint = run(root, ["lint", "--format", "jsonl"]);
    assert.equal(lint.status, 2, lint.stdout + lint.stderr);
    assert.match(lint.stdout + lint.stderr, /malformed_constraint_leaf/);
  });
});

test("migrate --dry-run writes nothing", () => {
  scratch((root) => {
    writeFileSync(
      path.join(root, "espalier.config.yaml"),
      "version: 1\npin: 0.1.0\nroot: espalier\n",
    );
    const dry = run(root, ["migrate", "--dry-run", "--format", "jsonl"]);
    assert.equal(dry.status, 0, dry.stdout + dry.stderr);
    assert.match(simulatedOutput(dry.stdout, "jsonl"), /"kind":"written"/);
    assert.equal(
      readFileSync(path.join(root, "espalier.config.yaml"), "utf8"),
      "version: 1\npin: 0.1.0\nroot: espalier\n",
    );
    assert.equal(existsSync(path.join(root, "espalier", "AGENTS.MD")), false);
  });
});

test("migrate visits a child config", () => {
  scratch((root) => {
    writeFileSync(path.join(root, "espalier.config.yaml"), "version: 1\npin: 0.1.0\nroot: espalier\n");
    mkdirSync(path.join(root, "packages", "web", "espalier"), { recursive: true });
    writeFileSync(
      path.join(root, "packages", "web", "espalier.config.yaml"),
      "version: 1\npin: 0.1.0\nroot: espalier\n",
    );
    const migrated = run(root, ["migrate", "--format", "jsonl"]);
    assert.equal(migrated.status, 0, migrated.stdout + migrated.stderr);
    assert.match(migrated.stdout, /packages\/web\/espalier\.config\.yaml/);
    assert.equal(
      readFileSync(path.join(root, "packages", "web", "espalier.config.yaml"), "utf8").includes("skip:"),
      true,
    );
    assert.equal(
      readFileSync(path.join(root, "packages", "web", "espalier", "AGENTS.MD"), "utf8"),
      shippedAuthoring(),
    );
  });
});

test("a current config is skipped", () => {
  scratch((root) => {
    writeFileSync(
      path.join(root, "espalier.config.yaml"),
      `root: espalier\nignoreFiles: []\nskip: []\n`,
    );
    const migrated = run(root, ["migrate", "--format", "jsonl"]);
    assert.equal(migrated.status, 0, migrated.stdout + migrated.stderr);
    assert.match(migrated.stdout, /"kind":"skipped"/);
    assert.equal(existsSync(path.join(root, "espalier", "AGENTS.MD")), false);
    for (const format of ["human", "jsonl"] as const) {
      const report = path.join(root, `${format}.log`);
      const dry = run(root, ["migrate", "--dry-run", "--format", format, "--out", report]);
      assert.equal(dry.status, 0, dry.stdout + dry.stderr);
      assert.equal(dry.stdout, "");
      assert.equal(dry.stderr, "");
      const actual = run(root, ["migrate", "--format", format]);
      assert.equal(actual.status, 0, actual.stdout + actual.stderr);
      assert.equal(simulatedOutput(readFileSync(report, "utf8"), format), actual.stdout);
    }
  });
});

test("migrate vendors a missing root AGENTS.MD when skip covers it", () => {
  scratch((root) => {
    writeFileSync(
      path.join(root, "espalier.config.yaml"),
      `root: espalier\nignoreFiles: []\nskip:\n  - AGENTS.MD\n`,
    );
    const migrated = run(root, ["migrate", "--format", "jsonl"]);
    assert.equal(migrated.status, 0, migrated.stdout + migrated.stderr);
    assert.match(migrated.stdout, /espalier\/AGENTS\.MD/);
    assert.equal(readFileSync(path.join(root, "espalier", "AGENTS.MD"), "utf8"), shippedAuthoring());
  });
});

test("migrate leaves a customized AGENTS.MD alone", () => {
  scratch((root) => {
    writeFileSync(
      path.join(root, "espalier.config.yaml"),
      `root: espalier\nignoreFiles: []\nskip:\n  - AGENTS.MD\n`,
    );
    writeFileSync(path.join(root, "espalier", "AGENTS.MD"), "Local notes.\n");
    const migrated = run(root, ["migrate", "--format", "jsonl"]);
    assert.equal(migrated.status, 0, migrated.stdout + migrated.stderr);
    assert.equal(readFileSync(path.join(root, "espalier", "AGENTS.MD"), "utf8"), "Local notes.\n");
  });
});

test("migrate updates a still-marked shipped AGENTS.MD", () => {
  scratch((root) => {
    writeFileSync(
      path.join(root, "espalier.config.yaml"),
      `root: espalier\nignoreFiles: []\nskip:\n  - AGENTS.MD\n`,
    );
    writeFileSync(
      path.join(root, "espalier", "AGENTS.MD"),
      `${AUTHORING_SENTINEL}\n\n# stale\n`,
    );
    const migrated = run(root, ["migrate", "--format", "jsonl"]);
    assert.equal(migrated.status, 0, migrated.stdout + migrated.stderr);
    assert.equal(readFileSync(path.join(root, "espalier", "AGENTS.MD"), "utf8"), shippedAuthoring());
  });
});

for (const build of [
  '# placement\nbuild:\n  inline: true\n  filename: GUIDE.MD # chosen name\n',
  '# placement\nbuild: { inline: true, filename: GUIDE.MD } # chosen name\n',
]) {
  test(`migrate converts inline placement and preserves authored frontmatter (${build.includes('{') ? 'flow' : 'block'})`, () => {
    scratch((root) => {
      const config = `root: rules\nignoreFiles: []\nskip: []\n${build}`;
      const source = '---\n# local policy\ndescription: "Project guidance"\nfold: false\ncustom: keep\n---\n\n# Authored prose\n\nKeep  spacing.\r\n';
      mkdirSync(path.join(root, 'rules'));
      writeFileSync(path.join(root, 'espalier.config.yaml'), config);
      writeFileSync(path.join(root, 'rules', 'ESPALIER.MD'), source);
      const rejected = run(root, ['build']);
      assert.equal(rejected.status, 2);
      assert.match(rejected.stdout + rejected.stderr, /espalier migrate/);
      const dry = run(root, ['migrate', '--dry-run', '--format', 'jsonl']);
      assert.equal(dry.status, 0, dry.stdout + dry.stderr);
      assert.match(dry.stdout, /rules\/ESPALIER.MD/);
      assert.equal(readFileSync(path.join(root, 'espalier.config.yaml'), 'utf8'), config);
      assert.equal(readFileSync(path.join(root, 'rules', 'ESPALIER.MD'), 'utf8'), source);
      const result = run(root, ['migrate', '--format', 'jsonl']);
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.equal(result.stdout, simulatedOutput(dry.stdout, "jsonl"));
      const migrated = readFileSync(path.join(root, 'rules', 'ESPALIER.mjs'), 'utf8');
      assert.match(migrated, /fold = true/);
      assert.match(migrated, /# local policy/);
      assert.match(migrated, /custom: keep/);
      assert.ok(migrated.includes('export const guidance = `\n# Authored prose\n\nKeep  spacing.\\x0d\n`;'));
      assert.doesNotMatch(migrated, /\/\/ (?:---|description:|fold:)/);
      const configured = readFileSync(path.join(root, 'espalier.config.yaml'), 'utf8');
      assert.doesNotMatch(configured, /inline:/);
      assert.match(configured, /# placement/);
      assert.match(configured, /# chosen name/);
      assert.match(configured, /filename: GUIDE.MD/);
      assert.equal(run(root, ['build']).status, 0);
      assert.ok(existsSync(path.join(root, 'GUIDE.MD')));
      assert.equal(run(root, ['migrate']).status, 0);
      assert.equal(readFileSync(path.join(root, 'rules', 'ESPALIER.mjs'), 'utf8'), migrated);
      assert.equal(readFileSync(path.join(root, 'espalier.config.yaml'), 'utf8'), configured);
    });
  });
}

test('migrate creates root folding frontmatter and visits an inline child independently', () => {
  scratch((root) => {
    const config = `root: espalier\nignoreFiles: []\nskip: []\nbuild:\n  inline: true\n`;
    writeFileSync(path.join(root, 'espalier.config.yaml'), config);
    mkdirSync(path.join(root, 'child', 'espalier'), { recursive: true });
    writeFileSync(path.join(root, 'child', 'espalier.config.yaml'), config);
    writeFileSync(path.join(root, 'child', 'espalier', 'ESPALIER.MD'), 'Child prose.\n');
    const dry = run(root, ['migrate', '--dry-run']);
    assert.equal(dry.status, 0, dry.stdout + dry.stderr);
    assert.equal(existsSync(path.join(root, 'espalier', 'ESPALIER.MD')), false);
    assert.equal(readFileSync(path.join(root, 'child', 'espalier', 'ESPALIER.MD'), 'utf8'), 'Child prose.\n');
    const result = run(root, ['migrate']);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(result.stdout, simulatedOutput(dry.stdout, "human"));
    assert.equal(readFileSync(path.join(root, 'espalier', 'ESPALIER.mjs'), 'utf8'), 'export const fold = true;\n');
    assert.match(readFileSync(path.join(root, 'child', 'espalier', 'ESPALIER.mjs'), 'utf8'), /export const fold = true;/);
    assert.equal(run(root, ['build']).status, 0);
    assert.ok(existsSync(path.join(root, 'child', 'AGENTS.MD')));
  });
});

test('migrate removes inline false without changing or creating folding frontmatter', () => {
  for (const source of [undefined, '---\nfold: true\n---\nAuthored.\n']) {
    scratch((root) => {
      writeFileSync(path.join(root, 'espalier.config.yaml'), `ignoreFiles: []\nskip: []\nbuild: { inline: false }\n`);
      const filename = path.join(root, 'espalier', 'ESPALIER.MD');
      if (source !== undefined) writeFileSync(filename, source);
      const result = run(root, ['migrate']);
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.equal(existsSync(filename), false);
      assert.equal(existsSync(filename.replace('ESPALIER.MD', 'ESPALIER.mjs')), source !== undefined);
      assert.equal(run(root, ['build']).status, 0);
    });
  }
});

test('migrate accepts empty frontmatter and leaves an existing true fold byte-identical', () => {
  for (const source of ['---\n---\nBody.\n', '---\nfold: true # keep\n---\nBody.\n']) {
    scratch((root) => {
      writeFileSync(path.join(root, 'espalier.config.yaml'), `ignoreFiles: []\nskip: []\nbuild: { inline: true }\n`);
      const filename = path.join(root, 'espalier', 'ESPALIER.MD');
      writeFileSync(filename, source);
      const result = run(root, ['migrate']);
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.equal(existsSync(filename), false);
      const module = readFileSync(filename.replace('ESPALIER.MD', 'ESPALIER.mjs'), 'utf8');
      assert.match(module, /export const fold = true/);
      assert.match(module, /export const guidance =/);
      if (source.includes('# keep')) assert.match(module, /# keep/);
      assert.equal(run(root, ['build']).status, 0);
    });
  }
});

test('invalid folding migration leaves config and source untouched', () => {
  for (const [inline, source] of [
    ['"true"', 'Prose.\n'],
    ['true', '---\nfold: null\n---\nProse.\n'],
    ['true', '---\ndescription: [bad]\n---\nProse.\n'],
    ['true', '---\nfold: [\n---\nProse.\n'],
    ['true', '---\nfold: false\n'],
  ]) {
    scratch((root) => {
      const config = `ignoreFiles: []\nskip: []\nbuild: { inline: ${inline} }\n`;
      const configPath = path.join(root, 'espalier.config.yaml');
      const sourcePath = path.join(root, 'espalier', 'ESPALIER.MD');
      writeFileSync(configPath, config);
      writeFileSync(sourcePath, source!);
      const result = run(root, ['migrate']);
      assert.equal(result.status, 2, result.stdout + result.stderr);
      assert.equal(readFileSync(configPath, 'utf8'), config);
      assert.equal(readFileSync(sourcePath, 'utf8'), source);
    });
  }
});

test("0.7 migration preserves metadata exclusions and reviews hidden entries without importing", () => {
  scratch((root) => {
    const configPath = path.join(root, "espalier.config.yaml");
    const before = 'pin: 0.6.0\nroot: espalier\nignoreFiles: []\n# explicit policy\nskip: [] # retain comment\n';
    writeFileSync(configPath, before);
    writeFileSync(path.join(root, ".espalierignore"), "# existing policy\n!.git\n");
    mkdirSync(path.join(root, ".git"));
    writeFileSync(path.join(root, ".git", "espalier.config.yaml"), "not: valid\n");
    mkdirSync(path.join(root, "espalier", ".tools"));
    writeFileSync(path.join(root, "espalier", ".tools", "danger.mjs"), 'throw new Error("must never import");');
    writeFileSync(path.join(root, "espalier", ".env.mjs"), 'throw new Error("must never import");');
    writeFileSync(path.join(root, "espalier", ".gitkeep"), "");
    const dry = run(root, ["migrate", "--dry-run", "--format", "jsonl"]);
    assert.equal(dry.status, 0, dry.stdout + dry.stderr);
    assert.equal(readFileSync(configPath, "utf8"), before);
    assert.equal(readFileSync(path.join(root, ".espalierignore"), "utf8"), "# existing policy\n!.git\n");
    const simulated = simulatedOutput(dry.stdout, "jsonl");
    const records = simulated.trim().split("\n").map((line) => JSON.parse(line));
    assert.deepEqual(records.filter((r) => r.kind === "warning").map((r) => r.message.split(":")[0]),
      ["espalier/.env.mjs", "espalier/.tools"]);
    assert.ok(records.some((r) => r.path === ".espalierignore" && r.kind === "written"));
    const actual = run(root, ["migrate", "--format", "jsonl"]);
    assert.equal(actual.status, 0, actual.stdout + actual.stderr);
    assert.equal(actual.stdout, simulated);
    const written = readFileSync(configPath, "utf8");
    assert.match(written, /# explicit policy/);
    assert.match(written, /# retain comment/);
    assert.match(written, /\.gitkeep/);
    assert.doesNotMatch(written, /\.tools|\.env/);
    const again = run(root, ["migrate", "--format", "jsonl"]);
    assert.equal(again.status, 0, again.stdout);
    assert.doesNotMatch(again.stdout, /"kind":"written"|"kind":"warning"/);
    assert.equal(readFileSync(configPath, "utf8"), written);
  });
});

test("migration preserves configured jobs and rejects malformed settings before writes", () => {
  scratch(root => {
    const config = "pin: 0.10.0\nignoreFiles: []\nskip: []\nlint:\n  jobs: 1 # expensive compiler setup\n";
    writeFileSync(path.join(root, "espalier.config.yaml"), config);
    const result = run(root, ["migrate"]);
    assert.equal(result.status, 0, result.stdout);
    assert.match(readFileSync(path.join(root, "espalier.config.yaml"), "utf8"), /jobs: 1 # expensive compiler setup/);
    const malformed = config.replace("jobs: 1", "jobs: 0");
    writeFileSync(path.join(root, "espalier.config.yaml"), malformed);
    writeFileSync(path.join(root, "espalier/ESPALIER.MD"), "Keep my guidance.\n");
    const rejected = run(root, ["migrate"]);
    assert.equal(rejected.status, 2, rejected.stdout);
    assert.match(rejected.stdout, /lint.jobs must be a positive safe integer/);
    assert.equal(readFileSync(path.join(root, "espalier.config.yaml"), "utf8"), malformed);
    assert.ok(existsSync(path.join(root, "espalier/ESPALIER.MD")));
    assert.equal(existsSync(path.join(root, "espalier/ESPALIER.mjs")), false);
  });
});

test("migration emits editable prose without evaluating it or duplicating defaults", () => {
  scratch((root) => {
    writeFileSync(path.join(root, "espalier.config.yaml"), `ignoreFiles: []\nskip: []\n`);
    const body = '\n# Notes\n\nUse `code`, ${throwIfEvaluated()}, and \\paths.\r\nKeep \\${literal} and trailing spaces.  \n';
    const source = path.join(root, "espalier/ESPALIER.MD");
    const target = path.join(root, "espalier/ESPALIER.mjs");
    writeFileSync(source, '---\ndescription: Local notes\nfold: false\n---\n' + body);
    assert.equal(run(root, ["migrate", "--dry-run"]).status, 0);
    assert.equal(existsSync(target), false);
    const migrated = run(root, ["migrate"]);
    assert.equal(migrated.status, 0, migrated.stdout + migrated.stderr);
    const text = readFileSync(target, "utf8");
    assert.ok(text.startsWith('export const description = "Local notes";\nexport const guidance = `\n# Notes\n\n'));
    assert.doesNotMatch(text, /\/\/|export const fold/);
    const evaluated = spawnSync(process.execPath, ["--input-type=module", "-e",
      'import * as doc from "./espalier/ESPALIER.mjs"; console.log(JSON.stringify(doc));',
    ], {cwd: root, encoding: "utf8"});
    assert.equal(evaluated.status, 0, evaluated.stderr);
    assert.deepEqual(JSON.parse(evaluated.stdout), {description: "Local notes", guidance: body});
    assert.equal(run(root, ["migrate"]).status, 0);
    assert.equal(readFileSync(target, "utf8"), text);
  });
});
