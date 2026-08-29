# build: materialized exclusion policy and tool-owned entries

The output contains only exclusion declarations that participate for entries
encountered in this fixture. Exact rooted files and directories appear when
present. A glob appears once when at least one path matches it, without listing
those paths.

The absent `/missing.txt` and unmatched `*.bak` are omitted. The unmatched
`!generated/manifest.json` negation is omitted as well, while `generated/**`
remains because `generated/out.ts` exists. Comments still describe an authored
group once after its inactive declarations are filtered out. The configured
ignore-file rule appears because `logs/` exists, but its git-facing comment does
not become project-facing explanation.

Tool-owned entries remain separate. The generated document points to its
`ESPALIER.MD` as the persistent source for guidance and configuration is named
without suggesting edits to ignore lists.

The golden is compared byte for byte, so filtering, grouping, ordering,
placement, table escaping, and the generated-source link are one assertion.

Pins: cli/build/README.MD "Not described here", CONFIG.MD "`.espalierignore`".
