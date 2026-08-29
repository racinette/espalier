# build: exclusion policy and tool-owned entries

The output is derived from declarations, not from whichever ignored files
happen to exist during one build. Every ignore rule appears in evaluation order
even when it matches nothing, and the comment block introducing a group appears
once beside the whole group.

This fixture pins a group with two rules, an unmatched negation, an exact rooted
file, an exact rooted directory, and an unexplained group. The `ignoreFiles`
rule appears too, but not the comment written for git: only `.espalierignore`
supplies project-facing reasons.

Tool-owned entries are separate. The generated document points to its
`ESPALIER.MD` as the persistent source for guidance and says to modify it, while
configuration is named without suggesting that an agent should edit the ignore
lists. Other build fixtures have placement points without that file and pin the
corresponding instruction to create it. None of these rows depends on whether
`logs/debug.log`, `generated/out.ts`, or any other match exists during the run.

The golden is compared byte for byte, so grouping, ordering, table escaping,
negation, unmatched rules, and the generated-source link are one assertion.

Pins: cli/build/README.MD "Not described here", CONFIG.MD "`.espalierignore`".
