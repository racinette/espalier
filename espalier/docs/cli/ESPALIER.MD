---
description: one page per command
---

One directory per command, named for the command, and `src/<command>.ts`
implements it. The set is enumerated here rather than matched by a pattern:
adding a command is a decision about what the tool is, so it is made in the
espalier and not let through quietly by a placeholder that would have accepted
any name.

Both halves are checked, from both ends. A page says which module implements it
and reports `undocumented_command` when that module is not there; each command
module opens with a header naming its page, and reports
`header_names_missing_document` when the page is not there. A page for a command
nobody wrote and a command whose page was never written are the two ways this
tree can lie about what the tool does, and neither survives a `lint`.

Every page carries the same shape — the invocation as its heading, a `## Usage`
block listing every flag, then the reasoning. The flag list is the one part
duplicated from `src/cli.ts`, and it is duplicated on purpose: a reader looking
up a command should not have to read the parser.
