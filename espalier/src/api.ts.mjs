export const instanceOf = "[module].ts.mjs";
export const description = "the programmatic surface";

export const guidance = `The package's public entrypoint: \`package.json\` exports resolve here, so
every export is public surface documented in \`docs/API.MD\` and
\`docs/TYPES.MD\`, and lint reports one that neither names. \`check\` is
\`lint.ts\` run behind a collecting reporter, not a second runner. It discards
warnings and the exit code, and holds a child's failure until the siblings
finish, then throws the first one. \`runRule\`, \`runAggregate\` and \`runGroup\`
build \`emit\` with \`context.ts\`'s \`createEmit\`, so a rule fails under test for
the reason it fails in production. A callback that throws becomes
\`rule_threw\`, and a read outside the supplied tree is \`read_failed\`, never an
empty string. These helpers take no config or espalier tree: a module's
position is the matcher's business, pinned by conformance fixtures, so do not
add a repository here.`;

/** Every name `api.ts` exports, values and types alike. */
function exported(source) {
  const names = new Set();
  for (const [, list] of source.matchAll(/export (?:type )?\{([^}]*)\}/g)) {
    for (const entry of list.split(",")) {
      const name = entry.trim().replace(/^type\s+/, "").split(/\s+as\s+/).pop();
      if (name) names.add(name);
    }
  }
  for (const [, name] of source.matchAll(/^export (?:async )?(?:function|interface|const|class|type) ([A-Za-z_]\w*)/gm)) names.add(name);
  return names;
}

export async function lint({ read, emit }) {
  const names = exported(await read());
  const documented = `${await read("docs/API.MD")}\n${await read("docs/TYPES.MD")}`;
  for (const name of [...names].sort()) {
    if (!new RegExp(`\\b${name}\\b`).test(documented)) {
      emit({ code: "undocumented_export", message: `exports ${name}, which neither docs/API.MD nor docs/TYPES.MD names`, metadata: { name } });
    }
  }
  // A function API.MD gives a section of its own must still be exported.
  const api = await read("docs/API.MD");
  for (const [, name] of api.matchAll(/^## `([A-Za-z_]\w*)[(`]/gm)) {
    if (!names.has(name)) {
      emit({ code: "unexported_api", message: `docs/API.MD documents ${name}, which src/api.ts does not export`, metadata: { name }, path: "docs/API.MD" });
    }
  }
}
