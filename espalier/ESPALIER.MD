---
description: an architecture compiler for agent-driven development
---

`espalier` turns a tree of rule modules into per-directory documentation agents
read, and into a linter that enforces the same rules deterministically.

The documents under `docs/` are the specification. Where the code and a
document disagree, the document is right — so most of the rules here check that
the two still point at each other, rather than checking style.
