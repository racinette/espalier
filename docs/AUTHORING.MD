# Authoring

How to write a rule module.

`espalier init` writes the compact contract agents load to `espalier/AGENTS.MD`,
so an agent editing the tree picks it up by directory convention. Nested
`AGENTS.MD` files are the project's: local notes for that family of rules, not
a second copy of the contract. The shipped source is `authoring/AGENTS.MD`.
[`espalier migrate`](cli/migrate/README.MD) writes the root copy when it is
absent or still the marked shipped text, and only when `skip` would actually
skip `AGENTS.MD`. A customized file — sentinel removed — is left alone.

The contract is the advice. This page is the route to it, and to the one
worked example the contract describes without embedding.

## Four questions

Before a module exists, answer four separate questions. They are independent,
and mixing them up is how "I parsed the whole project" becomes an aggregate by
accident.

1. **Scope** — which subtree the constraint path reaches.
2. **Population** — which governed files matching that scope are selected.
3. **Evaluation unit** — each selected file, or the selected population together.
4. **Analysis inputs** — other governed files consulted to decide the result.

`targets` is population. `aggregate` is evaluation unit. The complete contracts
are [TYPES.MD](TYPES.MD) and [MATCHING.MD](MATCHING.MD). How to test a `lint`
function without pretending the matcher ran is [API.MD](API.MD).

## Worked example

`fixtures/authoring-corpus/` is one connected example: a structural owner, a
per-file well-formedness constraint, and an aggregate over mix and averages.
The SQL-suite shape — share of mutations, mean depth, mean arity — on toy JSON,
so the evaluation unit is visible without a language toolchain.

The helper at `fixtures/authoring-corpus/helpers/case.mjs` parses a string it
was given. It does not remember repository contents. The tests in
`test/authoring.test.ts` sit next to each other: `runRule` and `runAggregate`
for logic, `check` for selection, and a cache regression that editing the
helper still invalidates a scoped run of its caller.

Open `fixtures/authoring-corpus/expected-build/fixtures/AGENTS.MD` for the
generated presentation of those rules. Generated files live at static
placement points; dynamic instances share one ancestor document.

The compact contract `init` vendors is `authoring/AGENTS.MD`. Keep that file
and `espalier/AGENTS.MD` the same bytes. Policy, helpers, and cache-safe reuse
are stated there rather than restated here.
