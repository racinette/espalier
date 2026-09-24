# matching: a constraint leaf listing two extensions

`no-as-any.{ts,tsx}.mjs` lists two complete extensions for one constraint,
not glob brace expansion. The espalier declares `.ts`, `.tsx` and `.js` files
under `src/`; the constraint runs on the first two and not on the third.

The `.js` file is the assertion. A list that expanded to "any extension", or one
that quietly matched the literal text `{ts,tsx}`, would both leave the two
TypeScript files looking right — only the file that must *not* be visited
separates them.

The constraint is instrumented rather than fault-finding: the question is which
files it was handed, and an `info` per invocation is the only way to see that
without inventing a violation for it to find.

The three structural leaves are separate because this fixture tests the
constraint list independently. A dynamic structural leaf could instead use
`[name].{ts,tsx}`. A literal leaf such as `main.{ts,tsx}` remains invalid:
it would not say which alternative is required.

Pins: MATCHING.MD "Multiple extensions".
