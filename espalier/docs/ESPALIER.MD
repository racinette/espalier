---
description: the specification
---

These are not notes about the implementation. They are the specification, and
where the code and one of them disagree the document is right — so a behaviour
change is a change here first, and a document that is ambiguous or
self-contradictory is something to report rather than to interpret.

Each covers one subject and says why, not only what. A decision recorded
without its reasoning is one that gets reversed by the next person who finds it
inconvenient.

**Write the design, never the route to it.** A page here says what the tool is
and why it is that, in the present tense, with no trace of what it was before.
"This reverses an earlier position", "previous releases did X", "an earlier
draft said Y" — all of it goes. The reader has no idea what the earlier position
was, cannot see the draft, and gains nothing from being told a decision was hard
to reach; they are trying to use the thing. A history wearing the clothes of a
specification also decays badly, because the past keeps accumulating while the
statement stays the same size.

The reasoning is not the history. "One walk, in one language, is what a linter
can explain" is an argument and belongs here. "Earlier releases shelled out to
git" is a changelog and does not. When cutting a passage of the second kind,
keep the first kind that was buried in it.

`HANDOFF.MD` at the root is where the route belongs, and it keeps superseded
decisions struck through rather than deleted. It is read by whoever inherits
this project; these pages are read by whoever is using it.
