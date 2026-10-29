# Declared groups and abstract groupings

Pins INSTANCES.MD "Declaring a group" and "Abstract groupings". One migration
rule groups its steps into sets, by number and table, and into releases, by
number. The `set` grouping is abstract. Two sets are declared by modules at
the rule's name with `num` and `group` written as values, and one release by
a module with only `num` written in. A declared group is a section under its
grouping in generated guidance, and `explain` names a file's declared group.

The `0003_audit` set exists and is not declared, so it is reported as
`undeclared_instance` on the directory. The declared `0002` release has no
files, so it is reported as `missing_required_group`. The declared
`0001_users` set runs its own `lint`, whose issue carries the declaration's
module, description and guidance.

Afterwards step 01 creates the users table, the audit step is removed, and an
`0002_invoices` set is added with its declaration, so the repository conforms.
