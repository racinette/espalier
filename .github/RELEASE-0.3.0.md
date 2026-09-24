# Espalier 0.3.0

This release makes rule-file selection explicit and consistent across per-file
and aggregate constraints. A constraint selects files either by the complete
extension in its filename or by exported `targets` globs, never both. An
extensionless constraint must export `targets`; an aggregate uses the same
selection rules and still runs once over its selected group, including an empty
group.

Captures in structural filenames no longer absorb dots before a fixed suffix:
`[file].ts.mjs` no longer owns `foo.d.ts`. Literal dots and dots repeated by
back-references still match as authored. A dynamic filename may explicitly
list alternatives such as `[file].{ts,d.ts,tsx}.mjs`, including compound
extensions like `.up.sql` and `.down.sql`. `espalier adopt` now keeps repeated
compound extensions separate when it infers these rules.

Generated guidance lists each rule directly under its directory and states
which files must follow it individually or together. It no longer groups
constraint rules under implementation-category headings. This release also
adds `espalier --version`, which works without a repository configuration.

`targets` and `context.files()` now use minimatch, supporting brace alternatives
such as `**/*.{ts,tsx}`, `?`, character classes, extglobs, and escaping.
Matching remains case-sensitive, includes eligible dotfiles, and uses `/`
separators on every platform. Ignore files retain their gitignore semantics;
implementation-dependency discovery continues to use Node's filesystem globber.

## Upgrading from 0.2.0

Install 0.3.0 and run `espalier migrate` to update the exact config pin and the
marked authoring contract. Migration does not rewrite rule modules; review
existing rules before running `espalier lint` and `espalier build`:

- An aggregate with no filename extension and no `targets` now needs an explicit
  selector. Add `targets = ["**/*"]` to preserve selection of every owned file
  in its directory scope.
- A dotted aggregate filename now selects that complete extension. Rename it
  to an extensionless rule and add `targets` if the dots were part of its old
  rule name rather than a desired filter.
- A per-file constraint that combines a filename extension and `targets` must
  choose one selector. An extensionless filename keeps the glob selection;
  removing `targets` keeps the exact extension selection. Check the resulting
  match set rather than assuming these forms are interchangeable.
- Filename-only per-file constraints also change selection: `rule.ts.mjs`
  no longer selects `foo.d.ts`. To preserve suffix matching, rename it to
  `rule.mjs` and export `targets = ["**/*.ts"]`. To select only specific
  complete extensions, use a list such as `rule.{ts,d.ts}.mjs` instead.
- If a structural filename capture previously absorbed dots, as `[file].ts`
  did for `foo.d.ts`, write those dotted parts explicitly, for example with
  `[file].{ts,d.ts}.mjs`. Review sibling rules for overlap after changing the
  filename. Literal dots and dots repeated by back-references are unaffected.
- Review `targets` and `files()` patterns containing `?`, brackets, braces,
  backslashes, or extglob syntax: they now have minimatch meanings rather than
  matching those characters literally. Escape punctuation when a literal path
  is intended. `**` crosses directories only as a whole path segment; embedded
  stars such as `a**b` stay within one segment.

Run `espalier explain` on representative paths to verify ownership and
constraint selection, then run `espalier lint`, `espalier build`, and
`espalier build --check`. Review and commit the regenerated guidance with the
rule changes.
