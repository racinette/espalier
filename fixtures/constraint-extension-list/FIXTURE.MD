# matching: a constraint leaf listing two extensions

`no-as-any.{ts,tsx}.mjs` is shorthand for two patterns sharing one module, not
glob brace expansion. The espalier declares `.ts`, `.tsx` and `.js` files under
`src/`; the constraint runs on the first two and not on the third.

The `.js` file is the assertion. A list that expanded to "any extension", or one
that quietly matched the literal text `{ts,tsx}`, would both leave the two
TypeScript files looking right — only the file that must *not* be visited
separates them.

The constraint is instrumented rather than fault-finding: the question is which
files it was handed, and an `info` per invocation is the only way to see that
without inventing a violation for it to find.

The three structural leaves are three modules on purpose. A structural leaf may
not carry a list — `main.{ts,tsx}` would be declaring two files each required —
and `invalid-optional` aside, this is the fixture where the two halves of that
rule sit next to each other.

Pins: MATCHING.MD "Multiple extensions".
