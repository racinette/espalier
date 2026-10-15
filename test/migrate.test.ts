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
import { rewriteConfigText } from "../src/migrate.js";
import { VERSION } from "../src/version.js";

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

test("rewrite drops version, keeps comments, and inserts omitted keys", () => {
  const text = `# the project
version: 1
pin: 0.0.9

name: demo
# keep me
root: espalier
`;
  const values = { version: 1, pin: "0.0.9", name: "demo", root: "espalier" };
  const next = rewriteConfigText(text, values, "0.1.0");
  assert.equal(
    next,
    `# the project
pin: 0.1.0

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
  const text = `pin: 0.1.0
root: espalier
ignoreFiles: []
skip: []
`;
  const values = { pin: "0.1.0", root: "espalier", ignoreFiles: [], skip: [] };
  assert.equal(rewriteConfigText(text, values, "0.1.0"), text);
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
    assert.ok(written.split("\n").includes(`pin: ${VERSION}`));
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

test("migrate updates a 0.2.0 pin without rewriting old rule selectors", () => {
  scratch((root) => {
    const directory = path.join(root, "espalier", "[...path]");
    mkdirSync(directory);
    const rulePath = path.join(directory, "element-frequency.mjs");
    const oldRule = `export const aggregate = true;
export const rule = "Check the whole selected group.";
export async function lint() {}
`;
    writeFileSync(rulePath, oldRule);
    writeFileSync(
      path.join(root, "espalier.config.yaml"),
      "pin: 0.2.0\nroot: espalier\nignoreFiles: []\nskip: []\n",
    );

    const migrated = run(root, ["migrate", "--format", "jsonl"]);
    assert.equal(migrated.status, 0, migrated.stdout + migrated.stderr);
    assert.ok(readFileSync(path.join(root, "espalier.config.yaml"), "utf8").split("\n").includes(`pin: ${VERSION}`));
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
      `pin: ${VERSION}\nroot: espalier\nignoreFiles: []\nskip: []\n`,
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
      `pin: ${VERSION}\nroot: espalier\nignoreFiles: []\nskip:\n  - AGENTS.MD\n`,
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
      `pin: ${VERSION}\nroot: espalier\nignoreFiles: []\nskip:\n  - AGENTS.MD\n`,
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
      `pin: ${VERSION}\nroot: espalier\nignoreFiles: []\nskip:\n  - AGENTS.MD\n`,
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
      const config = `pin: ${VERSION}\nroot: rules\nignoreFiles: []\nskip: []\n${build}`;
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
      const migrated = readFileSync(path.join(root, 'rules', 'ESPALIER.MD'), 'utf8');
      assert.match(migrated, /fold: true/);
      assert.match(migrated, /# local policy/);
      assert.match(migrated, /custom: keep/);
      assert.ok(migrated.endsWith('\n\n# Authored prose\n\nKeep  spacing.\r\n'));
      const configured = readFileSync(path.join(root, 'espalier.config.yaml'), 'utf8');
      assert.doesNotMatch(configured, /inline:/);
      assert.match(configured, /# placement/);
      assert.match(configured, /# chosen name/);
      assert.match(configured, /filename: GUIDE.MD/);
      assert.equal(run(root, ['build']).status, 0);
      assert.ok(existsSync(path.join(root, 'GUIDE.MD')));
      assert.equal(run(root, ['migrate']).status, 0);
      assert.equal(readFileSync(path.join(root, 'rules', 'ESPALIER.MD'), 'utf8'), migrated);
      assert.equal(readFileSync(path.join(root, 'espalier.config.yaml'), 'utf8'), configured);
    });
  });
}

test('migrate creates root folding frontmatter and visits an inline child independently', () => {
  scratch((root) => {
    const config = `pin: ${VERSION}\nroot: espalier\nignoreFiles: []\nskip: []\nbuild:\n  inline: true\n`;
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
    assert.equal(readFileSync(path.join(root, 'espalier', 'ESPALIER.MD'), 'utf8'), '---\nfold: true\n---\n');
    assert.equal(readFileSync(path.join(root, 'child', 'espalier', 'ESPALIER.MD'), 'utf8'), '---\nfold: true\n---\nChild prose.\n');
    assert.equal(run(root, ['build']).status, 0);
    assert.ok(existsSync(path.join(root, 'child', 'AGENTS.MD')));
  });
});

test('migrate removes inline false without changing or creating folding frontmatter', () => {
  for (const source of [undefined, '---\nfold: true\n---\nAuthored.\n']) {
    scratch((root) => {
      writeFileSync(path.join(root, 'espalier.config.yaml'), `pin: ${VERSION}\nignoreFiles: []\nskip: []\nbuild: { inline: false }\n`);
      const filename = path.join(root, 'espalier', 'ESPALIER.MD');
      if (source !== undefined) writeFileSync(filename, source);
      const result = run(root, ['migrate']);
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.equal(existsSync(filename), source !== undefined);
      if (source !== undefined) assert.equal(readFileSync(filename, 'utf8'), source);
      assert.equal(run(root, ['build']).status, 0);
    });
  }
});

test('migrate accepts empty frontmatter and leaves an existing true fold byte-identical', () => {
  for (const source of ['---\n---\nBody.\n', '---\nfold: true # keep\n---\nBody.\n']) {
    scratch((root) => {
      writeFileSync(path.join(root, 'espalier.config.yaml'), `pin: ${VERSION}\nignoreFiles: []\nskip: []\nbuild: { inline: true }\n`);
      const filename = path.join(root, 'espalier', 'ESPALIER.MD');
      writeFileSync(filename, source);
      const result = run(root, ['migrate']);
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.equal(readFileSync(filename, 'utf8'), source.includes('fold:') ? source : '---\nfold: true\n---\nBody.\n');
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
      const config = `pin: ${VERSION}\nignoreFiles: []\nskip: []\nbuild: { inline: ${inline} }\n`;
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
