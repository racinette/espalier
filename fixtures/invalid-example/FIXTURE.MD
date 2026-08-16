# example: a rule whose example does not match its own pattern

`components/buttons/[button].tsx` exports `example: "components/Modal.tsx"`.
The file exists. It is not under `components/buttons/`, so this rule's pattern
does not match it, and `TYPES.MD` calls that a specification error: exit `2`,
before any repository file is read.

Both halves of the check matter and this fixture exercises the second. A
missing file is an obvious mistake and would be caught the first time anyone
looked. A *real* file that the rule does not actually govern is the subtle
one — it renders into the generated documentation as `Example:` under a rule
it does not conform to, and an agent following it writes the wrong thing in
the wrong place.

The path form of `example` is preferred precisely because it cannot drift:
the referenced file is linted by this very rule on every run. That guarantee
only holds if the rule really matches it, which is what this check enforces.

Pins: TYPES.MD "`example`".
