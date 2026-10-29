# Compiler addon example

Copy with `espalier examples compiler-addon --copy ./scratch/compiler`.
In the copy, run `npm install`, `npm test`, `npx espalier lint`, and
`npx espalier build --check`. Node 24 or later is required. The example uses
TypeScript 5.9.3 and Espalier 0.10.0; TypeScript is an example dependency, not
part of Espalier's runtime dependencies.

`repository.ignore` defines filesystem visibility. It uses a named file because
npm omits `.gitignore` from published packages. Copy it to `.gitignore` when
putting this example under Git; Espalier reads the file named in its config.

The structural rule owns `src/features/[feature]/model.ts`; the per-file
constraint checks compiler diagnostics. Both request facts from one addon.
The addon prepares the governed source snapshot and compiler settings once.
Each worker owns its compiler service and reuses analysis for identical inputs.
The TypeScript program is a live object with methods, so it is built locally
rather than cloned. Policies and findings stay in the rule files.

Preparation reads `compiler.json` and governed source files through its
context. Each worker receives that snapshot, constructs a program lazily,
and releases it at disposal. Isolated rule tests supply a virtual tree and
gather the same inputs through the rule context.

`compiler.json` is deliberately governed. This small example accepts only
`compilerOptions`; it does not implement tsconfig inheritance, filesystem
include expansion, project references, JS/TSX, or package source compilation.
The host sees governed `.ts` snapshots plus installed `.d.ts` and package
metadata. It cannot quietly open application files absent from the snapshot.
An integration with more input kinds must supply them explicitly.

The compiler package is imported normally. Its standard library declarations,
dependency declarations, and package metadata are implementation support;
fresh worker services load these resources for each run. The copy must have its own
installed dependencies so those declarations correspond to its `node_modules`.

Worker-local state belongs in `setup`, rather than a module-global map. A
separate `check` starts fresh workers and services. Unit tests call `setup`, pass the returned
object to `runRule`, and dispose it in `finally`. Their virtual trees contain
only the sources needed to demonstrate a semantic behavior.

`tests/compiler.test.mjs` exercises rule bodies, identical-input reuse,
changed snapshots, independent services, and per-invocation reads.
`tests/repository.test.mjs` uses a few complete temporary repositories to prove
matching and creation. It rejects `counter.ts` where the static responsibility
name `model.ts` is required, then creates a new feature with both operations.

The repository freshness test changes a sibling source, compiler settings,
source membership, imported declarations, package metadata, and the analyzer
implementation between checks. The same scoped target must see each change.
These are correctness fixtures, not benchmarks.

`analysis/diagnostic.mjs` turns compiler facts into valid findings. Locations
in the supplied application snapshot retain their coordinates; dependency and
external locations fall back to the checked application file. Their origin is
kept in the message and metadata. A richer analyzer should choose the actual
application import or type annotation. Declaration coordinates never become
coordinates in a different primary file. Espalier also permits relative paths
in `node_modules`; this adapter deliberately favors where the author can fix
the application.

`tests/locations.test.mjs` links a declaration package into a temporary
repository and checks its exact logical declaration identity. An unrelated
package exporting an identically named interface does not acquire trust.
`declarationOfImport` follows the compiler's alias symbol to its declaration;
it is an illustrative fact API, not a general proof of safe types.

This host's `realpath` preserves logical paths under its bounded dependency
model, keeping declarations beneath the temporary repository's `node_modules`.
Canonical paths instead follow symlinks to their physical installation. A
workspace, project-reference graph, or compiler host that deliberately unifies
duplicate packages may need canonical identities. Define one identity policy,
test linked dependencies, and recognize trusted declarations by their resolved
origin and symbol rather than a basename or type name. Logical paths are this
example's choice, not a universal module-resolution fix.

The freshness test also changes a declaration behind a symlink and requires
the same scoped application check to see it in the next run.

## Applying the pattern

This example demonstrates resource ownership, governed snapshots, rules that
choose policy, creation templates, and independent tests. Choose your own
vocabulary, module size, and state boundaries. `model.ts` groups two related
operations; it does not require all applications to use a model layer. Static
responsibility names and dynamic collections express different architectural
choices. Keep reusable requirements in rules and `ESPALIER.mjs`, and describe
your demonstration product in application documentation.

## Measuring a real adopter

Measure your actual repository and custom rules. This small example proves
correctness, not a speedup from parallelism.

```bash
time espalier lint --jobs 1 --format jsonl > /tmp/espalier-serial.jsonl
time espalier lint --jobs 2 --format jsonl > /tmp/espalier-parallel.jsonl
```

Keep source, dependencies, scope, and output format identical. Alternate run
order and compare findings independently of order. Measure elapsed time and
peak memory: each worker retains its own compiler program. Count program
builds with `onBuild`, and time preparation, setup, queries and disposal
separately. Observations go to stderr, never into policy or findings. Record
the chosen default as `lint.jobs` in `espalier.config.yaml`; an explicit
`--jobs` overrides it for a particular invocation.

Use small `runRule` fixtures for semantic counterexamples and a few complete
repository checks for conformance. Choose a worker limit appropriate to the
project's compiler memory and CPU costs.
