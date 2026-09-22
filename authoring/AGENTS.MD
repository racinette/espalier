<!-- shipped by espalier; delete this line to keep your own copy -->

# Authoring rules

This directory is the espalier: the architecture of the repository, written
down as files. Espalier reads it, writes `AGENTS.MD` guidance beside the
project code, and checks the working tree against the same rules. The
generated files are for whoever writes the code. This file is for whoever
writes the rules.

You change the architecture by adding or editing rules here. A nested
`AGENTS.MD` beside a group of rules is a local note for those rules, not
another copy of this page. `.claude/` and `.codex/` are skipped because they
are dotfiles; they are not part of the map.

## Three kinds of rule

A structural rule is about one file: where it lives, and what it contains.

- `src/main.ts` exports `async function main()`, and the last line of the
  file is `main()`.
- `components/buttons/SubmitButton.tsx` default-exports a function named
  `SubmitButton` and provides a named export for the interface
  `SubmitButtonProps`.
- `clients/stripe/client.ts` exports `createStripeClient()`.
- `models/User.ts` exports an interface named `User`.

A per-file constraint is a catch-all. It does not name one path. It reaches
every file of a kind, and each of those files passes or fails on its own:

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

A constraint can optionally use `targets`, a list of globs, to narrow the
files its path matches.

Use `espalier examples` to locate example projects on this machine.

## How each kind is written

The espalier tree mirrors the repository’s directories: rules in
`espalier/src/clients/` apply under `src/clients/`. Each rule is written in
one `.mjs` file, called a rule file.

**`ESPALIER.MD` describes the directory.** Its `description` field in the
frontmatter supplies the directory’s description in the generated project
map. Its body supplies guidance for working in that directory. It does not
declare which files may exist or provide a lint check. Leave it out when
the directory needs no description or guidance.

**A structural rule file names the repository file it governs, with `.mjs`
appended.** The name can be literal, such as `main.ts.mjs`, or contain a
placeholder, such as `[button].tsx.mjs`. Each governed repository file has
one structural rule as its owner.

```text
main.ts.mjs              owns main.ts
[button].tsx.mjs         .tsx files in this directory
```

`[button]` captures the varying text of that one filename. `SubmitButton.tsx`
matches, and the capture is `SubmitButton`. The `.tsx` stays fixed.

A literal filename wins over a placeholder in the same directory. Both rule
files below match `SubmitButton.tsx`, but `SubmitButton.tsx.mjs` owns it:

```text
SubmitButton.tsx.mjs     owns SubmitButton.tsx
[button].tsx.mjs         owns the other .tsx files in this directory
```

Two placeholder rules in the same directory must not match the same file.
`[button].tsx.mjs` and `[icon].tsx.mjs` conflict; `[button].tsx.mjs` and
`[helper].ts.mjs` are allowed. Distinct prefixes such as `a-[name].ts.mjs`
and `b-[name].ts.mjs` are also allowed because they cannot match the same
filename.

Directory placeholders must likewise not match the same directory. A
directory placeholder and a file placeholder may coexist, because they
match different kinds of path.

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

The filename gives the check’s name and the extension it applies to,
followed by `.mjs`:

```text
[...path]/no-as-any.ts.mjs     each TypeScript file under this directory
```

Braces in this filename list extensions. This rule file checks both `.ts`
and `.tsx` files:

```text
[...path]/no-as-any.{ts,tsx}.mjs
```

**An aggregate’s rule file also has `[...name]` in its path and exports
`aggregate = true`.** Its filename is the rule’s name followed by `.mjs`:

```text
[...path]/mutation-share.mjs
```

The filename does not select file extensions. To narrow which files the
aggregate checks, use `targets`.

Files such as `AGENTS.MD` can live beside the rules when the config’s
`skip` list excludes them from compilation. `espalier init` sets this up
for common agent instruction files. Dot-prefixed files and directories are
skipped automatically.

`espalier help matching` is the rest of this grammar.

## The rule file

Every rule file exports `rule`, the written requirements, and `lint`, the
function that checks them. A structural rule file also exports
`description`, a short phrase describing the governed file in the generated
project map.

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

A diagnostic can refer to a specific location with wording such as
“This call …”.

`lint` runs once per file for structural rules and per-file constraints, or
once over the selected files together for an aggregate. Its context provides
paths and functions to read file contents and report findings.

Directories matched by placeholders share generated guidance in an ancestor
directory. For example, guidance for `clients/[provider]/` appears above the
individual provider directories. Write that guidance so it applies to every
provider.

A structural rule file can also export a `template` for `espalier create`.
For a file that would otherwise be required, `optional = true` allows it to
be absent. A rule can name an existing example with
`referenceImplementation`. See `espalier help types` for the full export
reference.

## The decision stays in the rule file

Keep the decisions about what is permitted, required, and reported in the
rule file. Helpers can parse data, calculate facts, or perform checks using
conditions supplied by the rule file.

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

Import ordinary helpers directly. Use an addon for a shared resource that
needs setup and cleanup, such as a parser running in a worker or another
process. Its exposed functions must be pure: the same inputs must produce
the same results, regardless of previous calls or which rule calls them.
Internal state used to manage the resource must not affect those results.

Keep helpers shared by multiple rules outside the espalier tree and import
them into the rule files that use them. Helpers used by only one rule can
stay in that rule file.

## The check does not remember

During `lint`, read repository data through the context’s `read` and
`files` functions. `read()` loads the file being checked; `read(path)`
loads another governed file; `files` finds governed paths. Pass the
resulting data to helpers and addons instead of having them open repository
files through native filesystem APIs.

Espalier tracks these calls so changes to their results invalidate cached
findings. Native filesystem reads bypass that tracking and can leave an
outdated result in the cache. Do not retain repository contents, path lists,
or findings between invocations.

Each rule’s result must depend on its inputs, regardless of execution order
or previous calls. An aggregate checks its selected `matches`; it must not
depend on findings or mutable state left by other rules.

Imported implementation code is tracked separately. Declare support files
that Node’s module loader cannot observe, such as worker code or parser
grammars, in `unobservedImplementationDependencies` so changes to them also
invalidate cached results.

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
