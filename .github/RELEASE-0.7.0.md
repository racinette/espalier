# Espalier 0.7.0

Dot-prefixed files and directories can now be governed like other repository
paths. This is a breaking change to rule discovery and exclusion policy.

## Dot-prefixed paths

- Declare files such as `.env` and directories such as `.github/workflows` with
  ordinary structural rules. Matching, constraints, creation, previews, and
  generated guidance include them.
- Adopt dot-prefixed directories and infer their dot-prefixed descendants.
  Capture names derived from dotted parents are valid identifiers: `.features`
  produces `[feature]`.
- Adoption refuses before writing if an exclusion would hide a proposed rule
  or migrated guidance.

## Explicit exclusions

- `skip` now prunes matching rule-tree directories before reading their
  contents. Excluded tooling directories may contain `.mjs` files and
  `ESPALIER.MD`. Individually skipping grammar in an inspected directory still
  fails with `skip_hides_grammar`.
- Git metadata follows explicit policy. The shipped `.espalierignore` includes
  `.git`, covering both metadata directories and gitfiles at any depth. The
  shipped rule-tree `skip` list includes `.git` and `.gitkeep`.
- Dot-prefixed tooling entries need explicit exclusions. The common repository
  ignore list remains editable; remove entries such as `.github/` to govern
  those paths. `init --no-common-ignore` also declines the repository `.git`
  exclusion.
- Linked-worktree isolation remains in effect independently of Git metadata
  exclusions. Espalier's root rule-tree `.cache/` directory remains reserved
  for its lint cache.

## Upgrading from 0.6.0

Install Espalier 0.7.0, then run:

```bash
espalier migrate --dry-run
espalier migrate
```

Migration updates the exact pin and marked authoring contract. For configurations
from before 0.7.0, it adds explicit `.git` repository exclusions and `.git` /
`.gitkeep` rule-tree exclusions where needed, including when the old `skip`
list was empty. Current configurations retain their explicit choices.

Migration reports other previously hidden rule-tree entries without importing
their modules or adding blanket dot exclusions. Review each reported entry:
keep intended rules, and explicitly skip tooling directories or non-rule files.
For example, add `.claude/` to `skip` if it contains tooling beside the rules.
An unskipped dot-prefixed non-rule file now fails compilation.

After reviewing those entries, run:

```bash
espalier lint
espalier build
espalier build --check
```

Review and commit the migration and regenerated guidance, and run your rule
tests. Directory exclusions now prevent descendant rules from loading; review
existing `skip` directory patterns as part of the upgrade.
