# Structural dots and constraint selection

Pins MATCHING.MD "Placeholders", "Back-references", and "Multiple extensions".

A literal dotted prefix, a dotted back-reference, and a structural suffix union
all own foo.bar.ts without treating it as a file with complete extension .ts.
The .bar.ts constraint selects those files; the .ts constraint selects only
plain.ts. A **/*.ts target selects all four.

Instrumented per-file and aggregate constraints expose their selections.
Ownership and explain assertions also pin the captures, so accepting the files
through some other structural rule cannot hide a regression.
