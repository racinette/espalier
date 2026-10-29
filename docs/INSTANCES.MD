# Instances

How one path gets its own description and guidance while staying a member of
a shared contract, and how a contract can insist on it.

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
  under the contract and its own document, which opens with the contract's
  guidance. `explain` lists the inherited chain.
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
