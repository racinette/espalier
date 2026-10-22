# Espalier 0.9.1

Descriptions can now use the same configuration context as computed guidance.
Markdown migration produces editable multiline prose, and the shipped local
notes recipe uses a neutral feature name. There are no new breaking changes
relative to 0.9.0.

## Computed descriptions

Directory modules, structural file rules, and constraints can export
`description` as a string or a synchronous or asynchronous function returning
a string:

```js
export function description({ config }) {
  return "shared runtime" +
    (config.build.guidanceMode === "fixed" ? " (read-only)" : "");
}
```

- Directory callbacks receive `DirectoryGuidanceContext`; file and constraint
  callbacks receive `RuleGuidanceContext`. Both expose `{ config, pattern, path,
  captures }` with the same declaration semantics as their guidance callbacks.
- Each callback receives its own isolated context and runs once per authored
  declaration during compilation, including when no files match. Inherited
  descriptions keep the base declaration's context. Workers consume the
  rendered strings instead of rerunning the callbacks.
- Project maps, creation help, explain, and human-readable findings use the
  rendered labels. `build --check` detects description-only changes.
- Standalone `runRule` and `runAggregate` tests supply the `guidance` context
  when `description` is a function, just as for computed `rule` prose.
- Directory callback failures and invalid results use
  `malformed_node_description`. File and constraint callback failures use
  `rule_guidance_failed`; non-string results use `module_invalid_export`.

This lets labels and guidance share a mode-dependent helper without separately
reading configuration from disk. Callbacks should remain deterministic and
free of side effects.

## Editable migration output

When converting `ESPALIER.MD` to `ESPALIER.mjs`, `migrate` now:

- Writes guidance as an ordinary template literal with real line breaks.
  Backticks, interpolation markers, backslashes, carriage returns, and control
  characters are escaped to preserve the imported text exactly.
- Omits default `fold = false` and empty guidance exports.
- Retains authored comments and unrecognized frontmatter fields as comments,
  without duplicating converted `description` and `fold` fields.

Dry-run and idempotence guarantees remain. This improves future Markdown
conversions; migration does not reformat existing authored `ESPALIER.mjs` files.

## Neutral authoring example

The handwritten-notes recipe uses `src/features/example-feature` instead of a
demo-specific feature name. Migration refreshes the vendored authoring contract
with this example and the computed-description documentation.

## Upgrading from 0.9.0

```bash
npm install --save-exact espalier@0.9.1
npx espalier migrate --dry-run
npx espalier migrate
npx espalier lint
npx espalier build
npx espalier build --check
```

Existing string descriptions remain valid. Projects upgrading from 0.8.0 or
earlier should also follow the [0.9.0 upgrade instructions](https://github.com/racinette/espalier/releases/tag/v0.9.0),
including dynamic `minMatches` migration and the `--` template-argument separator.

Full changes: https://github.com/racinette/espalier/compare/v0.9.0...v0.9.1
