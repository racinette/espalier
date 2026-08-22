# explain: what excluded this path

Four ways for a path to be ungoverned, and `explain` naming each one.

| Path | `ignoredBy` |
|---|---|
| `vendor/lib.ts` | `.gitignore.fixture` — a pattern from a file `ignoreFiles` names |
| `package.json` | `ignore` — this project said so |
| `espalier.config.yaml` | `espalier` — invisible unconditionally |
| `espalier/main.ts.mjs` | `espalier` — the espalier root, likewise |

All four exit `1`. Ignored is not declared: the espalier says nothing about
the path, which is the same answer as for one it never described, reached by a
different route. `ignoredBy` is the route, for anyone who needs to tell them
apart — and someone always does, because "why is this file not being checked"
is a question you ask months later with no memory of the config.

The first two are the point of the fixture. Every exclusion a user can act on
names a file they can open: their own `ignore`, or the path of the
`ignoreFiles` entry whose pattern won. Naming a list that lived inside the tool
was the old answer, and it left the reader nowhere to go.

The two `espalier` cases are grouped under one value on purpose. A user cannot
un-ignore either, so distinguishing the config file from the espalier root
would be offering a difference that changes nothing they can act on. The VCS
directory is no longer among them: `.git/` is an `ignore` entry `init` writes,
so it answers `ignore` like anything else a config says.

The ignore file is called `.gitignore.fixture` rather than `.gitignore`, because
git would honour the real name and hide `vendor/` from the repository. What is
under test is `ignoreFiles` reading a file the config names, and the name is a
free choice — see this directory's README.

`main.ts` is here as the control: same repository, same run, exit `0`.

CONFIG.MD promises `explain` reports when a path is ignored and by what.
This is that promise, executable.

Pins: CONFIG.MD "`ignoreFiles`", "What is ignored without being configured";
cli/explain/README.MD "Output", "Exit codes".

`human/ignore-file.txt` and `human/ignore.txt` pin the two sentences a reader
actually sees. The difference between them is the whole answer, so a format
that drifted between them would be worse than no answer at all.
