# reference implementation not owned by its rule

`components/buttons/[button].tsx` exports
`referenceImplementation: "components/Modal.tsx"`. The file exists and is
governed, but not by this rule. `TYPES.MD` calls that a specification error:
exit `2`, before any linter runs.

Both halves of the check matter and this fixture exercises the second. A
missing file is an obvious mistake and would be caught the first time anyone
looked. A *real* file that the rule does not actually govern is the subtle
one — it renders into generated documentation as `Reference implementation:` under a rule
it does not conform to, and an agent following it writes the wrong thing in
the wrong place.

The path form is preferred precisely because it cannot drift:
the referenced file is linted by this very rule on every run. That guarantee
only holds if the rule really owns or covers it, which is what this check
enforces.

Pins: TYPES.MD "`referenceImplementation`".
