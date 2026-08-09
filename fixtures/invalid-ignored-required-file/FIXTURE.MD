# invalid: a required file is also ignored

`main.ts.mjs` is a static leaf, so main.ts is required. `ignore` makes it
invisible. The configuration asks for both and gets neither, so espalier
refuses to run rather than passing quietly.

Ignoring is not declaring.

Pins: CONFIG.MD "ignore".
