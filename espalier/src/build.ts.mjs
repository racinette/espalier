export const instanceOf = "[module].ts.mjs";
export const description = "the build command";

export const guidance = `Renders every espalier's documents in memory before touching the filesystem,
and \`apply\` is the only function that writes. If planning fails anywhere,
in a child as well, nothing is written, though \`--check\` still reports the
drift it found. This is the deliberate difference from \`lint\`, which visits
children through the same \`eachChild\` but whose output ends with the run.
Existing documents come from the raw candidate walk, not
\`repository.visible\`, because that hides generated files by design. Child
subtrees are skipped, the unmarked-file refusal runs before any write, and only
marked files that the configuration governs may be swept as orphans. Document
content comes from \`render.ts\`, and the report carries only what happened to
the filesystem. See \`docs/cli/build/README.MD\` "Nested espaliers",
"Ownership", "Output" and "\`--check\`".`;
