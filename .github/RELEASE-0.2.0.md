# Espalier 0.2.0

Espalier 0.2.0 brings its reference and authoring guidance into the installed
package, adds writable example copies, and makes aggregate selection explicit.
This release includes breaking changes for projects upgrading from 0.1.0.

## Highlights

- `espalier help` lists and prints the reference shipped with the running CLI.
- `init` and `migrate` install a compact authoring contract in the espalier root.
  It covers rule selection, implementation, testing, and generated-document review.
- `espalier examples --help` lists the available examples.
  `espalier examples authoring-corpus --copy ./scratch/corpus` copies a complete
  worked project into a new, writable directory without changing the installed copy.
- Generated constraint guidance names the selected files, and the README now
  reflects the current rule kinds, contexts, ownership, and documentation layout.
- Implementation dependency tracking handles loader-encoded source URLs.

## Breaking changes

### Configuration

`pin` is the only version field. The former `version` key is no longer accepted.
Both `ignoreFiles` and `skip` must be present; an empty list is an explicit choice.
`skip` identifies instruction files inside the rule tree that are not compiled
as rules.

### Aggregate rules

An aggregate's filename no longer selects a file extension. Keep
`aggregate = true`, use a rule-name filename such as
`src/[...path]/message-registry.mjs`, and use `targets` when selection needs
narrowing. Without `targets`, an aggregate selects every owned, governed file
in its scope.

For example, rename `src/[...path]/message-registry.json.mjs` to
`src/[...path]/message-registry.mjs` and export `targets = ["**/*.json"]` to retain
JSON-only selection. An extension-looking suffix left in the filename is part
of the rule name, not a filter.

Aggregate contexts expose `patterns` rather than a singular `pattern`.
Update aggregate implementations and callers of `runAggregate` accordingly;
individual paths and captures remain on the entries in `matches`.

## Upgrading from 0.1.0

1. Install Espalier 0.2.0 using the project's provisioning method. If rules import
   from `"espalier"`, update that local dependency to exactly `0.2.0` as well.
2. Run `espalier migrate --dry-run`, review the proposed paths, then run
   `espalier migrate`. It updates discovered nested configurations too.
   Review the resulting diff: migration removes `version`, updates `pin`,
   inserts absent `ignoreFiles: []`, and inserts absent `skip` entries for
   `AGENTS.MD`, `AGENTS.md`, and `CLAUDE.md`. Existing lists are preserved.
   It also installs or refreshes the shipped authoring contract where permitted;
   customized copies without its sentinel are preserved.
3. Update aggregate filenames, selection, and context usage manually.
   `migrate` does not rewrite rule implementations.
4. Run the project's rule tests and `espalier lint --no-cache`.
5. Run `espalier build`, review the generated guidance, then run
   `espalier build --check`.

Node.js 24 or newer remains required.
