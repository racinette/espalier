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

**Dotfiles are the exception, and are skipped entirely.** A `.gitkeep` holding an otherwise-empty espalier root, a `.DS_Store` a file browser left behind — neither is a rule module, and failing the whole run over one is a bad trade. A dotfile that was meant to be a rule module is a mistake you find immediately, because nothing it declares takes effect.

Skipping applies to directories too, and that has a consequence worth stating plainly: **a repository path with a dot-prefixed segment cannot be declared.** Governing `.cursor/rules/backwards-compat.mdc` would need a module at `espalier/.cursor/rules/backwards-compat.mdc.mjs`, which the compiler never reads. Such a path has exactly one legal resting place, `.espalierignore` — which is where `.github/`, `.vscode/` and `.idea/` arrive from, whether by way of your `.gitignore` or by way of what `espalier init --lang` wrote — and `adopt` refuses a dot-prefixed target rather than writing a module that would never load.

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

`[name]` matches within a single path segment and captures the matched text as a string. It may carry literal text on either side: `[button].tsx`, `test-[name].ts`, `[provider]`. It matches one character or more — `[button].tsx` does not match a file named `.tsx`.

`[...name]` matches zero or more complete path segments and captures them as an array of strings. It must occupy an entire segment — `foo[...bar]` is invalid — and it is legal only in constraint paths.

Segments may follow it. `backend/[...path]/handlers/no-fetch.ts` applies to `backend/**/handlers/*.ts`, and captures only the segments the placeholder itself spanned — `backend/orders/handlers/create.ts` gives `path: ["orders"]`, not `["orders", "handlers"]`.

`{name}` matches the text a `[name]` earlier in the same path already captured. It is a back-reference, not a placeholder: it captures nothing and introduces no name of its own. See [Back-references](#back-references).

Placeholder names must be unique within a single path. `[provider]/[provider].ts` is rejected — the second one is either a mistake or a back-reference, and `[provider]/{provider}.ts` says which.

Two different placeholders never constrain each other. Both `stripe/stripe.ts` and `stripe/client.ts` match `[provider]/[implementation].ts`, because `[implementation]` is a fresh name that captures whatever is there. When two parts of a path must agree, that is what `{name}` is for.

### Normalization

Every path normalizes to a glob:

```text
[name]      →  *
[...name]   →  **
{name}      →  *
```

```text
components/buttons/[button].tsx      →  components/buttons/*.tsx
clients/[provider]/client.ts         →  clients/*/client.ts
[...path]/no-as-any.ts               →  **/*.ts
backend/[...path]/no-fetch.ts        →  backend/**/*.ts
```

The normalized form is what `lint` receives as `context.pattern`. Human-facing output — the project map, generated documentation, `explain` — keeps the placeholder names, because they carry meaning a glob does not.

Normalization is lossy for a back-reference and unavoidably so: no glob can say *the same text as that other part*. `clients/[provider]/{provider}.ts` normalizes to `clients/*/*.ts`, which matches strictly more than the rule does. Nothing that decides ownership uses the glob — the matcher walks segments — so this costs precision only where a glob is being read as documentation, and `context.path` is always exact.

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

### Back-references

A `[name]` says *some text goes here and I will call it name*. A `{name}` says *that same text, again*.

```text
clients/[provider]/{provider}.ts.mjs
```

`clients/stripe/stripe.ts` matches. `clients/stripe/client.ts` does not, and neither does `clients/stripe/twilio.ts`. The directory named the file.

**A back-reference resolves to exactly one name once its capture is bound.** Everything else follows from that sentence. It is required for each instance, the way a static leaf is required — `clients/twilio/` without a `twilio.ts` reports `missing_required_file`. It beats a dynamic sibling for ownership, because naming one file is more specific than matching many. And it can never be ambiguous with a static sibling, because by the time it is compared it is a literal too.

It must refer to a `[name]` **earlier in the same path**. `{provider}` with no `[provider]` above it is `unbound_backreference`, reported at compile time. This also means a back-reference always sits beneath a placeholder, so it is always a per-instance requirement and never an unconditional one.

It carries literal text like any other segment part: `[provider]/{provider}.test.ts`, `[provider]/test-{provider}.ts`. Nothing stops it appearing in a directory segment either — `[provider]/{provider}-config/settings.ts` — though the leaf is where it earns its keep.

A segment may hold a back-reference **and** a placeholder: `[provider]/{provider}-[kind].ts` names one file per provider per kind. Such a segment is dynamic rather than resolved, because it still matches many — the tier is decided by how many files a segment can name, not by whether a back-reference appears in it. It therefore competes with dynamic siblings and is checked against them for ambiguity.

What it replaces is a rule body asking politely. Before, `[provider]/[implementation].ts` matched every filename in the directory and the module's `rule` had to say "name this after the directory" and its `lint` had to check. That is prose an agent may or may not follow, checked by code someone has to write, for a fact the espalier could simply state. Stating it also puts it in the generated documentation and the project map, where an agent reads it before writing the file rather than after.

### Multiple extensions

A constraint leaf may list extensions:

```text
[...path]/no-as-any.{ts,tsx}.mjs     applies to  **/*.ts  and  **/*.tsx
```

This is shorthand for two patterns sharing one module, not glob brace expansion. It exists because a constraint that applies to `.ts` almost always applies to `.tsx`, and the alternative is two files with duplicated bodies that drift apart.

Only constraint leaves may list extensions. A structural leaf names one file, and `main.{ts,tsx}.mjs` would be declaring that two files are each required — which is either two rules or a `[name]` placeholder, and is clearer written as whichever was meant. It is rejected as `extension_list_on_structural_leaf`.

Braces therefore mean two things, and never in the same place:

```text
braces in a constraint leaf     an extension list
braces anywhere else            a back-reference
```

The two positions are disjoint, so nothing has to be disambiguated at read time. A constraint leaf is a rule name plus a target extension rather than a segment that matches a file, so a back-reference has nothing to refer to there; and a structural leaf names one file, so a list of extensions has nothing to mean. The comma survives only as a diagnostic: braces containing one, on a structural leaf, is someone expecting a union, and that is what the rejection says.

## Ownership

Every file in the repository is owned by **exactly one** structural rule.

Structural rules compile into a trie, one node per path segment. Matching walks the trie segment by segment, and at each level a more specific node wins:

```text
static  >  resolved  >  dynamic
```

A **static** segment is a literal. A **resolved** segment contains a back-reference and becomes a literal once the captures above it are bound. A **dynamic** segment contains a `[name]` and matches many.

The order is specificity, not a table to memorise: a segment that names one file beats one that names many, and a segment that always names the same file beats one that names a different file per instance.

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

Siblings only conflict within their own tier. Static names cannot collide with each other at all, and a static or resolved sibling beside a dynamic one is decided by specificity rather than by guessing — `requestModels.ts` beside `[implementation].ts`, or `{provider}.ts` beside `[implementation].ts`, are both fine. Two *resolved* siblings are checked exactly like two dynamic ones, because two back-references can resolve to the same text:

```text
[region]/[provider]/{region}.ts
[region]/[provider]/{provider}.ts     rejected — "eu/eu/eu.ts" satisfies both
```

Whether the two captures are ever equal is a fact about the repository, not about the espalier, so it cannot be settled at compile time. Undecidable is undecidable.

Within a tier, the conflict is between siblings competing for the same thing: two leaves that could own one file, or two directories that could claim one subtree. A dynamic directory beside a dynamic leaf is not a conflict even when their names overlap, because a directory never owns a file:

```text
clients/[provider]/client.ts
clients/[list].ts     accepted — one claims directories, the other files
```

It is a strange enough shape to be worth a second look when you write it, and it makes a directory harder to describe — everything nested under the catch-all directory and everything caught beside it have to be explained in the same breath. But it is decidable, and decidable is the bar.

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

**Static leaves are required unless their module says otherwise.** `main.ts.mjs` means `main.ts` must exist, and its absence is `missing_required_file`. A module exporting `optional = true` declares a file that *may* exist: it is owned, documented and linted whenever it is there, and nothing is reported when it is not. See [TYPES.MD](TYPES.MD#optional).

**Resolved leaves are required per instance.** `[provider]/{provider}.ts.mjs` means each provider directory must contain a file named after itself. It behaves as a static leaf does, one instance at a time: `clients/stripe/` without `stripe.ts` reports `missing_required_file`, and `optional` relaxes it the same way. A back-reference cannot occur above the placeholder it refers to, so there is no such thing as an unconditionally required resolved leaf.

**Dynamic leaves are collections.** `[util].ts.mjs` means *every file matching this shape follows this rule*, including none. Zero matches is not a violation.

**Dynamic directories are collections.** `clients/[provider]/` may have zero instances.

**Instantiating a dynamic directory makes its static and resolved descendants required.** Given:

```text
clients
└─ [provider]
   ├─ client.ts.mjs
   └─ requestModels.ts.mjs
```

An empty `clients/` is valid. Once `clients/stripe/client.ts` exists, `clients/stripe/requestModels.ts` is required and its absence is reported. A sibling `clients/stripe/notes.md` is `unexpected_path` unless another structural rule owns it or it is ignored.

Any visible file under the instance instantiates it, whether or not a structural rule owns that file. `clients/stripe/notes.md` alone is enough: something is there, so the directory exists, and a `clients/stripe/` that exists without a client is exactly the drift this reports. Ignored files do not count, being invisible.

**A directory a more specific sibling describes is not an instance.** Requiredness resolves by the same tier order ownership does — static, then resolved, then dynamic — so `clients/` beside `[area]/` is `clients/`, and nothing under it is asked to satisfy `[area]/`. Otherwise a dynamic pair would reach every directory at its depth, and an espalier declaring `[area]/[module]/index.ts` alongside `clients/[provider]/client.ts` would report every provider missing an `index.ts` no rule had placed there. The two questions — who owns this file, and what must exist — are answered from one tree and must be answered the same way.

**Optional descendants stay optional per instance.** `clients/[provider]/webhook.ts.mjs` marked optional means any provider may have a webhook and none has to. This is the case the espalier could not state before: the shared files stay required for every instance, and the one that only some instances carry is declared with its rule rather than left undeclared.

**A directory is optional when everything it declares is.** Directories are never required for their own sake, so nothing needs to be marked at the directory level — a subtree becomes optional by marking its leaves, and stops being optional the moment one of them is required.

**Constraints require nothing.** They describe how matching files are written. They never make a file mandatory.

There is no syntax for "at least one." If a file is mandatory, declare it statically.

## Files espalier does not see

Five things are invisible unconditionally, because espalier reporting on its own machinery is a bug rather than a finding: `espalier.config.yaml`, `.espalierignore`, every file `ignoreFiles` names, the espalier source root, and every file `espalier build` generated.

The VCS directory is **not** among them. `.git/` is an `.espalierignore` entry that `espalier init` writes like any other, so it is visible, appealable and deletable — see [CONFIG.MD](CONFIG.MD#what-is-ignored-without-being-configured).

Everything else in the repository is governed. Files you do not want governed are listed in `.espalierignore` — see [CONFIG.MD](CONFIG.MD#espalierignore).

Symlinks are not a fifth thing. A link is followed, and what it points at is governed under the path the link occupies — see [CONFIG.MD](CONFIG.MD#symlinks).

Ignoring is not declaring. If a path is both required by a static leaf and ignored, the configuration contradicts itself and espalier fails at startup rather than silently passing. An ignored *optional* leaf is not a contradiction — nothing was promised, so hiding it breaks no promise — but the rule is then unreachable, which is worth knowing before you write one.

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

What is declared at a node is every child it has, files and directories together, sorted, with directories carrying a trailing `/`. The two kinds are not separated: an agent asking what may exist here wants the answer, and whether a given answer happens to be a directory is already visible in the name.

**The deepest recognized node is never a ranked guess.** It would be easy to search the whole tree for declarations sharing the file's extension and nominate the closest one, and that would be actively harmful: a modal is not a button, and an agent told to place it in `components/buttons/` may comply. The repository then lints clean while the architecture is wrong, which is the one outcome this tool exists to prevent. Report what is declared where the path stopped being recognized, or report nothing.

## Built-in issues

Two issue codes come from matching rather than from a rule module. Their `rule` field is null, because no module produced them, and their severity is fixed at `error`.

`unexpected_path` — the file is not owned by any structural rule.

`missing_required_file` — a required static leaf has no corresponding file. A leaf its module marks `optional` never reports it.

Everything that makes the espalier itself invalid — overlapping siblings, inconsistent capture names, more than one recursive placeholder in a path, a duplicate placeholder name, a contradiction between an exclusion and a required leaf — is an operational failure, not an issue. It exits `2` and no files are linted. Every code is listed in [ERRORS.MD](ERRORS.MD).

## Worked example

```text
espalier
├─ ESPALIER.MD
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
