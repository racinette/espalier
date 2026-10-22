# Espalier 0.9.0

Named instances can specialize shared directory and file contracts while
retaining their structure and checks. This release also adds computed directory
guidance, optional files in directory scaffolds, and project-level lint worker
defaults.

There are breaking changes to dynamic-leaf requiredness and template arguments.
Review the upgrade instructions below before migrating.

## Named instances of shared contracts

A concrete directory can inherit a sibling dynamic directory contract:

```js
// espalier/src/features/Flights/ESPALIER.mjs
export const instanceOf = "../[feature]";
export const description = "flight search and comparison";
export const guidance = "Flight searches compare available routes and fares.";
```

A concrete file can specialize a dynamic leaf in the inherited structure:

```js
// espalier/src/features/Flights/search.ts.mjs
export const instanceOf = "[operation].ts.mjs";
export const description = "search available flights";
export const rule = "Keep flight-search policy in this operation.";
export function lint() {
  // Add local checks here; inherited checks already run.
}
```

- Directory instances inherit the complete shared structure. Local declarations
  may refine it but cannot introduce unsupported children or weaken inherited
  requirements. Base lint checks run before local checks; inherited captures,
  collection membership, and aggregate scope are preserved.
- Inherited templates remain available unless a specialization supplies its
  own. Replacing a template does not replace inherited lint checks.
- Named file and directory instances are required by default. They can declare
  `optional = true` where inherited requirements permit absence. Missing required
  directory instances, even those with only optional children, produce
  `missing_required_directory`.
  Invalid specializations fail compilation with `invalid_instance`.
- Local generated documents contain domain guidance and the concrete inherited
  layout; shared rule prose stays with the shared contract. Optional named
  directories receive generated documents only when their source directories
  exist. `fold` continues to control document placement.
- Project maps retain the dynamic declaration alongside named instances and
  label the relationship: `Flights/ (required, instance of [feature]/)`.
  Named file instances receive the same annotation. JSON map entries expose
  `instanceOf`; `explain` identifies inherited sources, rules, and captures.

This does not generate a document in every discovered dynamic instance. For
handwritten local notes, the authoring contract and build reference now include
a complete optional `AGENTS.md.mjs` recipe with a template and lint check. Such
notes are ordinary governed files. Build preserves unmarked notes outside its
planned outputs and refuses to overwrite them if a later specialization plans
a generated document at the same path.

## Computed directory guidance

`ESPALIER.mjs` is the canonical directory guidance source. It exports
`description`, `fold`, and `guidance`, plus instance metadata when applicable.
Guidance may be a string or a synchronous or asynchronous function:

```js
export const description = "shared runtime";

export function guidance({ config }) {
  return config.build.guidanceMode === "fixed"
    ? "Changes to the shared runtime require architecture authorization."
    : "Discuss shared-runtime changes before updating its contract.";
}
```

The exported `DirectoryGuidanceContext` type describes the callback's isolated
configuration snapshot, authored `pattern`, concrete `path` when known, and
known `captures`. Guidance is evaluated during repository compilation,
including lint and explain, so callbacks should be deterministic and free of
side effects. They run for declared nodes, not for every discovered instance.
`build --check` detects stale computed output.

Legacy `ESPALIER.MD` remains readable during migration; having both formats in
one directory is an error. `migrate` converts Markdown prose and frontmatter to
module exports, preserves the original frontmatter as comments, and removes
the old source without importing authored code. `adopt` writes module guidance;
force-adoption refuses to merge arbitrary authored or computed modules and asks
for a manual merge before writing.

## Dynamic collection minimums

Dynamic leaves now use `minMatches`, a nonnegative safe integer, and reject
`optional`:

| Declaration | Requirement |
| --- | --- |
| Omitted or `minMatches = 0` | Zero or more owned files |
| `minMatches = 1` | At least one owned file |
| `minMatches = N` | At least N owned files |

Minimums apply per existing dynamic parent instance, or along a required static
directory path even when the source directory is absent. Named specializations
count toward the base collection; unrelated static siblings do not. Guidance,
explain, and directory creation help expose the minimum. Scaffolding does not
invent dynamic filenames to satisfy it.

Named static and resolved leaves retain `optional` for presence. This separates
the presence of a named node from the size of a dynamic collection.

## Optional files in directory scaffolds

Directory creation, preview, and help accept repeatable `--with <relative-leaf>`
and `--with-optional`:

```bash
espalier create src/features/Flights --with AGENTS.md
espalier create src/features/Flights preview --with-optional
espalier create src/features/Flights help --with AGENTS.md
```

Help lists optional paths and descriptions. Selecting optional files also
exposes their namespaced template arguments and examples. Only named static
and resolved leaves are eligible; dynamic collection members are created by
choosing a concrete path separately. Selecting a leaf inside an optional named
directory includes that directory's required contents.

Unknown or excluded selections and template failures stop creation before
target writes. All selected templates render before the directory is written;
duplicate selections create each file once.

Template arguments now follow a mandatory `--` separator when present:

```bash
espalier create src/example.ts -- --some-flag 1
espalier create src/example.ts preview -- --some-flag 1
```

Espalier's options, including `--with` and `--with-optional`, stay before `--`.
Help and template examples show the boundary. Calls without template arguments
need no separator. Invalid create-target diagnostics now name the resolved path
and project root and explain that relative paths resolve from the current
working directory.

## Project-level worker defaults

```yaml
lint:
  jobs: 1
```

`lint.jobs` accepts a positive safe integer or `auto`; omission defaults to
`auto`. Explicit CLI `--jobs` and API `jobs` values override the configuration
for the entire invocation, including nested projects. Without an override,
each child uses its own configuration. Migration preserves the setting.

The parallel-execution documentation now explains how expensive worker setup
multiplies CPU and memory costs. Measure representative workloads before
choosing a default; additional workers do not guarantee a faster lint run.

## Upgrading from 0.8.0

1. Install `espalier@0.9.0` and preview migration with `espalier migrate --dry-run`.
2. Convert factory-produced, computed, or re-exported `optional` values on
   dynamic leaves manually. Remove `optional` from those modules' public
   exports and use `minMatches`: zero for an empty-allowed collection, one for
   a nonempty collection, or a larger minimum as needed. Static leaves can
   still export `optional`; shared factories must expose the appropriate
   fields for each node kind.
3. Run `espalier migrate`. Direct literal dynamic exports `optional = false`
   become `minMatches = 1`, and `optional = true` becomes `minMatches = 0`.
   Migration also converts directory Markdown sources, updates pins, and
   refreshes the shipped authoring guidance. Unsupported conversions fail
   before planned writes within the affected project; nested projects are
   migrated independently.
4. Update scripts that pass template flags to insert `--` before those flags.
   Migration does not rewrite caller scripts.
5. Run `espalier lint`, `espalier build`, and `espalier build --check`. Review
   the converted rules and generated guidance before committing the upgrade.

For projects using factories to export a uniform `optional` field, the manual
step is necessary even when the value is always true. The 0.8.0 acceptance of
that export on dynamic leaves is not retained.

Full changes: https://github.com/racinette/espalier/compare/v0.8.0...v0.9.0
