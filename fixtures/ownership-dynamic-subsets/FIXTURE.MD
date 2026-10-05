# Dynamic specializations and fallbacks

Pins MATCHING.MD "Ownership", "Ambiguity is rejected", and "What must exist".
A simulation project separates checks-only worlds from ordinary worlds and
special checks. The winning directory alone declares its files and requirements;
a file that belongs only to the fallback is unexpected inside a specialization.
A missing checks file remains required there, without requiring world.json too.

Disjoint prefix specializations share a fallback. Nested subsets choose the
narrowest branch. File rules use the same precedence, including exact extension
unions. Provider-specific captures and back-references remain bound while
selecting specialized directories and files. Broad patterns sort both before
and after their specializations, so filesystem order cannot choose the owner.

Also pins cli/build/README.MD "Generation": the inline document lists narrower
patterns before their fallbacks in both the project map and guidance sections.
The unrelated `[notes].md` sorts alphabetically between `[code].{ts,tsx}` and
`[script].ts`; it must not prevent the latter from appearing before the former.
The document includes nested directory subsets and shared back-references too.
