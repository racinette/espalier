# Authoring

How to write a rule module.

`espalier init` writes the compact contract agents load to `espalier/AGENTS.MD`,
so an agent editing the tree picks it up by directory convention. Nested
`AGENTS.MD` files are the project's: local notes for that family of rules, not
a second copy of the contract. The shipped source is `authoring/AGENTS.MD`.
[`espalier migrate`](cli/migrate/README.MD) writes the root copy when it is
absent or still the marked shipped text, and only when `skip` would actually
skip `AGENTS.MD`. A customized file — sentinel removed — is left alone.

The contract is the advice. This page is the route to it.

It opens with what an espalier is, then the three kinds of rule: structural,
per-file, and aggregate. How each kind is written in the tree comes after
that. Four plain questions check that the sentence was filed under the right
kind.
The contract presents a filename extension and `targets` as alternative ways
to select files for either kind of constraint. A filename extension is exact;
`targets` uses glob matching. Selection does not pick whether the check runs
per file or over a group.

Read the reference for this CLI with `espalier help types`,
`espalier help matching`, and `espalier help api`. `espalier help` lists every
page. If the contract's example obligations are not enough,
`espalier examples --help` lists the example projects packed with this
version. `espalier examples <name>` locates one;
`espalier examples <name> --copy <directory>` copies it into a new directory.
The complete contracts are [TYPES.MD](TYPES.MD), [MATCHING.MD](MATCHING.MD),
and [API.MD](API.MD).

## Worked example

`espalier examples authoring-corpus` is one connected example: a structural
owner, a per-file well-formedness constraint, and an aggregate over mix and
averages. The SQL-suite shape — share of mutations, mean depth, mean arity —
on toy JSON, so the difference between one file and the set is visible without
a language toolchain.

The helper in that tree parses a string it was given. It does not remember
repository contents. Generated `AGENTS.MD` files in the tree are the
presentation of those rules.

The compact contract `init` vendors is `authoring/AGENTS.MD`. Keep that file
and `espalier/AGENTS.MD` the same bytes. Policy, helpers, and cache-safe reuse
are stated there rather than restated here.
