# `espalier explain`

Answers what the espalier says about a path, without running any checks.

```bash
espalier explain src/clients/
espalier explain src/clients/stripe/client.ts
espalier explain components/Modal.tsx
```

`espalier build` writes this same information into the repository as documentation, and `espalier lint` delivers the relevant part of it attached to a violation. `explain` is the direct query: useful while authoring an espalier, and useful to an agent that wants the rules for an area before writing anything.

## Usage

```text
espalier explain <path>

  <path>                a file path or a directory prefix
  --format human|jsonl  output format (default: human)
  --out <dest>          stdout, stderr, or a file path (default: stdout)
  --config <path>       use this config file instead of discovering one
```

A trailing `/` always means a prefix. Without one, the argument is a prefix if the espalier recognizes a directory at that path **and no structural rule owns it as a file**, and a file path otherwise. `espalier explain src/clients` should not answer "not declared" about a directory the espalier plainly describes, and the trie already knows which it is — asking it is cheaper than a flag the reader has to remember.

Both can be true at once. Where a dynamic directory sits beside a dynamic leaf — the shape [MATCHING.MD](../../MATCHING.MD#ambiguity-is-rejected) permits — `clients/registry.ts` matches `clients/[provider]` as readily as it matches `clients/[summary].ts`. The file wins: something owns it, that owner is what the reader is about to write against, and the subtree answer would describe an instance that does not exist. Write the trailing slash to ask the other question.

The path does not have to exist either way. Matching is pure.

## A prefix

Returns everything the espalier declares beneath it: what may exist, which files are required, the rule for each, and every constraint that applies in that subtree.

```text
$ espalier explain components/

components/                              shared UI components

Everything rendered by more than one screen lives here.

A component used by exactly one screen belongs beside that screen instead.

  Declared here:
    components/buttons/[button].tsx      a button component
    components/layouts/[layout].tsx      a layout component

  Zero or more files matching `buttons/[button].tsx` may exist. Zero or more
  files matching `layouts/[layout].tsx` may exist. Nothing else may exist under
  components/.

── components/buttons/[button].tsx ───────────────────────────────────

  a button component

  Rule
    Default-export a single component named after the file.

  Example
    components/buttons/SubmitButton.tsx

── components/layouts/[layout].tsx ───────────────────────────────────

  a layout component

  Rule
    Accept children and no other required prop.

── Constraints applying under components/ ────────────────────────────

  no-as-any                              **/*.ts, **/*.tsx
    Never write as any. Narrow the type instead.
```

The cardinality paragraph is the same text `espalier build` writes into `components/AGENTS.MD`, from the same function, wrapped to the same width less its indent.

That matters more than it looks. The tempting alternative is to phrase it a second way here — "`[button]` matches one filename segment. Zero or more may exist." — which is the same fact in different words from a different code path, and two code paths stating one fact is a promise to drift. `explain` is the direct query and `build` is the written form of the same answer; if they can disagree, the tool has lost the property it exists to provide.

## A path

Returns the rule that owns it, its captures, and every constraint that applies.

```text
$ espalier explain clients/stripe/client.ts

clients/stripe/client.ts                 an integration with an external API

  Owned by  clients/[provider]/client.ts
            provider = "stripe"

  Rule
    Export a single `create<Provider>Client(config)` factory.

  Example
    clients/stripe/client.ts

── Constraints applying to clients/stripe/client.ts ──────────────────

  no-as-any                              **/*.ts, **/*.tsx
    Never write as any. Narrow the type instead.
```

The path does not have to exist. Matching is pure, so `explain` answers "would this be legal, and what would apply" before the file is written — the same question `lint` answers afterwards, from the same source, so the two cannot disagree.

For a path nothing declares, the answer is the deepest recognized node:

```text
$ espalier explain components/Modal.tsx

components/Modal.tsx is not declared.

  The espalier recognizes components/
  Declared there:
    buttons/
    layouts/
```

When the walk reaches only the root, there is nothing to report beyond the violation itself:

```text
  The espalier recognizes nothing on this path.
```

What is declared at a node is names, not descriptions — every child it has, files and directories together, sorted, with directories carrying a trailing `/`. See [MATCHING.MD](../../MATCHING.MD#the-deepest-recognized-node). Ask about one of those names to get its description; the point of this answer is the boundary, and a description here would read as a recommendation.

This is never a ranked guess at where the file belongs.

For a path `espalier` does not govern, the answer says so and names what excluded it:

```text
$ espalier explain package.json

package.json is not governed by espalier.

  Excluded by a pattern in .espalierignore.
```

The three cases read:

```text
  Excluded by a pattern in .espalierignore.
  Ignored by a pattern from .gitignore, read because `ignoreFiles` names it.
  Invisible unconditionally: espalier does not report on its own machinery.
```

Every exclusion is now a line in a file you can open. Naming the file rather than a built-in list is the point of `ignoreFiles` and of `init --lang` writing what it writes — see [CONFIG.MD](../../CONFIG.MD#ignorefiles).

## Nested espaliers

The espalier that answers is the nearest one at or above the path — the same rule matching uses, so the answer is the one that would actually govern the file. See [CONFIG.MD](../../CONFIG.MD#nested-espaliers).

```text
$ espalier explain packages/web/src/index.ts

  Answered by  packages/web
```

This is what makes `explain` trustworthy in a monorepo: run it from the repository root or from inside the package and the answer is the same, because the espalier is chosen by the path rather than by the working directory. `explain` never recurses — one path has one owner, so there is nothing to aggregate.

A prefix is a different question. It lists what one espalier declares, so a prefix spanning a child boundary lists only the outer espalier's declarations and says where the boundary is.

## Human layout

Fixed, so the output is scannable and diffable:

- Descriptions align to **column 41** — on the header line, in the declared list, and beside a constraint's patterns.
- A section rule is `── ` plus a title plus a space, padded with `─` to **70 columns**.
- Composed prose wraps at **78** and is indented two, so nothing exceeds 80.
- Text an author wrote — node prose, rule bodies — is never re-wrapped, exactly as in [build](../build/README.MD#rendering).
- A section with nothing to say is omitted, along with its heading.

The root prefix displays as `./`.

Both forms of the example share the `Example` heading and the same four-space indent: `example` is one line under it, `exampleSource` is as many as it has. Nothing distinguishes them in the layout, because nothing needs to — the reader wants the example, not the mechanism that supplied it.

## Output

As with `lint`, `--format` chooses the encoding and `--out` the destination.

`jsonl` emits **one object**, tagged with a `kind` as in [lint](../lint/README.MD#jsonl). One query, one answer: a consumer parses a single line rather than reassembling a stream, and there is nothing here whose size makes streaming worth that.

The closed-set statement and the cardinality lines are generated by the same code `espalier build` uses. `explain` and the documentation in the repository cannot drift apart, because there is nothing for them to drift between.

### A declared file path

Carries the owning rule, the normalized pattern that matched, the captures, and every constraint that also applies:

```json
{"kind":"explanation","path":"clients/stripe/requestModels.ts","rule":"clients/[provider]/requestModels.ts.mjs","pattern":"clients/*/requestModels.ts","captures":{"provider":"stripe"},"description":"request payload types","ruleText":"Types only, no runtime code.","example":null,"constraints":[{"name":"no-as-any","rule":"[...path]/no-as-any.{ts,tsx}.mjs","patterns":["**/*.ts","**/*.tsx"],"description":"applies to TypeScript files throughout the project","ruleText":"Never write `as any`.","captures":{"path":["clients","stripe"]}}]}
```

### An undeclared file path

`rule`, `pattern` and the rule text are null, and the answer is the deepest recognized node — never a ranked guess:

```json
{"kind":"explanation","path":"components/Modal.tsx","rule":null,"pattern":null,"captures":{},"recognized":"components","declared":["buttons/"],"constraints":[]}
```

`constraints` is empty because a constraint only runs on a file that has a structural owner. Reporting the ones whose patterns happen to match would describe rules that will never run on it.

### A path espalier does not govern

`ignoredBy` names what excluded it — the path of the file the winning pattern came from, `.espalierignore` or an `ignoreFiles` entry alike, or `espalier` for the five things that are invisible unconditionally. Every pattern now reports a file a reader can open, which is what reading these lists from files rather than from a key inside the tool was for:

```json
{"kind":"explanation","path":"package.json","ignoredBy":".espalierignore","rule":null,"pattern":null,"captures":{},"constraints":[]}
```

### A prefix

```json
{"kind":"explanation","prefix":"components/","description":"shared UI components","body":"","rules":[{"path":"components/buttons/[button].tsx","pattern":"components/buttons/*.tsx","rule":"components/buttons/[button].tsx.mjs","description":"a button component","ruleText":"Default-export a single component named after the file.","example":"components/buttons/SubmitButton.tsx","required":false}],"cardinality":"Zero or more files matching `buttons/[button].tsx` may exist. Nothing else may exist under components/.","constraints":[]}
```

`rules` is every structural rule in the subtree, in the same order `build` lists them, with `required` false for anything the espalier does not insist on — a collection that may be empty, and a static leaf whose module exports `optional`. The two are different declarations and `path` tells them apart, but the question `required` answers is whether `lint` will report the file's absence, and for both the answer is no. `description` and `body` come from the directory's `ESPALIER.MD`.

It is called `rules` rather than `declared` because `declared` already means something narrower and is already in the output above: the names of a node's immediate children, which is what `lint` attaches to `unexpected_path`. One key, one shape.

`cardinality` is a single unwrapped string. Line breaks are `build`'s business, since only `build` is writing into a file someone will read as prose.

A constraint is listed under a prefix when its static prefix and the queried prefix are prefixes of one another — that is, when the subtree could contain a file it matches. It is a deliberately generous test: a constraint that reaches a subtree but happens to match nothing in it today will still match the next file added there.

## Exit codes

| | |
|---|---|
| `0` | the path is declared, or the prefix contains declarations |
| `1` | the path is not declared |
| `2` | operational failure |

A path espalier does not govern exits `1`. Ignored is not declared — the espalier says nothing about it, which is the same answer as for a path it never described, arrived at by a different route. The route is in `ignoredBy`, for anyone who needs to tell the two apart.

Every operational failure code is listed in [ERRORS.MD](../../ERRORS.MD).
