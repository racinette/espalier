# Espalier 0.11.0

Parts of the espalier can be locked, files can be frozen, and collections
sealed; `espalier lint --base` checks a change against all three at a git
revision, and `espalier guard` fences one piece of work with them. One group of
a grouping can be declared with its own guidance, a name can hold
alternatives, masks distinguish case and gain hex digits and ranges, a capture
can require a case style, and generated maps use compact marks instead of
parenthesized words.

There are breaking changes to configuration, which no longer records a
version, to computed guidance that read the configuration, to the `A` and `X`
mask characters, and to the shape of generated documents. Review the upgrade
instructions below before migrating.

## No more `pin`

`espalier.config.yaml` no longer records an espalier version. The version that
runs is the one installed; a project that needs every machine to agree fixes it
the way it fixes any tool, with a development dependency and its lockfile.
Upgrading or downgrading no longer needs a config change, and `lint --base` can
read a base on either side of one. A config that still says `pin` or `version`
is rejected with a pointer, and `espalier migrate` removes both.
`version_mismatch`, `config_missing_pin` and `cannot_downgrade` are gone.

## Locks replace `build.guidanceMode`

Any module of the espalier may export `locked`:

```js
// espalier/src/core/ESPALIER.mjs
export const locked = true;
```

A locked module needs explicit authorization before anything it declares
changes: its guidance, its checks, and for an abstract contract its member
list. A directory module locks its subtree until a deeper module says `locked =
false`, and a declaration inherits from its directory, not its contract.
Unlocked modules take the changes a task clearly implies; open designs are
still proposed first. Generated guidance marks locked modules with 🔒 and
states both behaviours. `espalier help locks` is the specification.

`build.guidanceMode` is removed. A project that set it to `fixed` meant the
whole espalier was locked, and `espalier migrate` writes exactly that:
`locked = true` on the espalier root's `ESPALIER.mjs`. Computed `guidance` and
`description` receive the declaring module's lock as `locked`, in place of
reading `config.build.guidanceMode`.

## Frozen files and sealed collections

Locks never apply to the project's files. Two new exports do:

```js
// espalier/migrations/0001[ord=00]_users.sql.mjs
export const frozen = true;

// espalier/locales/[lang=a+].json.mjs
export const sealed = true;
```

- `frozen` keeps an existing file's content: it must not be edited, removed or
  renamed, while new files are welcome, so a frozen collection is append-only.
  It may be set on a directory module, a structural rule, an instance
  declaration or a declared group, and the most specific statement wins;
  `frozen = false` reopens. Declared groups that could share a file must agree,
  or compilation fails with `conflicting_frozen`.
- `sealed` keeps a collection's members: no file joins or leaves it, while the
  files stay editable. It may be set on a directory, a rule, a declaration, a
  declared group, or a grouping as `sealed: true`, where only a whole group
  appearing or disappearing counts. A directory module with `sealed = false`
  takes its subtree out of the sealed directories above it, so a sealed tree
  can leave room for one piece of work.

Both together make a snapshot, such as vendored code. Generated guidance marks
frozen nodes with ❄️ and sealed ones with 📦, and `explain` reports `frozen`,
`frozenBy` and `sealedBy`.

## Checking a change against a base

```bash
espalier lint --base origin/main
```

`--base` names a git revision. Lint reads the repository as it was there and
reports every change in the working tree that a lock, freeze or seal in force
there covers: `locked_module_changed`, `locked_directory_changed`,
`locked_contract_changed`, `lock_changed`, `untraceable_import`,
`frozen_file_changed` and `sealed_collection_changed`. A locked module is
compared with every repository file it imports, so a locked module must import
by literal paths. Both sides are read by the installed espalier; anything that
keeps the base from being read stops the run with `base_unreadable`. Without
`--base`, lint never consults git. What counts as authorization is the
project's decision, typically an approval required before a failing check may
be overridden.

## Guarding a piece of work

`espalier guard` fences one piece of work: it closes parts of the repository
and opens what the work needs, by writing locks, freezes and seals into the
espalier, and `espalier unguard` takes it all back.

```bash
espalier guard --close . --open src/components/Checkout/ --edit src/router.ts
```

Targets are repository paths or the espalier's own names: directories, files,
groups and patterns. Every change is marked, so unguard restores each module
byte for byte, and one guard is in place at a time. Lint reports a guard left
in place as `guard_in_place`, a warning. With `lint --base` against the guard
commit, an agent's change outside its opening is reported. `docs/LOCKS.MD`
"Guarding a piece of work" describes the workflow.

## Rule prose is optional

A rule module no longer has to export `description` or `guidance`, and a
grouping in `groups` needs only `by`. The file's name already declares its
path, so an empty module requires its file, and a declaration exporting only
`instanceOf` and `frozen` freezes one member of a contract.
`module_missing_export` is gone.

## Declared groups

A module at a dynamic rule's name, with the grouping's captures written as
values, declares one group:

```js
// espalier/migrations/0001[ord=00]_users.sql.mjs: the 0001 users set
export const instanceOf = "[num=0000][ord=00]_[table=a+].sql.mjs";
export const description = "the released users set";
export const guidance = "Shipped in 1.0.";
```

It owns no file. Its guidance and optional `lint` apply to that group beside
the grouping's own, and it is required in every directory its rule reaches
unless it exports `optional`, reported as `missing_required_group`. A grouping
with `abstract: true` reports an undeclared group as `undeclared_instance`.
`runGroup` runs a declared group's `lint` when given its module.

A named directory instance can declare groups of the groupings it inherits,
in its own directory, and they hold only its files: `features/checkout/` can
open its own step `0001` while every other feature's stays frozen. An
instance that restates its contract's rule can also add to an inherited
grouping by naming it without `by`: make it abstract or sealed, add guidance
or a check, but never replace or loosen it. A group both the contract and an
instance declare runs both checks, is required once, and takes `frozen` and
`sealed` from the instance.

## Alternatives in names

Braces holding a comma match exactly one of their alternatives, anywhere in a
structural path, and an empty alternative makes that part optional:

```text
[num=00000][ord=00]_[table=a+].[kind={tables,indexes,grants}]{,.[role=a+]}.sql
```

A capture in an alternative the name did not take is absent, not empty, so a
grouping may not group by it. A name two combinations of alternatives could
both match is rejected at compile time.

## Back-references beside patterns

- A pattern holding a back-reference now outranks a plain pattern, the way a
  resolved name does: `[step]_{feature}.sql` owns `0001_checkout.sql` in
  `features/checkout/steps/` beside `[step]_[name].sql`, where the two were
  refused as ambiguous siblings. Generated maps list such patterns before the
  plain ones.
- A file named by back-references, such as `{feature}.ts`, can be declared an
  instance of a sibling pattern, so each feature's entry file joins the
  pattern's groups and runs its checks. Where the value is not a member of the
  contract, the declaration names nothing.
- A named instance's documents write the values it binds into names:
  `[step]_checkout.sql` and `checkout.ts` under `features/checkout/`.

## Masks: case, hex, ranges and case styles

A lowercase mask character now means lowercase and a capital means capitals.
`A` is a capital letter and `X` a capital letter or digit; what they matched
before, a letter or a letter and digit of either case, is `l` and `w`, and
`espalier migrate` renames the modules that use them. `L` and `W` are
rejected with a pointer to `l` and `w`.

```text
[code=A(2..3)0(..2)].txt             EU.txt, USA12.txt; not eu.txt
[rev=h(12)]_[name@snake].py          3f9a2c1b4d5e_add_users.py
[id=w(11)].json                      dQw4w9WgXcQ.json
[seq=0(4..)]_[name@snake].sql        0001_add_users.sql
[Name@Pascal].tsx                    SubmitButton.tsx, HTMLView.tsx
[slug@kebab].ts                      order-history.ts
[NAME@SNAKE].ts                      MAX_RETRIES.ts
```

- `h` and `H` are a hex digit, lowercase or capital.
- `k` and `K` are a letter, digit or dash, and `s` and `S` a letter, digit or
  underscore, lowercase or capital: the characters of kebab and snake names in
  any order.
- `(m..n)`, `(m..)` and `(..n)` repeat an element between two counts,
  extending `(n)`.
- A capture can require a case style after `@`, as it takes a mask after `=`:
  `kebab`, `snake`, `KEBAB`, `SNAKE`, `camel` or `Pascal`, each name written
  in its own style. They allow digits after the first letter and capitals in
  runs, so acronyms pass either way they are written. One lowercase word is
  kebab, snake and camel at once, and one capital word KEBAB and SNAKE, so
  sibling rules in two such styles are rejected as overlapping.

## Generated documents

- Maps use marks after each name instead of parenthesized words: ❗ for a file
  or directory that must exist, a count such as `0+` or `1+` on a pattern, 📋
  for an abstract contract, and 🔒, ❄️ and 📦. Each document's legend explains
  the marks it uses. `(instance of …)` and `(literal name)` remain.
- Guidance an author writes is rendered once. An instance directory's document
  names where its contract's guidance is stated instead of repeating it, and a
  file that takes over an inherited one does the same.
- The legend for masks, lists and case styles is stated once per document,
  under the map, and explains exactly the ones the document shows.
- A name too long for a readable column hangs its description below it.

## Smaller changes

- `explain` gives a prefix's map the same legends a generated document has,
  for its marks and for its masks, lists and case styles, and lines up its
  labelled values in one column. Each JSON map entry summarizes its name:
  `rank`, `captures` with their masks, lists and case styles, and
  `backReferences`.
- `create` refused a name its directory does not declare without saying what
  it does declare; it now names those patterns, so a name that misses a mask
  or case style shows what it missed.
- `ambiguous_siblings` names one file both siblings would match, such as
  `test-test.ts`, in its message and as `name` in its detail.
- Piping `lint`, `explain` or `build` into a reader that leaves early, such as
  `head`, no longer crashes; the output ends, and the run finishes with its
  exit code.

## Upgrading from 0.10.0

1. Install `espalier@0.11.0` and preview migration with `espalier migrate --dry-run`.
2. Run `espalier migrate`. It removes `pin` (or `version`), removes
   `build.guidanceMode`, for `fixed` adds `locked = true` to the espalier
   root's `ESPALIER.mjs`, and renames modules whose masks use `A` or `X` to `l`
   and `w`, which match what they did, rewriting the literal `instanceOf` paths
   that name them. Where a mask meant capitals, tighten it back to `A` or `X`.
3. Replace any computed guidance or description that reads
   `config.build.guidanceMode` with the context's `locked`.
4. Run `espalier lint`, `espalier build`, and `espalier build --check`. Every
   generated map changes notation; review the documents before committing the
   upgrade.
5. To enforce locks, freezes and seals, run `espalier lint --base` against the
   target branch in CI, with that branch fetched; see `espalier help locks`.

Full changes: https://github.com/racinette/espalier/compare/v0.10.0...v0.11.0
