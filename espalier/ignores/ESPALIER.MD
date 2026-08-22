---
description: the ignore lists espalier ships
---

Data, not code. `espalier init --lang go` copies `go.gitignore` into the user's
config and nothing at lint time ever opens these files again, so upgrading
`espalier` cannot change what an existing repository governs.

That is what decides the bar for adding an entry. A missing one costs a project
one line; a wrong one costs them a file they meant to govern, and they will not
go looking for it. So the question is **is this file ever a project's own
structural decision**, not is it common — which is why `README.MD`, `Makefile`
and `Dockerfile` are deliberately absent while every lockfile is here.

`_common` belongs to no language and is written by every `init`. The leading
underscore is what keeps it out of the `--lang` names.
