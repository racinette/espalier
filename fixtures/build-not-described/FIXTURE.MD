# build: materialized exclusion policy and tool-owned entries

The output contains only exclusion declarations that participate for entries
encountered in this fixture. Exact rooted files and directories appear when
present. A glob appears once when at least one path matches it, without listing
those paths.

The absent `/missing.txt` and unmatched `*.bak` are omitted. The effective
`!generated/manifest.json` negation is omitted as well: the retained manifest is
accounted for by `Structure`, while `generated/**` remains because it finally
excludes `generated/out.ts`. Comments still describe an authored group once
after inactive declarations are filtered out. The configured ignore-file rule
appears because `logs/` exists, but its git-facing comment does not become
project-facing explanation.

Generated guidance and its configuration share the reader-facing table with
the materialized repository paths. The generated document points to its
`ESPALIER.MD` as the persistent source for guidance without suggesting edits to
ignore lists.

The golden is compared byte for byte, so filtering, grouping, ordering,
placement, table escaping, and the generated-source link are one assertion.

Pins: cli/build/README.MD "Other repository paths", CONFIG.MD "`.espalierignore`".
