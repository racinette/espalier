# Nested ignore files

Pins Git-style per-directory `.espalierignore` behavior and scope-aware
exclusion documentation.

- Root rules apply throughout the repository.
- `src/.espalierignore` retains a governed log without rendering its negation,
  and adds a subtree-local exclusion rule.
- A root-authored group spanning `src/` and `docs/` remains at the root.
- A root-authored group confined to `src/` appears in `src/AGENTS.MD`.
- `blocked/.espalierignore` is not discovered because its parent is excluded.
- Nested ignore files are listed as tool-owned entries at their generated level.
