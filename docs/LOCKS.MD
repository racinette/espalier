# Locks, frozen files and sealed collections

What `locked` means for the espalier, and `frozen` and `sealed` for the files
it governs, where each can be declared, and how a project checks a change
against them.

A module of the espalier may be locked. Changing anything a locked module
declares needs explicit authorization, however obvious the change. Locks apply
to the espalier only: its rule modules, directory modules and declarations. The
project's files are never locked. Editing, creating and deleting the files the
espalier already admits is ordinary work, wherever the espalier is locked.

In an unlocked part of the espalier, a change the task clearly implies, such as
the declaration a new member needs, is part of the task and is reported with
it. An open design, with several reasonable places or roles, is proposed and
agreed first. In a locked part, the agent reports the path and role the work
needs and waits for authorization. Generated guidance states both behaviours
and marks every locked module with 🔒.

## Declaring a lock

```js
// espalier/src/core/ESPALIER.mjs
export const locked = true;
```

Any module of the espalier may export `locked` as a boolean: a directory
module, the espalier root's included; a structural rule; a constraint; and an
instance or group declaration. Any other value is rejected, as
`module_invalid_export` on a rule module and `malformed_node_description` on a
directory module.

## Which lock applies

A module's lock is its own `locked` export, or else that of the nearest
enclosing directory module, or else unlocked. `locked = false` reopens a module
or a subtree inside a locked one. A nested espalier starts unlocked from its
own root: its parent's lock does not reach it.

A declaration inherits from the directory it sits in, not from its contract.
Locking `[provider].ts.mjs` does not lock `stripe.ts.mjs`; Stripe's guidance
stays editable unless the directory, or the declaration itself, is locked.

## What a lock covers

A lock freezes everything the locked module declares, and nothing else:

| Module | What it declares |
|---|---|
| A directory module | its guidance and flags, and which modules exist in its directory |
| A structural rule | its description, guidance, lint, template, requirements and groupings |
| An abstract rule or directory | the same, and its member list: the declarations of its instances |
| A rule with an abstract grouping | the same, and that grouping's declared groups |
| A constraint | its selection, guidance and lint |
| An instance or group declaration | that one member's description, guidance and lint |

So a change needs explicit authorization when it:

- edits, removes or moves a locked module;
- adds a module to a locked directory;
- declares or removes a member of a locked abstract contract or grouping, or
  moves a declaration to or from one.

Adding, removing or changing a `locked` export always needs explicit
authorization, whatever is locked around it. That is what makes `locked =
false` safe inside a locked subtree: reopening it was itself authorized.

A lock does not cover the content of a file whose rule is locked. A locked
`api.ts` rule freezes the rule, not `src/api.ts`; content that must not change,
such as an applied migration, is what that rule's `lint` checks. Running
`create`, `lint` and `build` is never covered.

A non-abstract contract admits new members without any change to the espalier,
so no lock stops them. To require authorization for each new member, make the
contract [abstract](INSTANCES.MD#abstract-contracts) and lock it. To keep
existing files as they are, [freeze](#frozen-files) them; to keep any file from
joining or leaving, [seal](#sealed-collections) the collection.

## Frozen files

A lock keeps the espalier from changing; `frozen` keeps files from changing.
Applied migrations, published release notes and vendored code are records:
once they exist, the right change is a new file, never an edit.

```js
// espalier/migrations/0001[ord=00]_users.sql.mjs, a declared group
export const frozen = true;
```

`frozen` is a boolean export on a directory module, for every file beneath it;
on a structural rule, for the files it owns; on an instance declaration, for
that instance's files; and on a group declaration, for that group's files. A
file is frozen by the most specific statement about it: an instance
declaration before the contract it declares, a declared group before the rule
whose files it groups, and any of them before the nearest directory module
above the file. A declared directory comes before its contract directory in
the same way, and so does every directory inside it: declaring a member gives
it guidance of its own, and keeps it in its contract's collection. Locks differ
here because they protect modules, and a declaration is a module of its own.
`frozen = false` reopens a file inside a frozen group, rule or directory.

An existing frozen file must keep its content and must not be removed or
renamed. New files are welcome, so a frozen collection is append-only: the next
migration is added beside the frozen ones.

A grouping holds every file of its rule, so freezing a grouping would only
freeze the rule, and it is rejected: freeze the rule, or one declared group. A
constraint owns no files and rejects `frozen` too. Groups of different
groupings overlap, so two declared groups could make opposite statements about
one file: the users set of the `0001` release frozen, the `0001` release
reopened. A file cannot be both, so groups that could share a file, because
they agree on every capture both groupings group by, must agree on `frozen`,
or compilation fails with `conflicting_frozen`. A file that does not exist yet
counts: the contradiction is in the espalier.

## Sealed collections

`sealed` keeps a collection's members as they are: no file joins or leaves it,
while the files themselves stay editable unless they are frozen.

```js
// espalier/locales/[lang=a+].json.mjs
export const sealed = true;
```

| Sealed | Its members | So it changes when |
|---|---|---|
| A directory module | every file beneath it | a file is added beneath it, or one is removed or moved out |
| A structural rule or instance declaration | the files it owns, a contract its instances' too | a file comes to match it, or one it owned is removed or renamed |
| A grouping, `sealed: true` in `groups` | its groups, one per directory and capture values | a new group appears, or every file of one is gone |
| A group declaration | that group's files | a file joins the group, or one leaves it |

A file added to an existing group of a sealed grouping changes the group, not
the grouping. A rename is one file leaving and another joining.

A sealed contract directory seals each directory it matches, declared ones
included. A seal is the collection's statement about itself, so it is never
inherited and never reopened: a sealed directory holding an unsealed rule
still admits no new file, and `sealed = false` means only that the module seals nothing. A file
in several sealed collections answers to each. A constraint owns no files and
rejects `sealed`.

## Frozen and sealed together

| | Edit an existing file | Remove or rename one | Add a file |
|---|---|---|---|
| `frozen` | no | no | yes |
| `sealed` | yes | no | no |
| both | no | no | no |

Frozen alone is an append-only record, such as migrations or release notes.
Sealed alone is a fixed set with editable content, such as the languages a
product ships. Both is a snapshot, such as vendored code, or a released
migration set that no step may join.

`frozen` and `sealed` are part of the espalier like any other export, so
whether a change to one needs authorization is the lock's question: a frozen
rule in a locked directory can be unfrozen only with authorization.

## Checking against a base revision

```bash
espalier lint --base origin/main   # what this branch changes, in CI
espalier lint --base HEAD          # what the working tree changes, while working
```

`--base` names a git revision. Lint then also reads the repository as it was
at that revision and reports every change between it and the working tree, so
uncommitted edits count. Each change is judged by what was in force at the
base, so a change cannot unlock what it edits, unfreeze what it rewrites, or
unseal what it adds to. The check is opt-in: without `--base`, lint never
consults git, and its answer depends on the working tree alone.

| Issue | When |
|---|---|
| `locked_module_changed` | a locked module, or a repository file it imports, changed; or a locked module was removed |
| `locked_directory_changed` | a module was added to a locked directory |
| `locked_contract_changed` | a member of a locked abstract contract or grouping was declared or removed, or a declaration moved to or from one |
| `lock_changed` | a `locked` export was added, removed or changed |
| `untraceable_import` | a locked module imports a computed path |
| `frozen_file_changed` | a file frozen at the base changed, or was removed or renamed |
| `sealed_collection_changed` | a file joined or left a collection sealed at the base |

The issues are errors. A lock issue sits on the module's path under the
espalier root, with metadata naming the `module`, the module whose export
decided the lock as `lockedBy`, and, when an imported file is what changed,
that file as `via`. A frozen issue sits on the file, with `frozenBy`, `deleted`
and the `base` revision. A sealed issue sits on the file that joined or left,
with `sealedBy`, every module whose seal it changed, `added`, and the `base`
revision. Both sides are read by the base's espalier, so a file the change
moves to a new rule is still judged by the collections it belonged to. Path
arguments scope them like any other issue.

A module is compared together with every repository file it imports by a
relative path, followed transitively, because a locked rule changes when a
helper it imports does. Rules also receive the configured addons module, so
that module and its imports count as part of every locked rule. Packages and
`node:` built-ins are not followed: their versions are the lockfile's to pin.
A module that computes an import path cannot be followed, so a locked module
must import by literal paths, and one that does not is reported. A file a
module reads directly while it loads, rather than importing, is invisible to
the check; a locked module depends only on what it imports.

A frozen file is compared by git's object id for its working-tree content,
computed with the repository's own filters, so a line-ending conversion is not
an edit. Only files tracked at the base can be frozen there, or count as a
sealed collection's members there.

The base revision's tracked files are written to a temporary directory and
read as a repository of their own. The project's installed packages are
linked beside them, and the working tree's other git-ignored top-level
entries, such as build output a package imports by its own name, are linked
into them, so the base's rule modules import what the head's would. The base
must pin the same espalier version, so both are read by one
implementation. Anything that keeps the base from being read stops the run
with `base_unreadable`: no git, a revision that is not there, another pin, or
a module that fails to compile. A base with no configuration has no locks, frozen
files or seals, and nothing is reported.

What counts as authorization is the project's decision, because no diff can
show it. A typical setup runs the check on every pull request and requires an
approval from the owners of the locked or frozen area, through a review rule
or a label, before a failing check may be overridden:

```yaml
- run: git fetch origin main
- run: npx espalier lint --base origin/main
```

## In generated guidance

Every locked module carries 🔒 after its name in the map and in its section's
heading, every frozen node ❄️, and every sealed one 📦; a declared group or a
grouping carries its marks in its heading. Each document's legend explains the
marks it uses once. The working instructions describe the unlocked behaviour,
the locked behaviour whenever the espalier has a lock, and the frozen and
sealed behaviour whenever it freezes or seals anything. `espalier explain`
reports whether a path's module is locked or its file frozen, which module's
export decided each, and as `sealedBy` every sealed collection it belongs to.
Computed `guidance` and `description` receive the declaring module's lock as `locked`; see
[TYPES.MD](TYPES.MD#guidance).
