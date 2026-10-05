# invalid: overlapping dynamic siblings

`[name]-test.ts` and `test-[name].ts` in one directory both match
"test-a-test.ts", but neither pattern contains the other. Ownership would
be undecidable, so the espalier fails to compile.

No repository file is read. Ambiguity is never resolved by declaration
order or alphabetically.

Pins: MATCHING.MD "Ambiguity is rejected".
