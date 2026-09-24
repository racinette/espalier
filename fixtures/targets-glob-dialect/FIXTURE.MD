# Minimatch selectors and file queries

Pins MATCHING.MD "Glob syntax" and TYPES.MD "ListFiles".

Brace alternatives, question marks, character classes, extglobs, and escaped
punctuation select owned files through the real CLI. An aggregate and a
context.files query use the same brace pattern as a per-file constraint.

The directory literal? contains a literal question mark. Both filename-based
and exported selectors scoped there must still reach its file: the compiler
must escape authored directory punctuation when constructing admission globs.
The literalX sibling must not be admitted by either scoped rule.

Info findings expose the exact selection without inventing content violations.
