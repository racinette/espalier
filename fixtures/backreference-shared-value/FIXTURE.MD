# Shared back-reference values

Pins MATCHING.MD "Ambiguity is rejected": sibling references to the same
capture share one value. An entrypoint and its test cannot collide, including
when the directory name contains dots or itself ends in .test.

The exhaustive ownership map checks that each resolved leaf owns only its
own file. Compilation must accept both rules before lint or explain can run.
