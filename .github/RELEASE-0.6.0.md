# Espalier 0.6.0

This release adds subtree folding, source previews for creation, and concise
explanations. It also addresses adoption issues in worktree discovery,
diagnostics, and generated guidance.

## Documentation folding

Set `fold: true` in a directory's `ESPALIER.MD` frontmatter to fold that
directory and its entire subtree into the nearest enclosing generated document.
Omitted or false values retain normal placement. Descendant flags cannot reopen
a folded branch; separate child espaliers remain independent.

At the project root, `fold: true` consolidates guidance into one root document.
It replaces the removed `build.inline` setting. Folding preserves path headings
and rule scope, and build removes obsolete provenance-marked documents.

## Creation and discovery

- `espalier create <path> preview [template options]` shows the source that
  creation would produce, including required files for a directory. It writes
  no target files or directories and prints no partial preview if rendering
  fails. Preview executes template code, including any custom side effects.
- `espalier explain <path> --concise` provides a short human-readable summary
  of ownership, captures, and applicable constraints. JSONL output is unchanged.
- Creation help points to directory explanations for optional-file discovery.
  Generated workflows no longer require a help call before every creation.

## Adoption fixes

- Linked Git worktrees nested inside a repository are excluded from child
  discovery and parent operations. Ordinary child projects and submodules
  remain governed. Git metadata is excluded automatically.
- Successful builds and freshness checks report completion, including the
  number of generated guidance files.
- Human lint output groups repeated rule prose by path and rule while retaining
  every finding. Machine-readable findings remain complete.
- Direct rule-module syntax failures include available parse coordinates.
- Authoring guidance clarifies prose ownership, template placeholders, and
  documentation placement for dynamic directories.

## Upgrading from 0.5.0

Install Espalier 0.6.0, then run:

```bash
espalier migrate --dry-run
espalier migrate
espalier lint
espalier build
espalier build --check
```

Migration updates the exact configuration pin and the marked authoring contract.
It removes `build.inline`: true becomes `fold: true` in the configured espalier
root's `ESPALIER.MD`, creating that file if needed; false only removes the config
key. Existing Markdown prose and other frontmatter fields are preserved.
YAML formatting may be normalized. Configurations still containing
`build.inline` are rejected with migration guidance.

Review and commit the migration and regenerated guidance, and run your rule
tests. Folded rule sections now precede Other repository paths in their enclosing
document. Existing distributed layouts retain their placement unless authors
opt into folding.
