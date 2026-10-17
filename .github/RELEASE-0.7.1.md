# Espalier 0.7.1

Clearer architectural guidance and migration dry-run output. This patch does
not change matching, adoption inference, or rule-module exports.

## Architectural guidance

- Choose placement by a directory's documented purpose. Passing lint alone
  does not establish that functionality belongs in a general-purpose location.
- Prefer static nodes for known architectural roles. Use dynamic patterns for
  instances sharing a responsibility and contract, keeping fixed structure
  explicit.
- Discuss architectural options and tradeoffs, recommend an approach, and get
  agreement before changing policy in rules, guidance, or configuration.
  Proceed with an agreed design without repeated approval; reopen discussion
  when implementation requires a materially different design.
- Include constraint selectors, exclusions, requiredness, and removed
  guarantees in architectural proposals.
- Align the shipped authoring contract, README, and adoption instructions with
  this workflow. Review inferred groups before accepting them as architecture;
  per-file constraints are distinguished from catch-all structural locations.

## Migration dry runs

`espalier migrate --dry-run` adds one notice per invocation:

> Dry run: no migration files will be changed.

Simulated file records and summaries still match a normal run, including
`written` and `skipped`. Human output places the notice after the summary;
JSONL emits a `warning` record. The notice follows `--out` like other output.

## Upgrading from 0.7.0

Install Espalier 0.7.1 through your project's usual installation method, then
run:

```bash
espalier migrate --dry-run
espalier migrate
espalier build
espalier lint
espalier build --check
```

Migration updates exact version pins and eligible shipped authoring-contract
copies. Customized authoring files with the shipped marker removed are left
alone; incorporate the guidance changes into those files as appropriate.
Build regenerates the operational guidance in root documents where
`build.espalierGuidance` is enabled. Review and commit the migration and
generated documents, and run your project's rule tests.
