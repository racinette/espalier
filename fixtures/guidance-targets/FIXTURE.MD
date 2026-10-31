# Every guidance target

Pins docs/cli/build/README.MD "Rendering" and "Stated once" over every kind of
module that carries guidance, each written once with a marker `G01` to `G27`:
the root, a directory, a contract directory and its named instances, a rule,
a grouping, a group the template declares, a group a named instance declares
with and without restating the rule, an addition to an inherited grouping with
and without groups of its own, a named file instance, a file named by a
back-reference declared an instance, a file that takes over an inherited one,
an abstract contract, a constraint at the root and one in a subtree, and a
folded subtree. Each marker appears exactly once across the documents, in the
document nearest its module, and every pointer to guidance stated elsewhere
names the document that states it.

Also pins the order and omissions that keep sections readable: a contract's
instances before its groupings, an inherited directory and a restated rule
described as their contracts are, and an addition to an inherited grouping
listing only its own groups.
