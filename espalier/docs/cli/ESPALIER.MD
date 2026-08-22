---
description: one page per command
---

The directory name is the command, and `src/<command>.ts` implements it. Both
halves are checked: a page for a command nobody wrote and a command whose page
was never written are the two ways this tree can lie about what the tool does.

Every page carries the same shape — the invocation as its heading, a `## Usage`
block listing every flag, then the reasoning. The flag list is the one part
duplicated from `src/cli.ts`, and it is duplicated on purpose: a reader looking
up a command should not have to read the parser.
