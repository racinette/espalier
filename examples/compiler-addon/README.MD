# Compiler addon example

Copy with `espalier examples compiler-addon --copy ./scratch/compiler`.
In the copy, run `npm install`, `npm test`, `npx espalier lint`, and
`npx espalier build --check`. Node 24 or later is required. The example uses
TypeScript 5.9.3 and Espalier 0.4.0; TypeScript is an example dependency, not
part of Espalier's runtime dependencies.

`repository.ignore` defines filesystem visibility. It uses a named file because
npm omits `.gitignore` from published packages. Copy it to `.gitignore` when
putting this example under Git; Espalier reads the file named in its config.

The structural rule owns `src/features/[feature]/model.ts`; the per-file
constraint checks compiler diagnostics. Both request facts from one addon.
Each invocation independently lists sources and reads their contents and
`compiler.json` through its context, even when the addon reuses analysis.
The service retains one identical snapshot, constructs a program lazily,
and releases it at disposal. Policies and findings stay in the rule files.

`compiler.json` is deliberately governed. This small example accepts only
`compilerOptions`; it does not implement tsconfig inheritance, filesystem
include expansion, project references, JS/TSX, or package source compilation.
The host sees governed `.ts` snapshots plus installed `.d.ts` and package
metadata. It cannot quietly open application files absent from the snapshot.
An integration with more input kinds must supply them explicitly.

The compiler package is imported normally. Its standard library declarations,
dependency declarations, and package metadata are implementation support;
the addon declares these native compiler reads for optional findings caching.
Ordinary rule imports are observed automatically. The copy must have its own
installed dependencies so those declarations correspond to its `node_modules`.

Run-owned state belongs in `setup`, rather than a module-global map. A separate
`check` gets a separate service. Unit tests call `setup`, pass the returned
object to `runRule`, and dispose it in `finally`. Their virtual trees contain
only the sources needed to demonstrate a semantic behavior.

`tests/compiler.test.mjs` exercises rule bodies, identical-input reuse,
changed snapshots, independent services, and per-invocation reads.
`tests/repository.test.mjs` uses a few complete temporary repositories to prove
matching and creation. It rejects `counter.ts` where the static responsibility
name `model.ts` is required, then creates a new feature with both operations.

The repository cache test opts in with `cache: true`. It changes a sibling
source, compiler settings, source membership, an imported declaration, package
metadata, and the imported analyzer implementation between checks. The same
scoped target must see each change. These are correctness fixtures, not
benchmarks; an all-source snapshot means broad invalidation after edits.

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

Linked support also needs explicit cache patterns. Node's recursive glob skips
symlinked directories, so a broad `node_modules/**/*.d.ts` does not record their
declarations. The addon names TypeScript and the cache test's `example-types`
package explicitly; replace or extend that list for your actual linked support
packages, including package metadata. The cache test changes a declaration
behind a symlink and requires the same scoped application check to see it.

## Applying the pattern

This example demonstrates resource ownership, tracked snapshots, rules that
choose policy, creation templates, and independent tests. Choose your own
vocabulary, module size, and state boundaries. `model.ts` groups two related
operations; it does not require all applications to use a model layer. Static
responsibility names and dynamic collections express different architectural
choices. Keep reusable requirements in rules and `ESPALIER.MD`, and describe
your demonstration product in application documentation.

## Measuring a real adopter

Use your actual repository and custom rules, after introducing compiler reuse.
The tiny sources here establish correctness and cannot tell you whether
findings caching pays for itself. No large synthetic project is needed.

In a disposable checkout with dependencies installed and no findings cache,
record an uncached run, first cache use, and unchanged warm use:

```bash
time espalier lint --format jsonl > /tmp/espalier-fresh.jsonl
time espalier lint --cache --format jsonl > /tmp/espalier-cache-first.jsonl
time espalier lint --cache --format jsonl > /tmp/espalier-cache-warm.jsonl
```

Use the same source tree, dependency versions, scope, and output format.
Repeat the measurements in separate processes and alternate their order to
reduce filesystem warmup effects. Compare the findings independent of order.
Then make a typical application edit and measure both modes again. Record
unchanged and edited results separately: a whole-project snapshot may replay
well unchanged but invalidate every semantic invocation after an edit.

Instrument your service separately: count builds with the `onBuild` observer,
and time program construction and compiler queries at their call sites.
One program shared by many rules should produce one construction per identical
snapshot within the check. Timings and counters go to stderr and never become
policy inputs or findings. Also measure setup and disposal, because those run
even when findings are replayed. Each fresh CLI process includes its own startup
and compiler-package loading cost.

Use small `runRule` fixtures for semantic counterexamples and only a few full
repository checks for conformance. Count compiler work in typechecking, lint,
tests, and production builds before repeating them all in a verification script.
Enable findings caching when the measured workload benefits; compiler reuse
remains useful independently of that choice.
