<!-- shipped by espalier; delete this line to keep your own copy -->

# Authoring rules

You are editing this espalier: the tree of rule modules that describes the
repository. Generated `AGENTS.MD` files in the project are for writing the
code. This file is for writing the rules. Nested copies beside a family of
modules are local notes for those rules — not a second copy of this contract.
`.claude/` and `.codex/` are already skipped as dotfiles.

`espalier help types` is the module contract. `espalier help matching` is how
a path claims a file. `espalier help api` is how to test a `lint` function.
`espalier help` lists every page for this CLI version.

## Four questions

Before a module exists, answer four separate questions:

1. **Scope** — which subtree the constraint path reaches.
2. **Population** — which governed files matching that scope are selected.
3. **Evaluation unit** — each selected file, or the selected population together.
4. **Analysis inputs** — other governed files consulted to decide the result.

`targets` controls population. `aggregate` controls evaluation unit. Reading
the whole project to decide one file's fate does not make that obligation
aggregate.

The `rule` names the obligation:

- Structural: `A fixture case holds one exercise.`
- Per-file: `Each selected case is well-formed JSON with a name, a kind, and a body.`
- Aggregate: `The SQL query fixture set contains at least 25% of modifying queries on average.`

A filename being PascalCase is per-file even if one index is reused: one file
can satisfy it. The SQL average is aggregate: no single file can satisfy it.

If those sentences are not enough, `espalier examples` prints the path to a
worked tree on this machine.

## Prose

`rule` is mode-invariant. The same text is generated guidance, `explain`, and
the issue an agent gets back. Write for someone about to write the governed
source, not for a reviewer of the check.

- Structural: name the artifact.
- Ordinary constraint: `Each selected …`
- Aggregate: name the population and the collective relationship.
- A located diagnostic may say `This call …`

Generated files sit at static placement points. A dynamic instance never gets
its own document; the family shares an ancestor. Write for the family, not for
one generated file.

## Policy stays in the owning module

The module chooses what is permitted, required, and reported. A helper returns
facts, or applies an assertion whose policy is an argument.

```js
export async function lint({ read, emit }) {
  const parsed = parseCase(await read());
  if (!parsed.ok) emit({ code: "malformed_case", message: parsed.error });
}
```

Do not dispatch on a role table from a thin module:

```js
export async function lint(context) {
  return dispatch(context);
}
```

Several owners then become unreadable, and `explain` cannot show why this path
has this obligation. Shared parsers and narrowly parameterized assertions are
fine; the architectural decision stays local.

Import a helper first. An addon is for an engine that is not an ordinary
module — native, WASM, a worker. Hand it contents; it must not open repository
paths. Assets the loader cannot see go in
`unobservedImplementationDependencies`.

## Lint data is not remembered

`lint` is a pure function of its context. Every invocation records the
governed files it used by calling `read` and `files`. A helper that parses a
string it was given is fine. A helper that remembers repository contents,
paths, or previous answers is not: a later invocation can skip those calls,
the cache stays warm, and the rule lies.

Process-local parser or addon infrastructure may reuse state when every answer
remains a function of tracked lint data and observed or declared implementation
dependencies. Correctness cannot depend on execution order, mutable
communication between rules, or unrecorded inputs. An aggregate consumes its
`matches`, not findings or mutable state produced by per-file rules.

Helpers live outside the espalier tree. They are implementation, not
architecture. Import them; do not `read` them as lint data.

## Tests

- `runRule` — this invocation's logic. Validates `targets`; does not apply
  repository selection.
- `runAggregate` — this population's logic, including empty. Same caveat.
- `check` — actual matching, `targets`, ownership, scoped runs. A scoped
  aggregate still receives the full selected population.

When a counterexample appears, change the rule. Espalier makes the failure
repeatable; it does not resolve inconsistent policy.
