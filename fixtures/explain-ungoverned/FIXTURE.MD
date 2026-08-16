# explain: which list excluded this path

Four ways for a path to be ungoverned, and `explain` naming each one.

| Path | `ignoredBy` |
|---|---|
| `package.json` | `defaultIgnore` — the built-in list |
| `vendor/lib.ts` | `ignore` — this project said so |
| `espalier.config.yaml` | `espalier` — invisible unconditionally |
| `espalier/main.ts.mjs` | `espalier` — the espalier root, likewise |

All four exit `1`. Ignored is not declared: the espalier says nothing about
the path, which is the same answer as for one it never described, reached by a
different route. `ignoredBy` is the route, for anyone who needs to tell them
apart — and someone always does, because "why is this file not being checked"
is a question you ask months later with no memory of the config.

The three `espalier` cases are grouped under one value on purpose. A user
cannot un-ignore any of them, so distinguishing the VCS directory from the
config file from the espalier root would be offering a difference that changes
nothing they can act on.

`main.ts` is here as the control: same repository, same run, exit `0`.

CONFIG.MD promises `explain` reports when a path is ignored and by which list.
This is that promise, executable.

Pins: CONFIG.MD "`defaultIgnore`", "What is ignored without being configured";
cli/explain/README.MD "Output", "Exit codes".

`human/default-ignore.txt` and `human/ignore.txt` pin the two sentences a
reader actually sees. They are one line apart in wording and the difference is
the whole answer, so a format that drifted between them would be worse than no
answer at all.
