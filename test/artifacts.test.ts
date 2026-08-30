import assert from "node:assert/strict";
import test from "node:test";

import {
  mergeArtifacts,
  type ArtifactTarget,
} from "../src/artifacts.js";

function target(
  id: string,
  artifactPath: string,
  contents: string,
): ArtifactTarget {
  return {
    id,
    owns: () => false,
    artifacts: [{ target: id, path: artifactPath, contents }],
  };
}

test("artifact targets merge into one build transaction", () => {
  const artifacts = mergeArtifacts([
    target("agents", "AGENTS.MD", "agents"),
    target("claude", ".claude/rules/structure.md", "claude"),
  ]);

  assert.deepEqual(
    [...artifacts.entries()].map(([at, artifact]) => [at, artifact.contents]),
    [
      ["AGENTS.MD", "agents"],
      [".claude/rules/structure.md", "claude"],
    ],
  );
});

test("artifact targets cannot generate the same path", () => {
  assert.throws(
    () =>
      mergeArtifacts([
        target("agents", "AGENTS.MD", "agents"),
        target("claude", "AGENTS.MD", "claude"),
      ]),
    /generated artifact collision at AGENTS\.MD: agents and claude/,
  );
});

test("artifacts identify their producing target", () => {
  const mismatched: ArtifactTarget = {
    id: "agents",
    owns: () => false,
    artifacts: [
      { target: "claude", path: "AGENTS.MD", contents: "contents" },
    ],
  };

  assert.throws(
    () => mergeArtifacts([mismatched]),
    /artifact target "claude" does not match "agents"/,
  );
});
