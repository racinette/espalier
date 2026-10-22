<!-- shipped by espalier; delete this line to keep your own copy -->

# Authoring rules

This directory is the espalier: the architecture of the repository, written
down as files. Espalier reads it, writes `AGENTS.MD` guidance beside the
project code, and checks the working tree against the same rules. The
generated files are for whoever writes the code. This file is for whoever
writes the rules.

You change the architecture by adding or editing rules here. A nested
`AGENTS.MD` beside a group of rules is a local note for those rules, not
another copy of this page. Exclude tooling directories such as `.claude/` and `.codex/` explicitly
with `skip` when they live beside the rules.

## Agree on the architecture

Read `build.guidanceMode` in this Espalier's configuration before changing
architectural policy. The default, `evolving`, invites identifying gaps and
proposing changes for agreement. In `fixed` mode, ordinary feature work uses
the existing architecture: report a missing path and role, and pause the
affected work until architecture work is explicitly authorized. Do not hide
the gap in a catch-all or change the mode to bypass that boundary. Each nested
Espalier uses its own setting.

Explicitly authorized architecture work can proceed in either mode using the
review process below. Follow the project's own protected-path and commit
requirements. Creating declared files and regenerating guidance with `create`
and `build` remain ordinary development operations.

Before changing architectural policy in rules, guidance, or configuration,
explain the gap, present reasonable options and their tradeoffs, and recommend
an approach. Get agreement before implementing it. A feature request does not
by itself settle the architectural design. Include changes to constraint
selectors, exclusions, and requiredness: explain which files become permitted,
required, checked, or excluded, and which existing guarantees would be removed.
A more specific node or a moved file can bypass checks without editing them.

Choose placement by documented purpose. A catch-all structural location can
hold general-purpose code that fits that purpose; passing lint alone does not
establish architectural fit. Raise a missing role before placing work there.
Prefer static nodes for known roles. Use dynamic patterns for instances with a
shared responsibility and contract, keeping fixed parts of their structure
explicit. Matching extensions or similar filenames alone do not establish a
shared role. Review inferred structure from `adopt` on the same basis.

Implement an agreed design without repeatedly requesting approval. Reopen the
discussion if implementation requires a materially different design. Ordinary
code changes that follow the agreed architecture can proceed. Preserve
existing guarantees unless changing them is part of that agreement; do not
weaken checks or exclude governed code merely to make the implementation pass.

## Three kinds of rule

A structural rule is about one file: where it lives, and what it contains.

- `src/main.ts` exports `async function main()`, and the last line of the
  file is `main()`.
- `components/buttons/SubmitButton.tsx` default-exports a function named
  `SubmitButton` and provides a named export for the interface
  `SubmitButtonProps`.
- `clients/stripe/client.ts` exports `createStripeClient()`.
- `models/User.ts` exports an interface named `User`.

A per-file constraint checks selected files independently. It does not declare
where files may live; each selected file passes or fails on its own:

- Every `.ts` file contains no `as any`.
- Every file outside `src/clients/` does not call `fetch`. A file under
  `src/clients/` may.
- Every markdown file's first line is a `#` heading.
- Every component filename is PascalCase. `SubmitButton.tsx` passes.
  `submitButton.tsx` does not.

An aggregate collects the matching files and checks them together. It can
check several conditions on that group.

- Across `fixtures/*/queries.sql`, at least 25% of statements are `INSERT`,
  `UPDATE`, or `DELETE`. The mean number of nested subqueries is at least
  1.5. The mean number of bound parameters is at least 1.5.
- Each `src/routes/*.ts` exports a `weight`. The weights sum to 100.
- Across `src/**/*.test.ts`, the mean number of `test(` calls per file is
  at least 3.
- Every function exported from `src/**/*.ts` is called from some
  `src/**/*.test.ts`.
- Every file in `locales/` lists the same keys. If one file contains
  `login.title`, every other file must contain it too.

Before the rule exists, four questions catch a sentence filed under the
wrong kind:

1. **Where** — which part of the repository.
2. **Which files** — which of the files there.
3. **One file or the group** — each file on its own, or the matching files
   together.
4. **What else is read** — other files the check consults.

A constraint selects files with either the extension in its filename or a
`targets` list of globs. This selection does not decide whether the check runs
per file or over the group.

Use `espalier examples` to locate example projects on this machine.
Use `espalier examples --help` to list their names, or
`espalier examples <name> --copy <directory>` to make a writable copy in a
new directory.

## How each kind is written

The espalier tree mirrors the repository’s directories: rules in
`espalier/src/clients/` apply under `src/clients/`. Each rule is written in
one `.mjs` file, called a rule file.

**`ESPALIER.mjs` describes the directory.** It exports a short `description`
and a `guidance` string or function. A function receives the config, authored
pattern, concrete path when known, and inherited captures. `fold = true` folds
the subtree's documents into its ancestor. Keep structural exports stable;
compute prose from explicit inputs. Leave the module out when it has nothing
to say and declares no named instance.

**A structural rule file names the repository file it governs, with `.mjs`
appended.** The name can be literal, such as `main.ts.mjs`, or contain a
placeholder, such as `[button].tsx.mjs`. Each governed repository file has
one structural rule as its owner.

```text
main.ts.mjs              owns main.ts
[button].tsx.mjs         .tsx files in this directory
[migration].up.sql.mjs   .up.sql files in this directory
[migration].down.sql.mjs .down.sql files in this directory
```

`[button]` captures the varying text of that one filename. `SubmitButton.tsx`
matches, and the capture is `SubmitButton`. The `.tsx` stays fixed.
In an extension-bearing structural filename, captures cannot include dots:
`[file].ts.mjs` does not own `foo.d.ts`. Literal dots and dots repeated by
a back-reference remain part of the authored filename pattern.
`foo.[file].ts.mjs` therefore owns `foo.bar.ts`, capturing `bar`.
That file's complete extension is `.bar.ts`: a `.ts` constraint does not
select it, while `targets = ["**/*.ts"]` does.

A dynamic structural rule can explicitly list fixed suffix alternatives,
including dotted ones:

```text
[file].{ts,d.ts,tsx}.mjs  owns files with exactly these complete extensions
```

A literal leaf such as `main.{ts,tsx}.mjs` cannot list alternatives: it would
not say which file is required. Write separate literal rules if both are
required.

A literal filename wins over a placeholder in the same directory. Both rule
files below match `SubmitButton.tsx`, but `SubmitButton.tsx.mjs` owns it:

```text
SubmitButton.tsx.mjs     owns SubmitButton.tsx
[button].tsx.mjs         owns the other .tsx files in this directory
```

When placeholder patterns overlap, the one matching a strict subset of the
other's names owns those paths; the broader pattern owns the rest. Every name
matched by the narrower pattern must also match the broader one, which admits
additional names.
`test-[name].ts.mjs` therefore wins over `[file].ts.mjs` for test files.
Equivalent patterns such as `[button].tsx.mjs` and `[icon].tsx.mjs` conflict.
Overlapping patterns also conflict when neither contains the other, such as
`test-[name].ts.mjs` and `[name]-test.ts.mjs`.

The same rule applies to directories: `[name]-checksonly/` wins its matches
beside `[world]/`. For independent declarations, only the winning branch
declares the directory's contents and required files; its unmatched contents do not fall back to `[world]/`.
Distinct prefixes such as `a-[name]/` and `b-[name]/` are disjoint and may
both sit beside a broad fallback. A directory placeholder and a file
placeholder may coexist, because they match different kinds of path.

`{provider}` repeats the text captured by `[provider]` earlier in the same
path:

```text
clients/[provider]/{provider}.ts.mjs
```

For `clients/stripe/`, `[provider]` captures `stripe`, so `{provider}.ts`
names `stripe.ts`. It does not match `client.ts`. Using `{provider}`
without an earlier `[provider]` is an error.

Once resolved, `{provider}.ts` names one file and wins over a placeholder
sibling such as `[name].ts`. A literal filename still takes precedence over
both.

**A per-file constraint does not own files.** It checks files already owned
by structural rules. Its path contains `[...name]`, which matches any depth
of directories, including none. A rule file’s path may contain at most one
`[...name]`.

An extension-bearing filename gives the check’s name and the files it applies
to, followed by `.mjs`:

```text
[...path]/no-as-any.ts.mjs     each file with complete extension .ts here
```

The first dot after the rule name starts the extension. All further dotted
parts belong to it: `migration-order.up.sql.mjs` selects `.up.sql` files. The
final `.mjs` only identifies the rule module. Selection is by complete
extension, so `.sql` does not include `.up.sql`.

Braces in this filename list extensions. This rule file checks both `.ts`
and `.tsx` files:

```text
[...path]/no-as-any.{ts,tsx}.mjs
```

**An aggregate’s rule file also has `[...name]` in its path and exports
`aggregate = true`.** It selects files by the same filename-extension rule:

```text
[...path]/mutation-share.sql.mjs
```

Either kind of constraint may instead leave the extension off and export
`targets`, a non-empty list of relative positive globs:

```js
export const targets = ["*/queries.sql"];
```

These use minimatch glob syntax: `**/*.ts` also matches `foo.d.ts`, unlike
a filename selector for `.ts`. Brace alternatives such as `**/*.{ts,tsx}`,
`?`, character classes, and extglobs are supported. `context.files()`
uses the same dialect. See `espalier help matching` for escaping and scope.

For that form, name the rule `mutation-share.mjs`. Do not use both a filename
extension and `targets`, or neither. To select all file types in the rule’s
directory scope, use `targets = ["**/*"]`. The directory pattern still limits
which paths either selector can reach. `aggregate = true` changes only whether
`lint` checks each selected file or the selected group together.

Files such as `AGENTS.MD` can live beside the rules when the config’s
`skip` list excludes them from compilation. `espalier init` sets this up
for common agent instruction files, `.git`, and `.gitkeep`. Dot-prefixed names
are ordinary paths. Exclude tooling directories explicitly with `skip`; an
excluded directory may contain modules and `ESPALIER.mjs` without compiling them.

`espalier help matching` is the rest of this grammar.

## The rule file

Every rule file exports `rule`, the written requirements, and `lint`, the
function that checks them. A structural rule file also exports
`description`, a short phrase describing what the governed file is.
A constraint may export `description` to briefly summarize its requirement.

A structural rule file has this shape; the check’s implementation is omitted
here.

```js
export const description = "a button component";

export const rule = `\`components/buttons/SubmitButton.tsx\` default-exports
a function named \`SubmitButton\` and provides a named export for the interface
\`SubmitButtonProps\`.`;

export async function lint({ read, emit }) {
  // Read the file and emit findings when it violates the requirements.
}
```

`rule` states the requirements in Markdown. Its text appears in generated
guidance, `explain`, and reported issues. Write it for someone about to
create or change the governed files.

- Structural: name the file and what it must contain.
- Per-file: name the kind of file and what each must or must not contain.
- Aggregate: name the group and the conditions it must satisfy.

Template literals are convenient for multiline rule prose and apostrophes.
Escape embedded backticks and literal `${...}` sequences as JavaScript requires.

A diagnostic can refer to a specific location with wording such as
“This call …”.

`lint` runs once per file for structural rules and per-file constraints, or
once over the selected files together for an aggregate. Its context provides
paths and functions to read file contents and report findings.

Guidance under a directory placeholder must apply to every directory the branch
owns. A directory claimed by a more specific sibling follows that sibling's
guidance instead, unless it explicitly specializes the shared contract through
`instanceOf`. A specialization retains the shared obligations and adds local
domain guidance.

A structural rule file can also export a `template` for `espalier create`.
For a file that would otherwise be required, `optional = true` allows it to
be absent. Dynamic leaves use `minMatches`, a nonnegative integer defaulting to zero;
`minMatches = 1` requires a nonempty collection per existing owning directory.
They reject `optional`. Named leaves use `optional = true` to permit absence.

Write templates as meaningful starting points for the node's shape. Rendered
source need not parse or pass lint; do not invent placeholder implementations
merely to satisfy checks before the author completes the work. Mark unfinished
parts in the rendered source with TODO comments or an explicit placeholder appropriate to
the file format, and say what the user needs to replace. Espalier writes the
rendered string verbatim; the template supplies those markers. Test templates
that depend on sibling files together, using the project's own checks.

## The decision stays in the rule file

Keep the decisions about what is permitted, required, and reported in the
rule file. Helpers can parse data, calculate facts, or perform checks using
conditions supplied by the rule file.

Keep each owner's prose in its rule file or `ESPALIER.mjs`, even when several
owners currently say the same thing. Each statement can evolve with its owner;
identical wording alone is no reason to factor it out or require the copies
to stay identical. Share checking code through helpers supplied with the
owner's policy values.

```js
export async function lint({ read, emit }) {
  const parsed = parseCase(await read());
  if (!parsed.ok) emit({ code: "malformed_case", message: parsed.error });
}
```

Do not hand the whole check to a dispatcher:

```js
export async function lint(context) {
  return dispatch(context);
}
```

A dispatcher that chooses the requirements elsewhere hides the policy from
someone reading the rule file. Keep those choices here so the written
requirements and the check can be reviewed together.

Import ordinary helpers and packages directly. Use an addon to own a shared
resource within each lint worker, such as a compiler service, parser, or
language server. Importing a compiler package and owning its instances are
separate choices. Build analysis from prepared data or lazily from contents
and settings supplied by rules; release retained state at disposal.
Its exposed functions must be pure: the same inputs must produce
the same results, regardless of previous calls or which rule calls them.
Internal state used to manage the resource must not affect those results.

Keep helpers shared by multiple rules outside the espalier tree and import
them into the rule files that use them. Helpers used by only one rule can
stay in that rule file.

## Reading and shared analysis

Read governed repository data through the context's `read` and `files`
functions. `read()` loads the file being checked; `read(path)` loads another
governed file; `files` lists governed paths. Pass the resulting contents to
helpers and addons instead of opening governed files through native APIs.

Each rule's result must depend on its inputs, regardless of execution order
or previous calls. An aggregate checks its selected `matches`; it must not
depend on findings or mutable state left by other rules. Shared parser or
addon infrastructure may memoize analysis for identical inputs when every
answer agrees with a fresh computation.

Every selected rule executes on every run. `--jobs` controls the worker pool;
rule results must not depend on worker assignment. An addon may `prepare`
cloneable data once from the full governed input snapshot, then `setup` local
services in each worker. All setups finish before linting starts. See
`espalier help config` for the preparation context and addon lifetime.

## Adapting examples

Copy the enforcement mechanisms: owning rules, colocated requirements and
templates, and analysis supplied with governed inputs. Choose vocabulary,
module size, and state ownership for your own language and application.
An example's file-per-function layout or global state is not an Espalier rule.

A cohesive module may export several related functions. Use a static
responsibility name such as `features/[feature]/model.ts` for that module;
use a dynamic collection such as `shared/[name].ts` where instances share a
defined responsibility and contract. The compiler-addon example shows both
and tests their matching and creation behavior.

Keep reusable architecture guidance in the rules and `ESPALIER.mjs`. Describe
the bundled demonstration application's domain and behavior in its own
documentation. A new adopter should inherit the architecture without inheriting
the demonstration's product requirements.

## Tests

- Use `runRule` to test a structural rule or per-file constraint with a
  supplied file context.
- Use `runAggregate` to test an aggregate with a supplied set of matches,
  including an empty set.
- Use `check` to test rules against a repository, including matching,
  ownership, and scoped runs. A scoped aggregate still receives its full
  selected set.

`runRule` and `runAggregate` validate `targets` but do not use it to select
files. Use `check` to test file selection.

See `espalier help api` for function signatures and examples. Test cases
should establish that the check accepts valid files and reports violations
of the written requirements. If a case exposes an inconsistency between the
requirements and the check, resolve it explicitly.

After changing rules, run `espalier build` and review the affected generated
documents. Check that a reader can identify which files each rule applies
to and understand every requirement without reading the check’s
implementation. Confirm that the generated guidance agrees with the rules,
then run `espalier build --check` to verify it is current.

`espalier help` lists every page of this CLI version's manual.

## Named instances of shared contracts

Use dynamic nodes for a repeated architectural role, and named instances to
explain concrete domain responsibilities without copying its checks. A static
directory exports `instanceOf = "../[group]"` from `ESPALIER.mjs`; a named file
exports `instanceOf = "[module].ts.mjs"` to specialize a matching dynamic leaf
in its inherited directory. These references name contracts, not JS imports.

Every inherited check still runs. Local rules add checks and domain guidance;
they cannot admit unsupported paths, remove required members, or suppress base
checks. Unmentioned children remain inherited. Named instances are required
by default; `optional = true` allows absence where the base permits it. An
inherited template supplies the creation recipe unless a local template is
provided. Shared prose stays at the contract; local prose explains the domain.

Removing a specialization must leave passing source valid under its base.
Matching a broad filename pattern alone does not establish the right role:
read the shared guidance before declaring a named instance.
