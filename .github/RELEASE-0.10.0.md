# Espalier 0.10.0

A rule module's prose export is now `guidance`, a dynamic rule can judge its
files in groups, a contract can insist that every member is declared, a
bracketed name such as a Next.js `[slug]` can be literal, placeholders can
carry masks, and generated guidance nests each contract's instances under it.

There are breaking changes to the rule-module exports, the findings schema,
one CLI flag, the `pattern` a rule receives, and the reading of
`.espalierignore`. Review the upgrade instructions below before migrating.

## `rule` is `guidance`

The prose a rule module carries is read by an agent before it writes a file
and attached to a finding after; neither is a rule in the sense `lint`
enforces, and directory modules already called theirs `guidance`. Every module
now has the same two prose exports:

```js
export const description = "an integration with an external API";
export const guidance = `Export a single create<Provider>Client(config) factory.`;
```

- `guidance` may still be a string or a sync/async function of the declaration
  context. A module still exporting `rule` is rejected with a pointer, and
  `espalier migrate` renames direct declarations on the module and inside each
  entry of `groups`; a destructured or re-exported `rule` is reported for a
  manual rename.
- Findings carry the text as `guidance` instead of `ruleText`, in JSONL and in
  the API's `Issue`. The CLI flag is `--no-guidance`. Human output labels the
  block `Guidance`.
- `lint` is optional. A module, or a grouping, with nothing to check exports
  none; a `lint` that is present and not a function is still rejected.

## Groupings of a dynamic rule's files

A dynamic rule can state an obligation over several of its files at once:

```js
export const groups = {
  set: {
    by: ["num", "group"],
    description: "a migration set",
    guidance: "Steps are numbered from 01 with no gaps.",
    async lint({ captures, matches, read, emit }) { /* one group at a time */ },
  },
};
```

Each grouping names the captures whose shared values identify a group, and its
`lint` runs once per group per directory with the members as sorted `matches`
and the shared values as `captures`. `by: []` means all the rule's files in a
directory. Groups are jobs beside aggregates and are scoped the same way: touch
one member and the whole group runs. Issues carry the grouping's name as
`group`, the shared captures and the grouping's own guidance. Generated
guidance renders each grouping as a sub-section headed by what its members
share; `explain` lists a file's memberships. `runGroup` and `createGroupLinter`
cover the API.

## Masked placeholders

A placeholder can constrain the text it accepts, character by character:

```text
[seq=0(6)]_[name=x+].tables.sql.mjs
[kind={tables,views}].sql.mjs
```

`0` is a digit, `#` an optional digit, `A` a letter, `a` a lowercase letter,
`X` a letter or digit, `x` a lowercase letter or digit, `-` or `_` itself,
`+` repeats the previous element one or more times and `(n)` exactly n times;
`{a,b}` lists the accepted names. A masked placeholder is a strict subset of a
bare one, so both can sit side by side. Two captures in one name must be
separated by text neither can absorb; a name that would split two ways is
rejected at compile time with the name and both splits. Generated guidance
explains only the symbols a document uses.

## Abstract contracts and declared instances

A dynamic rule, or a dynamic directory's `ESPALIER.mjs`, may refuse anonymous
members:

```js
// espalier/app/[route]/ESPALIER.mjs
export const abstract = true;
export const description = "a route";
```

Every match must then be declared as an instance with `instanceOf`. One that
is not is reported by `espalier lint` as `undeclared_instance`, on the file or
on the directory with a trailing slash, naming the module to write; the path
stays owned, so it is not `unexpected_path`. `espalier create` refuses such a
path with the same pointer, since declaring is authoring and creation never
writes into the espalier. A new help page, `espalier help instances`, explains
declaring once, and generated guidance points at it.

## Literal names

A real path whose name holds brackets, such as a Next.js `app/[slug]/` route
or `pages/[id].tsx`, is declared by a module at that name exporting
`literalName = true`, on `ESPALIER.mjs` for a directory and on the rule module
for a file. The name is then static text: it matches exactly its name, beats a
dynamic sibling, requires its files by default and may declare `instanceOf`.
The map marks it `literal name`. In `targets`, `context.files()`, `skip` and
every ignore file a bracket is a character class, so a literal name there is
written `\[slug\]`.

## Generated guidance

A dynamic rule with declared instances beside it is a contract, and its
instances now read under it: the contract's guidance is stated once, each
instance is a sub-section carrying only what is specific to it, and a closing
"Adding new instances" note says whether a declaration is needed. A dynamic
directory with instances lists them the same way. An instance directory's own
document opens with its contract's guidance, and a file that takes over an
inherited static file states the inherited guidance first, so no document
sends the reader up a level. Groupings are headed by what their members share,
a rule's mask legend sits beside the rule, and constraints gather under one
`Constraints` heading.

## The pattern a rule reports

`context.pattern`, an issue's `pattern` and `explain` now carry the declaration
exactly as authored, relative to the rule-tree root and without `.mjs`:
`clients/[provider]/client.ts`, never `clients/*/client.ts`. Placeholder
names, masks, back-references and extension unions survive, which a glob could
not express. The matched file is `context.path` and the open values are
`context.captures`. Aggregates no longer receive a joined list of admission
globs as `pattern`; `context.patterns` still carries the real selectors.

## `.espalierignore` and `skip` read like git

Both are now read by the same code as `ignoreFiles`, so a line means the same
thing wherever it is written: `[a-z]` is a character class and a backslash
escapes. Previously `.espalierignore` took brackets and backslashes literally,
so `app/[slug]/` excluded the bracketed directory in one file and `app/s/` in
the other.

## Upgrading from 0.9.2

1. Install `espalier@0.10.0` and preview migration with `espalier migrate --dry-run`.
2. Run `espalier migrate`. It renames `rule` to `guidance` in rule modules and
   in `groups`, updates pins, and refreshes an uncustomized shipped authoring
   contract. Rename a destructured or re-exported `rule` by hand first; the
   migration reports it and writes nothing for that project until it is done.
3. Update consumers of JSONL findings and the API: read `guidance` instead of
   `ruleText`, and expect `pattern` to be the authored declaration rather than
   a glob. Replace `--no-rule-text` with `--no-guidance` in scripts.
4. Check `.espalierignore` and `skip` for lines holding `[`, `]` or `\`; they
   now mean what they mean in `.gitignore`. Escape a literal bracket as
   `\[slug\]`.
5. Run `espalier lint`, `espalier build`, and `espalier build --check`. The
   generated documents change shape wherever instances, groupings, masks or
   constraints appear; review them before committing the upgrade.

Full changes: https://github.com/racinette/espalier/compare/v0.9.2...v0.10.0
