# invalid: overlapping dynamic siblings

`[name].ts` and `test-[name].ts` in one directory both match "test-a.ts".
Ownership would be undecidable, so the espalier fails to compile.

No repository file is read. Ambiguity is never resolved by declaration
order or alphabetically.

Pins: MATCHING.MD "Ambiguity is rejected".
