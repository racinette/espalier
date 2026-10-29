# Groupings of a dynamic rule's files

Pins TYPES.MD "groups" and cli/lint/README.MD "Groupings". One migration rule
declares two groupings: a set, by number and group name, whose steps must be
numbered without gaps; and a release, by number alone, whose groups must be
listed in the release manifest. Each group is linted once per directory with
its members, its shared captures, and a default issue path of the directory.
A grouping's issues carry the grouping's name, description and rule text.

Also pins that guidance renders each grouping as a sub-section of its rule,
and that `explain` reports which groups a file belongs to.
