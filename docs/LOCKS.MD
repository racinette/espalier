# Locks

What `locked` means for the espalier, where it can be declared, and how a
project enforces it.

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
contract [abstract](INSTANCES.MD#abstract-contracts) and lock it.

## Enforcing locks

```bash
espalier lint --base ../main
```

`--base` names a checkout of the same repository at the base of the change,
such as the target branch of a pull request. Lint then compares the espalier
there with the one being linted and reports every change a lock covers. Each
change is judged by the locks in force at the base, so a change cannot unlock
what it edits.

| Issue | When |
|---|---|
| `locked_module_changed` | a locked module, or a repository file it imports, changed; or a locked module was removed |
| `locked_directory_changed` | a module was added to a locked directory |
| `locked_contract_changed` | a member of a locked abstract contract or grouping was declared or removed, or a declaration moved to or from one |
| `lock_changed` | a `locked` export was added, removed or changed |
| `untraceable_import` | a locked module imports a computed path |

The issues are errors on the module's path under the espalier root. Their
metadata names the `module`, the module whose export decided the lock as
`lockedBy`, and, when an imported file is what changed, that file as `via`.
Path arguments scope them like any other issue.

A module is compared together with every repository file it imports by a
relative path, followed transitively, because a locked rule changes when a
helper it imports does. Rules also receive the configured addons module, so
that module and its imports count as part of every locked rule. Packages and
`node:` built-ins are not followed: their versions are the lockfile's to pin.
A module that computes an import path cannot be followed, so a locked module
must import by literal paths, and one that does not is reported. A file a
module reads directly while it loads, rather than importing, is invisible to
the check; a locked module depends only on what it imports.

The base must pin the same espalier version, so that both espaliers are read
by one implementation; otherwise the run stops with `base_unreadable`. A base
with no configuration has no locks, and nothing is reported.

What counts as authorization is the project's decision, because no diff can
show it. A typical setup runs the check on every pull request and requires an
approval from the owners of the locked area, through a review rule or a label,
before a failing check may be overridden:

```yaml
- run: git worktree add ../base origin/main
- run: ln -s "$PWD/node_modules" ../base/node_modules
- run: npx espalier lint --base ../base
```

The base's rule modules are imported to read them, so whatever they import,
such as `espalier` itself for `createTemplate`, must resolve from the base.
Linking the head's installed packages is usually enough; a base whose
dependencies differ needs its own install.

## In generated guidance

Every locked module carries 🔒 after its name in the map and in its section's
heading, and each document's legend explains the mark once. The working
instructions describe the unlocked behaviour, and the locked behaviour whenever
the espalier has a lock. `espalier explain` reports whether a path's module is
locked and which module's export decided it. Computed `guidance` and
`description` receive the declaring module's lock as `locked`; see
[TYPES.MD](TYPES.MD#guidance).
