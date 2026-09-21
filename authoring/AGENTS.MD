<!-- shipped by espalier; delete this line to keep your own copy -->

# Authoring rules

You are editing this espalier: the tree of rule modules that describes the
repository. Generated `AGENTS.MD` files in the project are for writing the
code. This file is for writing the rules. Nested copies beside a family of
modules are local notes for those rules — not a second copy of this contract.
`.claude/` and `.codex/` are already skipped as dotfiles.

TYPES.MD is the module contract. MATCHING.MD is how a path claims a file.
API.MD is how to test a `lint` function.

## Four questions

Before a module exists, answer four separate questions:

1. **Scope** — which subtree the constraint path reaches.
2. **Population** — which governed files matching that scope are selected.
3. **Evaluation unit** — each selected file, or the selected population together.
4. **Analysis inputs** — other governed files consulted to decide the result.

`targets` controls population. `aggregate` controls evaluation unit. Reading
the whole project to decide one file's fate does not make that obligation
aggregate.

A filename being PascalCase is per-file even if one index is reused. A corpus
being mixed enough on average is aggregate: no single file can satisfy it.

A small JSON fixture corpus is the shape: each case is locally well-formed
(per-file); the set meets mix and averages (aggregate). That is the SQL-suite
case — share of mutations, mean depth, mean arity — without a SQL stack.

## Prose

`rule` is mode-invariant. The same text is generated guidance, `explain`, and
the issue an agent gets back. Write for someone about to write the governed
source, not for a reviewer of the check.

- Structural: name the artifact. "A fixture case holds one exercise."
- Ordinary constraint: "Each selected …"
- Aggregate: name the population and the collective relationship.
- A located diagnostic may say "This call …"

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
