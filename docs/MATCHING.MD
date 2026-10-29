# Matching

This document defines the espalier tree: how a path inside `espalier/` becomes a pattern, and how that pattern claims files in the repository.

Everything else reads from this. `espalier lint` uses it to decide which rules run against which files, `espalier build` uses it to place and render documentation, and `espalier explain` uses it to answer what applies to a given path.

## Node kinds

The espalier is a directory tree. Every entry in it is one of four things.

**Directories** correspond to directories in the repository. `espalier/components/buttons/` describes `components/buttons/`.

**Structural rule modules** are `.mjs` files whose name is the name of the file they govern, plus `.mjs`:

```text
main.ts.mjs               governs  main.ts
[button].tsx.mjs          governs  files with complete extension .tsx here
[migration].up.sql.mjs    governs  files with complete extension .up.sql here
[file].{ts,d.ts,tsx}.mjs  governs  those three complete extensions
```

**Constraint rule modules** are `.mjs` files that sit on a path containing a recursive placeholder. Their filename supplies a rule name and an extension selector, or their module exports `targets` instead:

```text
[...path]/no-as-any.ts.mjs              selects  files with complete extension .ts throughout the project
backend/[...path]/no-fetch.ts.mjs       selects  files with complete extension .ts under backend/
src/[...path]/message-registry.json.mjs selects  files with complete extension .json under src/
src/[...path]/message-registry.mjs      selects  the module's `targets` under src/
```

**Directory modules** are named `ESPALIER.mjs`. They describe their containing
directory, rather than a governed file:

```js
export const description = "Outbound API integrations";
export const guidance = `Every upstream provider gets its own directory.
Nothing outside src/clients/ performs HTTP requests directly.`;
export const fold = false;
```

All three exports are optional. `description` and `guidance` may instead be
sync/async functions of the [compilation context](TYPES.MD#directory-modules).
`fold = true` folds this directory and its entire subtree
into the nearest enclosing generated document. It changes placement only.
See [Named instances](#named-instances) for context and inheritance.

`ESPALIER.mjs` is reserved. `ESPALIER.mjs.mjs` governs a repository file
named `ESPALIER.mjs`. Legacy `ESPALIER.MD` remains accepted as migration input;
both directory formats in the same directory are rejected.

**Dot-prefixed paths are ordinary paths.** `.env.mjs` declares `.env`, and
`.github/workflows/[workflow].yml.mjs` declares workflow files. The same rules
apply to matching, constraints, creation, documentation, and adoption.

**`skip` excludes rule-tree entries.** Patterns are relative to the espalier
root. Matching directories are pruned before reading their contents, including
any `.mjs` or `ESPALIER.mjs` inside. In directories that are inspected, matching
non-grammar files are skipped; individually skipping a `.mjs` module or
`ESPALIER.mjs` is `skip_hides_grammar`. Exclude a tooling directory as a whole,
for example `.claude/`, rather than hiding individual rule files. Bare names
match at any depth. Dot-prefixed names have no implicit exclusion.
The root `.cache/` directory is reserved for Espalier's bookkeeping and is
not compiled. See [CONFIG.MD](CONFIG.MD#skip).


## Classification

A rule module path that contains `[...name]` is a **constraint**. Every other rule module is **structural**.

That single signal decides that the leaf is a constraint. The filename and `targets` decide which files it selects; `aggregate` decides how often its `lint` runs:

```text
main.ts.mjs                         structural   leaf is a filename
clients/[provider]/client.ts.mjs    structural   leaf is a filename
[...path]/no-as-any.ts.mjs          constraint   name is no-as-any; selects .ts
src/[...path]/registry.json.mjs     constraint   name is registry; selects .json
src/[...path]/registry.mjs          constraint   name is registry; needs targets
```

`main.ts.mjs` and `no-as-any.ts.mjs` are spelled the same way. They mean different things because one sits on a recursive path and the other does not. For any constraint, the first dot in the leaf separates its rule name from its extension selector; `.mjs` is only the module suffix. All the remaining dotted parts belong to the selector: `migration-order.up.sql.mjs` selects the complete extension `.up.sql`, not `.sql`. A constraint name cannot contain a dot, and an extension selector cannot have an empty dotted part. An extensionless leaf requires `targets`; a leaf with an extension must not export `targets`. A missing or malformed selector is `malformed_constraint_leaf`, and declaring both forms is `module_invalid_export`.

These rules apply equally to per-file and aggregate constraints. `element-frequency.json.mjs` selects files with complete extension `.json` even when it exports `aggregate = true`. That export makes one invocation with the complete selected group; it does not reinterpret the filename.

A path may contain at most one recursive placeholder.

## Placeholders

Square brackets mark variable parts of a path. Matching preserves the segment's
text, including spaces and line breaks.

`[name]` matches within a single path segment and captures the matched text as a string. It may carry literal text on either side: `[button].tsx`, `test-[name].ts`, `[provider]`. It matches one character or more — `[button].tsx` does not match a file named `.tsx`. In a structural filename with an extension selector, the capture cannot include a dot: `[file].ts` matches `foo.ts`, not `foo.d.ts`. Use `[file].d.ts` or an explicit union to include the latter.

This dot restriction applies to captures, not to literal text or back-references.
`foo.[file].ts` matches `foo.bar.ts`, capturing `bar`. Structural rules match
the authored filename pattern; they do not classify the resulting filename's
complete extension.

A constraint's filename selector does classify that extension: everything from
the first dot in the actual filename. `foo.bar.ts` has complete extension
`.bar.ts`, so a `.ts` constraint does not select it, a `.bar.ts` constraint
does, and `targets = ["**/*.ts"]` selects it by suffix. Structural ownership
and constraint selection answer separate questions.

`[...name]` matches zero or more complete path segments and captures them as an array of strings. It must occupy an entire segment — `foo[...bar]` is invalid — and it is legal only in constraint paths.

Segments may follow it. `backend/[...path]/handlers/no-fetch.ts` selects files with complete extension `.ts` in matching `backend/**/handlers/` directories, and captures only the segments the placeholder itself spanned — `backend/orders/handlers/create.ts` gives `path: ["orders"]`, not `["orders", "handlers"]`.

`{name}` matches the text a `[name]` earlier in the same path already captured. It is a back-reference, not a placeholder: it captures nothing and introduces no name of its own. See [Back-references](#back-references).

Placeholder names must be unique within a single path. `[provider]/[provider].ts` is rejected — the second one is either a mistake or a back-reference, and `[provider]/{provider}.ts` says which.

Two different placeholders never constrain each other. Both `stripe/stripe.ts` and `stripe/client.ts` match `[provider]/[implementation].ts`, because `[implementation]` is a fresh name that captures whatever is there. When two parts of a path must agree, that is what `{name}` is for.

### Masks

A capture may constrain the text it accepts. The constraint follows the name
after `=` and is a *mask*: a picture of the text, one mask character per
character of the name.

```text
[seq=000000]_[name].tables.sql       six digits, an underscore, then anything
[at=0(14)]_[name].rb                 fourteen digits
[code=AAA]-[n=00]                    three letters, a dash, two digits
[slug=a+]                            lowercase letters, one or more
[day=0(4)-0(2)-0(2)]_[title].md      a date, captured as one value
```

The mask vocabulary is deliberately small:

| Mask | Matches one |
|---|---|
| `0` | ASCII digit |
| `#` | ASCII digit, or nothing |
| `A` | ASCII letter |
| `a` | ASCII lowercase letter |
| `X` | ASCII letter or digit |
| `x` | ASCII lowercase letter or digit |
| `-` `_` | that character, literally |

Two suffixes repeat the element before them: `+` means one or more times, and
`(n)` means exactly `n` times. `0+` is one or more digits; `0(4)#(2)` is four
to six; `0000##` says the same thing written out. `#+` is zero or more digits,
which is legal only beside something required: a mask must require at least
one character, so a capture never matches the empty string, mask or no mask.

A mask describes the shape of a name, not its meaning. `0(14)` is fourteen
digits whether or not they form a date; whether they do is a question for the
rule's `lint`, which receives the capture. There are no named formats for the
same reason: a timestamp is fourteen digits in one migration tool and ten in
another, and the mask spells whichever one the repository uses.

Masks never contain a dot, so the dot restriction on structural captures is
unaffected: every mask class excludes `.`, and a bare `[name]` keeps excluding
it in an extension-bearing structural filename.

The two literal characters exist for values that are one thing. A date, a
version or an identifier with internal separators is a single capture when it
is a single value, and templates, back-references and `create` then see it
whole. Split it into several captures when the parts are separately meaningful.

A capture may instead list the names it accepts, in braces:

```text
[kind={tables,views,functions}].sql
```

The alternatives are literal, case-sensitive, nonempty and distinct, and at
least two are required: a single alternative is a static name and should be
written as one. They may contain `-` and `_` and no other punctuation. A mask
cannot appear inside a list and a list cannot appear inside a mask; a name
that must accept two shapes is two sibling rules, and ownership decides between
them. Inside a capture, braces are always a list; a back-reference is `{name}`
outside one.

A back-reference repeats the bound text and carries no mask of its own:
`{seq=0+}` is rejected. A name is declared once per path, mask included, so
`[seq=000000]` and a later `[seq=0+]` are a duplicate, not a refinement.

Anything else after `=` is rejected as `malformed_placeholder`, naming the
offending character. The vocabulary is built from characters every filesystem
accepts, which is why the separator is `=` rather than `:`, and why `?` and
`*` do not appear.

### Captures must be unambiguous

Because captures feed templates, back-references, named instances and
`create`, a name must determine its captures. A segment is rejected as
`ambiguous_captures` when some name could be split between its captures in
more than one way:

```text
[a][b].sql          rejected — "xyz.sql" is a="x" b="yz" or a="xy" b="z"
[a]_[b].sql         rejected — "x_y_z.sql" is a="x" b="y_z" or a="x_y" b="z"
[a=0+]_[b].sql      accepted — a digit run cannot contain the underscore
[a]_[b=0+].sql      accepted — the underscore must follow a, and b is digits
[a]_[b=0+]_[c].sql  rejected — "x_1_2_y.sql" is a="x" b="1" c="2_y" or a="x_1" b="2" c="y"
[a=0(6)]_[b].sql    accepted
[a=x+]-[b=x+].sql   accepted — neither side can contain the dash
```

The error names a filename that splits two ways and shows both splits. The
check is exact: it decides whether any name admits two parses, not whether the
pattern looks ambiguous. The remedy is a mask that excludes the separator, or
a separator that no neighbouring capture can contain.

A back-reference inside such a segment is treated as text that no capture can
absorb, because its value is fixed by the enclosing instance before the
segment is matched. A name that could be split differently around that bound
text is matched with the earliest possible split.

### The pattern a rule reports

A rule's `pattern` is its declaration exactly as authored, relative to the
rule-tree root, without the final `.mjs`:

```text
components/buttons/[button].tsx.mjs   →  components/buttons/[button].tsx
clients/[provider]/client.ts.mjs      →  clients/[provider]/client.ts
[...path]/no-as-any.{ts,tsx}.mjs      →  [...path]/no-as-any.{ts,tsx}
backend/[...path]/no-fetch.ts.mjs     →  backend/[...path]/no-fetch.ts
```

That is what `lint` receives as `context.pattern`, what an issue records, what
`explain` reports, and what a computed `guidance` or `description` callback is
given. Nothing is normalized away: placeholder names, masks, back-references
and extension unions all survive, because they carry meaning a glob cannot
express. The file that matched is `context.path`, exact, and the values the
declaration left open are `context.captures`. An inherited check reports its
base declaration, even inside a named instance.

Nothing matches against a `pattern`. The matcher walks segments, and the glob
an aggregate receives as `context.patterns` is its admission selector, derived
from a filename extension or `targets`, not its declaration.

Patterns use `/` as separator on every platform, match case-sensitively even on case-insensitive filesystems, and match dotfiles like any other name. Structural extension unions and constraint filename extension lists are parsed as rule syntax; neither is glob brace expansion.

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

Constraint captures come only from the directory portion of the path. The leaf of a constraint is a rule name, optionally followed by an extension selector, not a placeholder, so the filename is not captured. Read `context.path` on a per-file constraint, or each match's `path` on an aggregate.

### Back-references

A `[name]` says *some text goes here and I will call it name*. A `{name}` says *that same text, again*.

```text
clients/[provider]/{provider}.ts.mjs
```

`clients/stripe/stripe.ts` matches. `clients/stripe/client.ts` does not, and neither does `clients/stripe/twilio.ts`. The directory named the file.

A back-reference repeats dots too. For a provider named `foo.bar`, this rule
requires `clients/foo.bar/foo.bar.ts`. That filename's complete extension is
`.bar.ts`, so a `.ts` constraint does not select it. Repeating a directory name
does not change how constraints classify the resulting filename.

**A back-reference resolves to exactly one name once its capture is bound.** Everything else follows from that sentence. It is required for each instance, the way a static leaf is required — `clients/twilio/` without a `twilio.ts` reports `missing_required_file`. It beats a dynamic sibling for ownership, because naming one file is more specific than matching many. And it can never be ambiguous with a static sibling, because by the time it is compared it is a literal too.

It must refer to a `[name]` **earlier in the effective contract path**. A named
`instanceOf` specialization retains captures from its base. For example, a
required `stripe/` specializing `[provider]/` binds `provider = "stripe"`, so
an inherited `{provider}.ts` requires `stripe/stripe.ts`. An unbound
`{provider}` is `unbound_backreference`, reported at compile time.

It carries literal text like any other segment part: `[provider]/{provider}.test.ts`, `[provider]/test-{provider}.ts`. Nothing stops it appearing in a directory segment either — `[provider]/{provider}-config/settings.ts` — though the leaf is where it earns its keep.

A segment may hold a back-reference **and** a placeholder: `[provider]/{provider}-[kind].ts` names one file per provider per kind. Such a segment is dynamic rather than resolved, because it still matches many — the tier is decided by how many files a segment can name, not by whether a back-reference appears in it. It therefore competes with dynamic siblings and is checked against them for ambiguity.

Back-references state naming relationships directly in the tree.
`[provider]/[implementation].ts` captures the filename stem independently of
the provider name; `[provider]/{provider}.ts` requires the names to agree.
The relationship is part of structural matching rather than a separate lint
check, and `create` can derive the required filename from the directory.

### Literal names

Some repositories name real paths with brackets. A Next.js app router has a
directory called `[slug]` and a pages router has a file called `[id].tsx`,
and the brackets are the name. A rule module cannot escape them, because its
path is the pattern, so the module says instead that its name is literal:

```js
// espalier/app/[slug]/ESPALIER.mjs
export const literalName = true;
export const instanceOf = "../[route]";
```

```js
// espalier/pages/[id].tsx.mjs
export const literalName = true;
```

`literalName` applies to the module's own segment only: the directory for a
directory module, the filename for a rule module. Every rule path through a
literal directory reads that segment literally, so a deeper literal directory
needs its own declaration. The segment becomes static. It matches exactly its
name, it beats a dynamic sibling for the paths it names, its files are
required by default, and it may declare `instanceOf`, which is how `[slug]`
above inherits everything a `[route]` must have. It captures nothing: an
inherited `[route]` rule still sees `route = "[slug]"`, but the literal rule's
own captures are empty, which is how a consumer tells a literal `[id].tsx`
from a placeholder of the same spelling.

The flag is rejected on a constraint, whose filename is a selector rather than
a path, and on a name that holds no bracket or brace, where there is nothing
to take literally. Masks, lists and extension unions cannot combine with it:
the whole name is text.

In `targets` and `context.files()`, which use glob syntax, a bracket is a
character class. Escape it to name a literal path: `"\\[slug\\]/**"`. The
same goes for `.espalierignore`, `skip` and every ignore file, which read
brackets as git does: `app/\[slug\]/`.

### Multiple extensions

A dynamic structural file leaf may list alternative fixed suffixes; a constraint
leaf may list alternative complete extensions:

```text
[file].{ts,d.ts,tsx}.mjs            owns files with exactly those complete extensions
[...path]/no-as-any.{ts,tsx}.mjs     applies to files with complete extensions .ts and .tsx
```

This is one rule with several explicit branches, not glob brace expansion.
Structural branches retain the same dot-free capture rule: `[file].{ts,tsx}`
does not own `foo.d.ts`, but `foo.[file].{ts,tsx}` owns `foo.bar.ts`.
Constraint branches compare the actual filename's complete extension, so
`.ts` does not include `.d.ts` or `.bar.ts`. Each owned file invokes its
structural rule once. Each selected file invokes a per-file constraint once,
even if more than one branch or target glob could admit it.

Per-file and aggregate constraint leaves may both list extensions. Each listed suffix may contain dots: `migration-order.{up.sql,down.sql}.mjs` selects both migration file kinds. Dynamic structural leaves may do the same. A literal structural leaf names one required file, however, so `main.{ts,tsx}.mjs` would leave requiredness ambiguous. It is rejected as `extension_list_on_structural_leaf`; write two literal rules or a dynamic rule, whichever reflects the intended structure.

Braces therefore mean two things, and never in the same place:

```text
braces after the stem of a dynamic structural file leaf  an extension union
braces after the rule name in a constraint leaf          an extension list
braces elsewhere                                         a back-reference
```

A constraint leaf is a rule name plus an optional selector rather than a segment
that matches a file, so a back-reference has nothing to refer to there. A
literal structural filename cannot list alternatives; a dynamic one can. A
single `{name}` in a structural path remains a back-reference, including in a
filename such as `[file].{provider}.ts`; a comma marks the extension union.

### Target selectors

The module export `targets` selects files when the constraint filename has no
extension selector:

```js
export const targets = ["*/queries.sql"];
```

The selector patterns are relative to the compiled prefix **before** the
recursive placeholder, taken from directory segments. They form a positive
union and intersect the directory pattern. A filename extension selects the
complete extension exactly; a target glob such as `**/*.ts` also matches
`foo.d.ts`. Generated guidance distinguishes these forms. Neither form can
claim an unowned path, override an ignore, or declare that a file must exist.
Captures still come from the constraint path. Scoped `lint` and `explain` do
not move the selector origin.

```text
[...path]/registry.mjs                      origin is the repository root
backend/[...path]/registry.mjs             origin is backend/
src/[area]/[...path]/registry.mjs           origin is src/*/
backend/[...path]/handlers/registry.mjs    origin is backend/
```

Trailing directory segments stay in candidate matching, not in the origin.
The directory pattern of `backend/[...path]/handlers/registry.mjs` admits only
candidates matching `backend/**/handlers/*`; a selector `*/foo.ts` becomes
`backend/*/foo.ts` and is then intersected with those candidates.

For `fixtures/[...fixture]/query-count.mjs`, `targets = ["*/queries.sql"]`
selects `fixtures/alpha/queries.sql` while rejecting
`fixtures/alpha/schema.sql`. The directory pattern still determines which
paths can match; `targets` does not extend its reach.

To select all file types in scope, use an extensionless filename and
`targets = ["**/*"]`. Ignored, ungoverned, and structurally unowned files
never join the selection.

### Glob syntax

`targets` and `context.files()` use [minimatch](https://github.com/isaacs/minimatch)
to match paths already known to Espalier. They do not perform another filesystem
walk. `targets` uses the origin described above; `files()` patterns are relative
to the repository root and query governed files, including those without a
structural owner.

Supported syntax includes `*` within a segment, `?` for one character,
character classes such as `[a-z]`, brace alternatives such as `*.{ts,tsx}`,
brace ranges such as `file{1..3}.ts`, and extglobs such as `@(main|index).ts`.
`**` crosses directory boundaries when it occupies a whole segment;
`**/` also matches zero directories. Embedded stars, as in `a**b`, stay
within one segment.

Matching is case-sensitive, includes dotfiles in the eligible set, and uses
`/` separators on every platform. A pattern matches the whole path, not just
its basename: `*.ts` does not match `src/main.ts`. Leading `#` is literal,
not a comment. Whole-pattern negation is disabled; `targets` additionally
rejects leading `!` as part of its positive-selector contract.

Backslashes escape glob punctuation. In a JavaScript string, write
`"src/literal\\?.ts"` to match the literal path `src/literal?.ts`.
`targets = ["**/*.{ts,tsx}"]` is equivalent to
`targets = ["**/*.ts", "**/*.tsx"]`. Both also select compound names ending
in those suffixes, such as `foo.d.ts`; structural extension unions keep their
separate filename-pattern semantics.

Espalier escapes literal text from structural directory segments when composing
constraint admission globs. A directory named `literal?` in a rule path stays
literal; only exported target patterns introduce glob syntax there.

External ignore files and `.espalierignore` retain gitignore syntax.

## Ownership

Every governed file must be owned by **exactly one** structural rule. An unowned
file is a violation, not a second kind of valid ownership.

Structural rules compile into a trie, one node per path segment. Matching walks the trie segment by segment, and at each level a more specific node wins:

```text
static  >  resolved  >  dynamic
```

A **static** segment is a literal. A **resolved** segment contains a back-reference and becomes a literal once the captures above it are bound. A **dynamic** segment contains a `[name]` and matches many.

The order is specificity, not a table to memorise: a segment that names one file beats one that names many, and a segment that always names the same file beats one that names a different file per instance.

Within dynamic siblings, a pattern that matches a strict subset of another
pattern's names wins. Every name matched by the narrower pattern also matches
the broader one, and the broader pattern admits additional names.
`[name]-checksonly/` therefore owns
`011_flight_arrivals-checksonly/` beside `[world]/`; `[world]/` owns the
remaining directories. This applies to file leaves too: `test-[name].ts`
owns `test-a.ts` beside `[file].ts`. The comparison uses the names the
patterns can match, not their lengths, capture names, or declaration order.
The winning directory alone declares its contents; a failed match inside it
does not fall back to a broader sibling. A branch declaring `instanceOf`
instead inherits that contract explicitly; its local declarations may only
specialize the inherited structure.

Given:

```text
clients
└─ [provider]
   ├─ requestModels.ts.mjs
   └─ [implementation].ts.mjs
```

`clients/stripe/requestModels.ts` is owned by the static rule, not by `[implementation].ts`, even though both patterns match it. This is how a broad family gets a named exception without two rules running on the same file.

The winning structural rule's `lint` runs, together with every contract it
explicitly inherits. Unrelated matching siblings do not run. See
[Named instances](#named-instances).

Constraints work differently. They do not participate in ownership and they do not compete. **Every** constraint whose directory pattern and selector admit a file runs against it, in addition to that file's structural owner.

A constraint only runs on a file that **has** a structural owner. The espalier's reach is the tree it declares: a file no structural rule claims is reported once as `unexpected_path` and otherwise left alone. Nothing has said that file belongs to this project, so nothing gets to say how it should be written.

In a conforming repository this distinction is invisible — every file has an owner, so every matching constraint applies. It matters only while the repository is out of conformance, where it stops one undeclared file from producing an issue for every constraint whose selector happens to match it.

## Ambiguity is rejected

Structural ownership must be unambiguous before repository files can be
linted. The following configuration errors stop compilation and exit `2`.

**Overlapping dynamic siblings.** Two dynamic patterns competing for files or
directories conflict when they overlap and neither matches a strict subset of
the other's names. Equivalent patterns also conflict:

```text
[component].tsx
[helper].tsx          rejected — both are *.tsx
```

```text
[name].ts
test-[name].ts        accepted — the test pattern is a strict subset
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

A broad fallback can sit beside several disjoint specializations:

```text
prefix1-[name]/
prefix2-[name]/
[world]/              accepted — the prefixed patterns win their directories
```

It cannot resolve an overlap between incomparable patterns:

```text
prefix-[name]/
[name]-suffix/
[world]/              rejected — "prefix-suffix" matches both specializations
```

Nested strict subsets are allowed, and the narrowest matching pattern wins.
A mask narrows a capture the same way, so masked and unmasked siblings can
coexist:

```text
[seq=0(6)]_[name].sql
[seq=0+]_[name].sql
[stem].sql            accepted — each owns what the narrower ones do not
```

An extension union follows the same rule: `[file].ts` wins its files beside
`[file].{ts,tsx}`, which owns the remaining `.tsx` files.
Containment is established from the patterns, independently of repository
contents. Back-references share their bound values; common bound prefixes and
suffixes can be compared directly. If remaining back-references prevent
Espalier from proving strict containment or disjointness, the overlap is rejected.

Siblings only conflict within their own tier. Static names cannot collide with each other at all, and a static or resolved sibling beside a dynamic one is decided by specificity rather than by guessing — `requestModels.ts` beside `[implementation].ts`, or `{provider}.ts` beside `[implementation].ts`, are both fine. Two *resolved* siblings are also checked for ambiguity, because different back-references can resolve to the same text:

```text
[region]/[provider]/{region}.ts
[region]/[provider]/{provider}.ts     rejected — "eu/eu/eu.ts" satisfies both
```

Whether the two captures are ever equal is a fact about the repository, not about the espalier, so it cannot be settled at compile time. Undecidable is undecidable.

References to the same capture share one value. A shared prefix or suffix
therefore cannot make otherwise distinct names collide:

```text
clients/[client]/{client}.ts
clients/[client]/{client}.test.ts    accepted — the same name, different suffixes
```

For `clients/foo.bar/`, these require `foo.bar.ts` and `foo.bar.test.ts`.

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

Ordinary directories derive their requirements from their contents. A named
directory specialization declared with `instanceOf` is itself required unless
it exports `optional = true`; an absent required instance reports
`missing_required_directory`, even when all its children are optional.

**Static leaves are required unless their module says otherwise.** `main.ts.mjs` means `main.ts` must exist, and its absence is `missing_required_file`. A module exporting `optional = true` declares a file that *may* exist: it is owned, documented and linted whenever it is there, and nothing is reported when it is not. See [TYPES.MD](TYPES.MD#optional).

**Resolved leaves are required per instance.** `[provider]/{provider}.ts.mjs` means each provider directory must contain a file named after itself. It behaves as a static leaf does, one instance at a time: `clients/stripe/` without `stripe.ts` reports `missing_required_file`, and `optional` relaxes it the same way. A required named specialization can bind the placeholder and make the resolved
file required without waiting for an unnamed dynamic instance to appear.

**Dynamic leaves are collections.** `[util].ts.mjs` allows zero or more owned
files by default. `minMatches = N` requires at least N owned files in the
containing directory. `optional` is invalid on dynamic leaves. Each owned file
follows its rule; a matching file claimed by a more specific sibling follows
that sibling's rule instead and does not count toward the collection, unless
the sibling specializes this collection through `instanceOf`.

A required collection on the static spine must meet its minimum even if its
containing directory is absent. Beneath a dynamic directory, each instantiated
owning directory must satisfy it separately. Static subdirectories retain that
requirement, but uninstantiated dynamic subdirectories do not. An extension
list such as `[name].{ts,tsx}` is one collection: either extension can satisfy
it. Ignored, externally invisible, and child-espalier files do not count.
Linked worktrees remain outside the parent's authority.

A collection with fewer owned files than its `minMatches` reports
`missing_required_match` against its containing directory (`.` at the repository root), with the declaration,
rule module and bound directory captures in metadata. The author chooses a
concrete filename; Espalier cannot derive one from a placeholder.

**Dynamic directories are collections.** `clients/[provider]/` may have zero instances.

**Instantiating a dynamic directory makes its static and resolved descendants required.** Given:

```text
clients
└─ [provider]
   ├─ client.ts.mjs
   └─ requestModels.ts.mjs
```

An empty `clients/` is valid. Once `clients/stripe/client.ts` exists, `clients/stripe/requestModels.ts` is required and its absence is reported. A sibling `clients/stripe/notes.md` is `unexpected_path` unless another structural rule owns it or it is ignored.

Any governed file under the instance instantiates it, whether or not a structural rule owns that file. `clients/stripe/notes.md` alone is enough: something is there, so the directory exists, and a `clients/stripe/` that exists without a client is exactly the drift this reports. Ungoverned files do not count.

**An independent directory a more specific sibling describes is not an instance.** Requiredness uses the same specificity as ownership: static, then resolved, then the narrowest matching dynamic pattern. Thus `clients/` beside `[area]/` is `clients/`, and nothing under it is asked to satisfy `[area]/`. A directory declaring `instanceOf` retains its inherited requirements. Likewise `[name]-checksonly/` beside `[world]/` requires only the checksonly branch's descendants in matching directories. Otherwise a broad pattern would demand files inside a directory a different rule describes. The two questions — who owns this file, and what must exist — are answered from one tree and must be answered the same way.

**Optional descendants stay optional per instance.** `clients/[provider]/webhook.ts.mjs` marked optional means any provider may have a webhook and none has to. The shared files remain required for every instance; the optional file has
an explicit rule whenever it is present.

**Ordinary directories derive requiredness from their contents.** Named directory
instances are required themselves, even when their inherited contents are optional.
An instance with `optional = true` may be absent; its required contents apply
when it exists.

**Constraints require nothing.** They describe how matching files are written. They never make a file mandatory.

Use a static leaf when a particular file is mandatory, and a dynamic leaf with
`minMatches = 1` when a collection must be nonempty.

## Files espalier does not see

Five kinds of path are invisible unconditionally, because espalier reporting on its own machinery is a bug rather than a finding: `espalier.config.yaml`, discovered `.espalierignore` files, external ignore files Espalier reads, the espalier source root, and files `espalier build` generated.

Nested linked worktrees are excluded automatically. Git metadata follows
explicit ignore policy, with `.git` in the shipped defaults — see
[CONFIG.MD](CONFIG.MD#what-is-ignored-without-being-configured).

External ignore files first define which paths exist to Espalier. Everything remaining is governed unless `.espalierignore` assigns it a documented purpose outside the project layout — see [CONFIG.MD](CONFIG.MD#espalierignore).

Symlinks are not another unconditional exclusion. A link is followed, and what it points at is governed under the path the link occupies — see [CONFIG.MD](CONFIG.MD#symlinks).

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

These issue codes come from matching rather than from a rule module. Their `rule` field is null, because no module produced them, and their severity is fixed at `error`.

`unexpected_path` — the file is not owned by any structural rule.

`missing_required_file` — a required static or resolved leaf has no corresponding
file. A leaf marked `optional = true` never reports it.

`missing_required_match` — a dynamic leaf with a positive `minMatches` owns too few
files in an owning directory.

`undeclared_instance` — an abstract contract admits this file or directory and
no instance declares it. The path is still owned. See [INSTANCES.MD](INSTANCES.MD).

Everything that makes the espalier itself invalid — ambiguous siblings, inconsistent capture names, more than one recursive placeholder in a path, a duplicate placeholder name, a contradiction between an exclusion and a required leaf — is an operational failure, not an issue. It exits `2` and no files are linted. Every code is listed in [ERRORS.MD](ERRORS.MD).

## Worked example

```text
espalier
├─ ESPALIER.mjs
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

## Named instances

A static directory may export `instanceOf = "../[group]"` from its
`ESPALIER.mjs`. The reference names one matching sibling dynamic directory.
A static file may export `instanceOf = "[module].ts.mjs"`, naming a matching
sibling dynamic leaf in the effective inherited directory. References are
contract names, not JavaScript imports. A directory inherits its base's entire
structure. Local declarations may specialize admitted children but cannot add
paths absent from the base. Same-name inherited static children are refined
implicitly; naming a dynamic member requires an explicit `instanceOf`.

Inherited checks always execute, followed by local checks. Each check retains
its source module, pattern, and captures. Named members still count toward
inherited collections. Ordinary static nodes without `instanceOf` retain
independent ownership outside an inherited subtree. A named specialization
must use the contract that would own its path if the specialization were
removed; it cannot select a broader fallback to bypass a narrower rule.

A named file is required by default. `optional = true` permits absence unless
the inherited named file is required. A named directory is required by default;
`optional = true` permits the entire instance to be absent, but an existing
instance must satisfy all inherited requirements. Dynamic ancestors are not
invented: requirements beneath them apply per existing instance. A dynamic
file collection uses `minMatches`, a nonnegative safe integer defaulting to
zero; `optional` is not valid on a dynamic leaf. Collection minimums are
independent of whether any particular named member is optional.

Removing a specialization from a passing project's declarations must leave
the same source valid under the base contract. Specialization can add
requirements, never remove inherited requirements. Constraints retain their
ordinary scope and complete aggregate membership.

Directory guidance lives in `ESPALIER.mjs`, which exports optional
`description` and `guidance` (strings or sync/async functions), plus `fold`
(boolean). Each function receives `{ config, pattern, path, captures }`:
`pattern` is the authored directory path, `path` is its concrete path when
fully bound (otherwise null), and `captures` contains known bindings. The
context is an isolated copy for each callback. Both exports must return strings
and should be deterministic for the same inputs. Structural metadata is resolved
before those callbacks run during compilation; computed prose cannot change it.
Legacy `ESPALIER.MD` is accepted
for migration; declaring both formats in one directory is an error.

In generated guidance an instance reads under its contract: the contract's
guidance is stated once in the document that lists the instances, and each
instance adds its own. An instance directory's document opens by naming its
contract and restating that contract's guidance. Folding continues to control
placement. `explain` exposes the full inherited rule chain.

### Abstract contracts

A dynamic rule, or a dynamic directory's `ESPALIER.mjs`, may export
`abstract = true`. Matching is unchanged: the pattern still admits the same
names, with the same precedence, and a declared instance still wins as a
static sibling. What changes is the verdict on a match that no instance
declares. It is reported as `undeclared_instance` rather than accepted, and
`create` refuses to make it. [INSTANCES.MD](INSTANCES.MD) is the how-to.
