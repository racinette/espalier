# Espalier 0.9.2

This documentation patch brings the packaged CLI manual and shipped authoring
guidance into line with existing behavior. It changes no runtime APIs or
matching rules.

## Documentation corrections

- Describe computed file and directory descriptions alongside computed prose,
  including resolved configuration, isolated declaration contexts, and evaluation
  during compilation before lint workers start. Distinguish those callbacks
  from per-file lint and template callbacks.
- Clarify that standalone `runRule` tests need an explicit guidance context for
  computed text and do not resolve inheritance.
- Document optional-file selection in directory previews and creation reports.
  Explain that named inherited members count toward `minMatches`; authors only
  need to create additional members when the collection minimum remains unmet.
- Correct `explain` documentation: Git metadata follows configured ignore
  policy, while nested linked worktrees are excluded automatically.
- Distinguish descriptions and references in JavaScript API findings from the
  JSONL lint issue schema, and correct the built-in issue listing.
- Clarify that Markdown migration omits empty guidance and default folding,
  and does not reformat existing directory-module prose.

The shipped authoring contract, worked example, and initialization fixtures
carry the same updated guidance.

## Upgrading from 0.9.1

```bash
npm install --save-exact espalier@0.9.2
npx espalier migrate --dry-run
npx espalier migrate
npx espalier lint
npx espalier build
npx espalier build --check
```

Migration updates the exact version pin and refreshes an uncustomized shipped
authoring contract. Existing rules need no changes for this patch.

Full changes: https://github.com/racinette/espalier/compare/v0.9.1...v0.9.2
