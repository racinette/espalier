# Compiler addon example

Copy with `espalier examples compiler-addon --copy ./scratch/compiler`.
In the copy, run `npm install`, `npm test`, `npx espalier lint`, and
`npx espalier build --check`. Node 24 or later is required. The example uses
TypeScript 5.9.3 and Espalier 0.4.0; TypeScript is an example dependency, not
part of Espalier's runtime dependencies.

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
