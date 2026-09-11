# `espalier create`

Creates one absent file owned by a structural rule. When the rule exports a
template it renders the source; otherwise `create` writes an empty file.

```bash
espalier create src/constants.ts --varname answer
```

The argument is a concrete repository path, not a template name. Espalier
resolves it with the same structural matcher used by `lint` and `explain`, so a
template cannot place a file outside the architecture that declares it.

## Usage

```text
espalier create <path> help
espalier create <path> [template options]
```

The path immediately follows `create`. The positional word `help` resolves its
owner and shows how that concrete file will be created without rendering or
writing it. For a custom template the response includes its metavars, choices,
required flags, defaults, examples, and repeatability. When the schema provides
examples, help assembles them into an invocation in schema order. Without a
custom template it says explicitly that creation will produce an empty file.

Every other argument after the path is parsed against the owning template's
schema. Schema keys become long flags exactly as authored: `varname` becomes
`--varname`, `withExport` becomes `--withExport`, and `"with-export"` becomes
`--with-export`. Espalier does not silently translate among naming conventions.
There are no framework flags in this position: `--help`, `--config`,
`--format`, and `--out` are available to a template like any other schema key.
Configuration is always discovered upward from the working directory, and
creation reports in its one human format to standard output.

For example, a component template may produce:

```text
Usage:
  espalier create components/AccountCard.tsx help
  espalier create components/AccountCard.tsx [template options]

Creates a React component

Example:
  espalier create components/AccountCard.tsx --style module --with-story --tag accessible --tag interactive

Template options:
  --style <css|module|none>  Styling strategy (default: module, examples: module, css)
  --with-story              Create a Storybook story
  --tag <value>             Component tag (repeatable, examples: accessible, interactive)
```

String options provide `examples` as a non-empty array. Help shows every value;
the generated invocation uses the first for a scalar option and repeats a
repeatable flag for every value. A presence-only option uses `type: "flag"`;
`includeInExample: true` includes it in the invocation. Examples are never
runtime defaults. A flag that is absent supplies `false` to the renderer and
one that is present supplies `true`, without the help text presenting that
implementation detail as a configurable default.

## Selecting the template

Only a structural rule owns a file, so only a structural rule may export
`template`. A constraint applies to files owned elsewhere and cannot decide
where a new file belongs.

The requested path need not exist. Dynamic paths are resolved normally:
`espalier create components/Button.tsx` selects the template on
`components/[name].tsx.mjs`. The path must nevertheless be inside the nearest
repository, visible under its external ignore policy, governed rather than
excluded, and declared by one structural rule. A target inside a child
espalier is delegated to that child exactly as `explain` and `adopt` delegate.

The template renderer receives `{ path, captures }` after its schema-derived
arguments. Here `path` is relative to the repository that owns the rule and
`captures` is the same structural match data available to its linter. The
component example therefore gets `AccountCard` from `captures.name`; asking the
caller to repeat it as `--name AccountCard` would create two sources of truth.

A rule without a template still participates in `create`: its implicit template
is the empty string. Empty creation is useful because ownership often tells an
agent where a file belongs even when the rule has no opinion about its initial
contents. Export `template` only when a meaningful starting point or arguments
exist.

## Writing

When present, the renderer completes before the filesystem is changed and must
return a string. Espalier creates missing parent directories and writes that
string—or the implicit empty string—verbatim. It adds no newline, marker, or
formatting of its own.

`create` never overwrites. An existing file is refused without running the
renderer, and the final write is exclusive so a file appearing concurrently is
also preserved. There is deliberately no `--force`: templates create source;
they are not an update or migration mechanism.

On success the output is `written <path>` followed by the one-file tally. The
command does not run the owning linter afterwards; generation and validation
remain the two separate halves of the development loop, and
`espalier lint <path>` supplies the latter.
