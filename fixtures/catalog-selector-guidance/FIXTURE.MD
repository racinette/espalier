# Storefront release: catalogs and schema migrations

One small project supplies the generated-document audit. Its inline
`AGENTS.MD` shows the catalog and migration rules together, including their
structural owners, per-file constraints, and aggregate checks.

The `[locale]` subtree owns ordinary JSON domain catalogs and names the
required `checkout.json` separately. Filename-selected `.json` rules cover
the complete extension; `targets` globs narrow checks to legal and checkout
catalogs. The aggregate checks compare locale coverage and checkout keys.

`migrations/` adds a required standalone `baseline.sql` and one dynamic
structural rule for `[revision].{up.sql,down.sql}`. Its exact `.sql` constraint
checks only the baseline; its exact `.up.sql` constraint checks forward
migrations. The `{up.sql,down.sql}` constraint applies to both directions,
while `targets = ["**/*.sql"]` reaches every SQL script, including the
compound extensions. A target-selected aggregate checks that each numbered
revision has both directions.

The build golden pins these distinctions in one readable document. The
`after/` rerun breaks each new migration check as well as the catalog checks,
so the generated guidance can be compared with actual matching and findings.
