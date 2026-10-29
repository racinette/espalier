# Instances

How one path, or one group of files, gets its own description and guidance
while staying a member of a shared contract, and how a contract can insist on
it.

A dynamic rule such as `clients/[provider].ts.mjs` or `app/[route]/ESPALIER.mjs`
is a contract: it describes every path its pattern admits. Most members need
nothing more. Some deserve a section of their own in the generated guidance,
because an agent working on `clients/stripe.ts` wants to know what is specific
to Stripe, not only what every provider client has in common. That member is
declared as an instance.

## Declaring a file

Write a module at the file's own name, beside the contract, and name the
contract in `instanceOf`:

```js
// espalier/clients/stripe.ts.mjs
export const instanceOf = "[provider].ts.mjs";
export const description = "the Stripe client";
export const guidance = `Uses payment intents, never charges.`;
```

`description` and `guidance` are required, as on every structural rule: the
declaration exists to carry them. `lint` is optional and adds to the inherited
check rather than replacing it. The contract's `template` creates the file
unless the instance supplies its own.

## Declaring a directory

Write `ESPALIER.mjs` in a directory of the instance's name and name the
contract in `instanceOf`:

```js
// espalier/app/about/ESPALIER.mjs
export const instanceOf = "../[route]";
export const description = "the about page";
export const guidance = `Company history and the team. No marketing copy.`;
```

The directory inherits every file the contract declares. It may add guidance
to an inherited file by declaring that file too, and may make an optional
inherited file required, but it cannot add files the contract does not
declare, make a required file optional, or remove a check.

Both forms are checked at compile time: the contract must be a sibling pattern
that admits the name. [MATCHING.MD](MATCHING.MD#named-instances) has the
composition and requiredness rules in full.

## What a declaration changes

- The path is static. It is required by default, `optional = true` relaxes
  that, and `create` makes it like any declared file or directory.
- In generated guidance a file gets its own sub-section under its contract,
  with the contract's guidance stated once above. A directory gets a line
  under the contract and its own document, which opens by naming the
  contract and the document that states its guidance. That guidance is not
  repeated. `explain` lists the inherited chain.
- Every inherited check still runs, and findings keep the module that
  produced them.
- It stays a member of the contract's groupings, with the captures the
  contract binds. See [TYPES.MD](TYPES.MD#groups).

## Abstract contracts

A contract can refuse anonymous members:

```js
// espalier/app/[route]/ESPALIER.mjs
export const abstract = true;
export const description = "a route";
```

Every path the pattern admits must then be declared. One that is not is
reported by `espalier lint` as `undeclared_instance`, on the file, or on the
directory with a trailing slash. The message names the module to write and
`metadata.contract` names the contract's declaration. The path is still
owned, so it is not `unexpected_path`, and the contract's own checks still
run against it.

`espalier create` refuses an undeclared path under an abstract contract as
`invalid_create_target`, naming the same module to write, since declaring is
authoring and creation never writes into the espalier. Declare first, then
create.

`abstract` goes on a dynamic structural rule or on a dynamic directory's
`ESPALIER.mjs`, as a boolean. It is rejected on a static rule, on a
constraint, and on a directory that declares nothing. `minMatches` on an
abstract contract counts its members as before; an undeclared member counts
and is reported.

In generated guidance an abstract contract differs from an ordinary one in
three places: the map counts "declared" rather than "matching" members, the
closing "Adding new instances" note says every member here is declared and an
undeclared one is reported, and with no instances yet the contract says so in
place of the list. See [the build reference](cli/build/README.MD#contracts).

## Declaring a group

A grouping names sets of a rule's files by the captures they share. See
[TYPES.MD](TYPES.MD#groups). Its `guidance` holds for every group. One
group can say what it is for, such as the migration set that creates the users
table, without repeating that on each of its files.

Write a module at the rule's own name with the grouping's captures written as
values. Keep every other placeholder exactly as the rule writes it, and name
the rule in `instanceOf`:

```js
// espalier/migrations/[num=0000][ord=00]_[group=a+].sql.mjs
export const groups = {
  set: { by: ["num", "group"], description: "a migration set", guidance: "A set changes one table." },
  release: { by: ["num"], description: "one release's migrations", guidance: "" },
};
```

```js
// espalier/migrations/0001[ord=00]_users.sql.mjs
export const instanceOf = "[num=0000][ord=00]_[group=a+].sql.mjs";
export const description = "create users";
export const guidance = `Creates the users table. Step 01 is the \`CREATE TABLE\`.`;
```

`0001[ord=00]_users.sql` writes in `num` and `group`, so it declares the
`0001`, `users` group of `set`. A module that writes in only `num`, such as
`0002[ord=00]_[group=a+].sql.mjs`, declares one group of `release`. Two
groupings never group by the same captures, so the captures written in
always choose one grouping. Compilation checks that:

- the rule is a sibling dynamic rule that declares groupings,
- every character but the written-in values is the rule's own,
- each value is one its placeholder admits,
- the written-in captures are exactly one grouping's `by`.

Any other shape is `invalid_instance`.

The declaration owns no file. Its group's files are still the rule's, checked
by the rule's `lint` and the grouping's `lint` as before. What it adds:

- `description` and `guidance`, which are required. In generated guidance the
  group is a section under its grouping, and `explain` shows a member's
  declared group.
- `lint`, which is optional. It runs once per directory holding the group, with
  the same context as the grouping's `lint`, beside the grouping's own check.
  Its issues carry the declaration's module path, its `description` and its
  `guidance`, and the grouping's name as `group`.
- Requiredness. A declared group must have at least one file in every
  directory the rule reaches, or `lint` reports `missing_required_group` on
  that directory. `optional = true` relaxes that.

`template` and `referenceImplementation` describe one file and stay on the
rule. A group can only be declared beside its rule. A capture from a
directory segment cannot be written in, since a directory is declared as a
directory instance. Every group in the rule's directories is the same
declaration, as with any sibling instance.

## Abstract groupings

A grouping can refuse undeclared groups:

```js
export const groups = {
  set: { by: ["num", "group"], abstract: true, description: "a migration set", guidance: "" },
};
```

Every group that exists must then be declared. One that is not is reported by
`espalier lint` as `undeclared_instance` on its directory. The message names
the module to write. `metadata.contract` is the rule's declaration,
`metadata.group` the grouping's name, and `metadata.captures` the group's
values. The grouping's own `lint` still runs on that group.

`espalier create` refuses to make a file whose group is not declared, as
`invalid_create_target`, naming the same module. Once the group is declared,
every member can be created. `abstract` must be a boolean. It is rejected on
a grouping with an empty `by`, whose single group per directory has no name to
declare it by.

In generated guidance an abstract grouping's closing note says every group is
declared and an undeclared one is reported. With no groups declared yet, the
grouping says so. See [the build reference](cli/build/README.MD#groupings).
