# Matching

This document defines the espalier tree: how a path inside `espalier/` becomes a pattern, and how that pattern claims files in the repository.

Everything else reads from this. `espalier lint` uses it to decide which rules run against which files, `espalier build` uses it to place and render documentation, and `espalier explain` uses it to answer what applies to a given path.

## Node kinds

The espalier is a directory tree. Every entry in it is one of four things.

**Directories** correspond to directories in the repository. `espalier/components/buttons/` describes `components/buttons/`.

**Structural rule modules** are `.mjs` files whose name is the name of the file they govern, plus `.mjs`:

```text
main.ts.mjs               governs  main.ts
[button].tsx.mjs          governs  *.tsx  in this directory
```

**Constraint rule modules** are `.mjs` files whose name is a rule name plus a target extension, plus `.mjs`. They appear only on paths containing a recursive placeholder:

```text
[...path]/no-as-any.ts.mjs           applies to  **/*.ts
backend/[...path]/no-fetch.ts.mjs    applies to  backend/**/*.ts
```

**Node descriptions** are files named `ESPALIER.MD`. They describe the directory they sit in rather than any file in the repository:

```text
espalier/ESPALIER.MD                  the project itself
espalier/src/clients/ESPALIER.MD      what src/clients/ is
```

YAML frontmatter carries a `description` — the one line that appears in the project map. The markdown body is the long form, served by `espalier explain` and written into generated documentation. Both parts are optional, and a directory with nothing to say has no file at all.

```markdown
---
description: outbound API integrations
---

Every upstream provider gets its own directory. Nothing outside
`src/clients/` performs HTTP requests directly.
```

The name is reserved: `espalier/src/clients/ESPALIER.MD` describes the directory, while `espalier/src/clients/ESPALIER.MD.mjs` would be the rule governing a real `src/clients/ESPALIER.MD` file in the repository. Any other non-`.mjs` file in the espalier is an error.

## Classification

A rule module path that contains `[...name]` is a **constraint**. Every other rule module is **structural**.

That single signal decides how the leaf is read:

```text
main.ts.mjs                    structural   leaf is a filename
clients/[provider]/client.ts.mjs   structural   leaf is a filename
[...path]/no-as-any.ts.mjs     constraint   leaf is <rule-name>.<extension>
```

`main.ts.mjs` and `no-as-any.ts.mjs` are spelled the same way. They mean different things because one sits on a recursive path and the other does not.

A path may contain at most one recursive placeholder.

## Placeholders

Square brackets mark variable parts of a path.

`[name]` matches within a single path segment and captures the matched text as a string. It may carry literal text on either side: `[button].tsx`, `test-[name].ts`, `[provider]`.

`[...name]` matches zero or more complete path segments and captures them as an array of strings. It must occupy an entire segment — `foo[...bar]` is invalid — and it is legal only in constraint paths.

Placeholder names must be unique within a single path. `[provider]/[provider].ts` is rejected.

Names are descriptive only. They capture values; they never constrain the relationship between them. Both `stripe/stripe.ts` and `stripe/client.ts` match `[provider]/[implementation].ts`. If the two must agree, the rule text says so and `lint` checks it.

### Normalization

Every path normalizes to a glob:

```text
[name]      →  *
[...name]   →  **
```

```text
components/buttons/[button].tsx      →  components/buttons/*.tsx
clients/[provider]/client.ts         →  clients/*/client.ts
[...path]/no-as-any.ts               →  **/*.ts
backend/[...path]/no-fetch.ts        →  backend/**/*.ts
```

The normalized form is what `lint` receives as `context.pattern`. Human-facing output — the project map, generated documentation, `explain` — keeps the placeholder names, because they carry meaning a glob does not.

Patterns use `/` as separator on every platform, match case-sensitively even on case-insensitive filesystems, and match dotfiles like any other name. There is no `?` and no brace expansion.

### Captures

`[name]` produces a string. `[...name]` produces an array of segments, possibly empty. A path with no placeholders produces an empty object.

Matching `clients/stripe/stripe.ts` against `clients/[provider]/[implementation].ts`:

```js
{ provider: "stripe", implementation: "stripe" }
```

Matching `backend/deep/nested/handler.ts` against `backend/[...path]/no-fetch.ts`:

```js
{ path: ["deep", "nested"] }
```

Constraint captures come only from the directory portion of the path. The leaf of a constraint is a rule name and an extension, not a placeholder, so the filename is not captured — read `context.path` for it.

### Multiple extensions

A constraint leaf may list extensions:

```text
[...path]/no-as-any.{ts,tsx}.mjs     applies to  **/*.ts  and  **/*.tsx
```

This is shorthand for two patterns sharing one module, not glob brace expansion. It exists because a constraint that applies to `.ts` almost always applies to `.tsx`, and the alternative is two files with duplicated bodies that drift apart.

## Ownership

Every file in the repository is owned by **exactly one** structural rule.

Structural rules compile into a trie, one node per path segment. Matching walks the trie segment by segment, and at each level a more specific node wins:

```text
static  >  dynamic
```

Given:

```text
clients
└─ [provider]
   ├─ requestModels.ts.mjs
   └─ [implementation].ts.mjs
```

`clients/stripe/requestModels.ts` is owned by the static rule, not by `[implementation].ts`, even though both patterns match it. This is how a broad family gets a named exception without two rules running on the same file.

Only the winning structural rule's `lint` runs.

Constraints work differently. They do not participate in ownership and they do not compete. **Every** constraint whose pattern matches a file runs against it, in addition to that file's structural owner.

A constraint only runs on a file that **has** a structural owner. The espalier's reach is the tree it declares: a file no structural rule claims is reported once as `unexpected_path` and otherwise left alone. Nothing has said that file belongs to this project, so nothing gets to say how it should be written.

In a conforming repository this distinction is invisible — every file has an owner, so every matching constraint applies. It matters only while the repository is out of conformance, where it stops one undeclared file from producing an issue for every constraint that happens to match its extension.

## Ambiguity is rejected

Two situations make ownership undecidable. Both are compile-time errors, reported before any file is read, and both exit `2`.

**Overlapping dynamic siblings.** Two dynamic patterns in the same directory conflict when some filename could satisfy both:

```text
[component].tsx
[helper].tsx          rejected — both are *.tsx
```

```text
[name].ts
test-[name].ts        rejected — "test-a.ts" matches both
```

```text
[name]-test.ts
test-[name].ts        rejected — "test-x-test.ts" matches both
```

Dynamic siblings that cannot collide are fine:

```text
[component].tsx
[helper].ts           accepted — no filename ends in both
```

**Inconsistent capture names.** A dynamic directory is one node in the trie, so it has one name:

```text
clients/[provider]/client.ts.mjs
clients/[vendor]/requestModels.ts.mjs     rejected
```

Both branches describe the same directory. Pick one name:

```text
clients/[provider]/client.ts.mjs
clients/[provider]/requestModels.ts.mjs   accepted
```

Ambiguity is never resolved by declaration order or alphabetically. An espalier that cannot decide is a broken espalier.

## What must exist

Only files are validated. Directories are not checked for their own sake — a directory matters exactly as much as the files declared inside it.

**Static leaves are required.** `main.ts.mjs` means `main.ts` must exist. Its absence is `missing_required_file`.

**Dynamic leaves are collections.** `[util].ts.mjs` means *every file matching this shape follows this rule*, including none. Zero matches is not a violation.

**Dynamic directories are collections.** `clients/[provider]/` may have zero instances.

**Instantiating a dynamic directory makes its static descendants required.** Given:

```text
clients
└─ [provider]
   ├─ client.ts.mjs
   └─ requestModels.ts.mjs
```

An empty `clients/` is valid. Once `clients/stripe/client.ts` exists, `clients/stripe/requestModels.ts` is required and its absence is reported. A sibling `clients/stripe/notes.md` is `unexpected_path` unless another structural rule owns it or it is ignored.

**Constraints require nothing.** They describe how matching files are written. They never make a file mandatory.

There is no syntax for "at least one." If a file is mandatory, declare it statically.

## Files espalier does not see

Three things are invisible unconditionally, because espalier reporting on its own machinery is a bug rather than a finding: the VCS directory, the espalier source root, and every file `espalier build` generated.

Everything else in the repository is governed. Files you do not want governed are listed in `ignore` — see [CONFIG.MD](CONFIG.MD).

Ignoring is not declaring. If a path is both required by a static leaf and ignored, the configuration contradicts itself and espalier fails at startup rather than silently passing.

## The deepest recognized node

Resolving ownership walks the file's segments through the trie. When the walk fails, the node it reached last is worth keeping: it is the point at which the espalier stopped recognizing the path.

That node is what `unexpected_path` reports. Given:

```text
clients
└─ [provider]
   ├─ client.ts.mjs
   └─ requestModels.ts.mjs
```

`clients/acme/random.ts` walks through `clients`, matches `[provider]` against `acme`, and fails at the filename. The deepest recognized node is `clients/[provider]`, with `provider` captured as `acme`, and what is declared there is `client.ts` and `requestModels.ts`.

`components/Modal.tsx` in an espalier that declares only `components/buttons/` reaches `components` and stops. What is declared there is the directory `buttons/` — true, useful, and not a claim about where a modal belongs.

`backend/orders/handler.ts` in an espalier that declares no `backend/` reaches the root and recognizes nothing. Then there is nothing to report beyond the violation itself.

**The deepest recognized node is never a ranked guess.** It would be easy to search the whole tree for declarations sharing the file's extension and nominate the closest one, and that would be actively harmful: a modal is not a button, and an agent told to place it in `components/buttons/` may comply. The repository then lints clean while the architecture is wrong, which is the one outcome this tool exists to prevent. Report what is declared where the path stopped being recognized, or report nothing.

## Built-in issues

Two issue codes come from matching rather than from a rule module. Their `rule` field is null, because no module produced them, and their severity is fixed at `error`.

`unexpected_path` — the file is not owned by any structural rule.

`missing_required_file` — a required static leaf has no corresponding file.

Everything that makes the espalier itself invalid — overlapping siblings, inconsistent capture names, a recursive placeholder in a structural path, a duplicate placeholder name, a contradiction between `ignore` and a required leaf — is an operational failure, not an issue. It exits `2` and no files are linted.

## Worked example

```text
espalier
├─ AGENTS.MD
├─ main.ts.mjs
├─ components
│  └─ buttons
│     └─ [button].tsx.mjs
├─ clients
│  └─ [provider]
│     ├─ client.ts.mjs
│     └─ requestModels.ts.mjs
├─ backend
│  └─ [...path]
│     └─ no-fetch.ts.mjs
└─ [...path]
   └─ no-as-any.{ts,tsx}.mjs
```

Against this repository:

```text
main.ts
components/buttons/Submit.tsx
clients/stripe/client.ts
clients/stripe/requestModels.ts
backend/orders/handler.ts
components/Modal.tsx
```

| Repository file | Structural owner | Captures | Constraints |
|---|---|---|---|
| `main.ts` | `main.ts` | — | `no-as-any` |
| `components/buttons/Submit.tsx` | `components/buttons/[button].tsx` | `button: "Submit"` | `no-as-any` |
| `clients/stripe/client.ts` | `clients/[provider]/client.ts` | `provider: "stripe"` | `no-as-any` |
| `clients/stripe/requestModels.ts` | `clients/[provider]/requestModels.ts` | `provider: "stripe"` | `no-as-any` |
| `backend/orders/handler.ts` | none → `unexpected_path` | — | none |
| `components/Modal.tsx` | none → `unexpected_path` | — | none |

The last two files sit outside the espalier's reach. Both match constraint patterns — `no-as-any` covers `**/*.ts` and `**/*.tsx`, `no-fetch` covers `backend/**/*.ts` — but neither has a structural owner, so neither is constrained. Each produces exactly one issue.

Declaring the shape of `backend/` is a separate, structural job. The constraint at `backend/[...path]/no-fetch.ts` says how backend TypeScript is written; it never declares that backend TypeScript should exist.
