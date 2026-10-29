export const instanceOf = "[module].ts.mjs";
export const description = "running the espaliers below this one";

export const guidance = `Starts child runs in order and re-roots what they report. It never reads a
child's configuration, espalier or addons, because each child is a complete
separate run. \`delegated\` rewrites every path and the \`espalier\` origin into
the invoking frame, and the views compose, so a grandchild is named by its
whole path. A new \`Reporter\` method that carries a path must be re-rooted here
too. \`eachChild\` is the one place a failure does not end the run: it reports
the failure through the child's view, carries on, and returns the worst exit
code. \`lint.ts\`, \`build.ts\` and \`migrate.ts\` walk children through it, while
\`explain.ts\`, \`create.ts\` and \`adopt.ts\` use \`delegated\` to answer from the
one governing espalier. See \`docs/cli/lint/README.MD\` "Nested espaliers".`;
