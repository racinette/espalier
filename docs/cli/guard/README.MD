# `espalier guard`

Closes parts of the repository for one piece of work, and opens what the work
needs, by writing [locks, freezes and seals](../../LOCKS.MD) into the espalier.
[`espalier unguard`](../unguard/README.MD) takes the whole guard back.

```bash
espalier guard --close . \
  --open src/components/Checkout/ \
  --edit src/router.ts --edit 'migrations/0003[ord=00]_users.sql' \
  --add migrations/
```

The work may now build the checkout component, wire it into the router, edit
one migration set and add migrations. Everything else is locked, frozen and
sealed: no existing file changes, no file appears or disappears elsewhere, and
the espalier itself needs authorization to change.

## Usage

```text
espalier guard [options]

  --close <target>   lock, freeze and seal it; repeat for more
  --freeze <target>  existing files keep their content
  --seal <target>    no file joins or leaves
  --lock <target>    its espalier modules need authorization
  --open <dir>       inside what is closed: edit, add and remove files
  --edit <target>    inside what is closed: edit existing files
  --add <dir>        inside what is closed: add and remove files
  --no-build         do not rebuild the generated documentation
  --dry-run          print what would be written, write nothing
  --config <path>    use this config file instead of discovering one
  --format <fmt>     human or jsonl (default: human)
  --out <dest>       stdout, stderr, or a file path (default: stdout)
```

Every flag may repeat, and their order does not matter: the closing flags are
applied first, then the opening ones, and each file answers to the most
specific statement about it. A target both closed and opened for the same
thing is refused as `guard_conflict`. Without `--no-build`, the generated
documents are rebuilt afterwards, so the guard and the 🔒❄️📦 marks the
working agent reads are committed together.

## Targets

A target is a repository path, or the espalier's own name for a set of files.
Guard writes to the one module that speaks for exactly that set:

| Target | Example | Module |
|---|---|---|
| a directory | `src/components/Checkout/` | its `ESPALIER.mjs`, or a new declaration under its contract |
| a file with a fixed name | `src/router.ts` | its rule module |
| a file a pattern admits | `src/routes/orders.ts` | a new file declaration |
| a group | `migrations/0003[ord=00]_users.sql` | its group declaration, new if need be |
| a pattern | `src/routes/[route].ts` | the rule module, for every file it admits |
| a pattern directory | `src/components/[component]/` | the contract's `ESPALIER.mjs`, for every directory it admits |

A trailing `/` names a directory; one that exists is a directory either way.
A declaration guard creates carries only `instanceOf` and the export, which is
all a declaration needs. Guard never invents architecture: a target the
espalier does not admit is refused as `guard_unknown_target`, and so is a path
inside the espalier root, because a guard governs the work, not the rules. A
file under a directory the espalier admits only through a contract needs that
directory declared first.

`--add` and `--open` take directories only, since only a directory reopens a
seal. To let the work create one particular file, open its directory. `--edit`
on a file that does not exist is refused as `guard_invalid_target`, for the
same reason.

A declared directory or file is required by default, so a component the guard
declares and the work has not yet created is reported by lint as missing. The
guard doubles as the list of what the work must deliver.

## What it writes

Closing a directory or a pattern covers everything beneath it, so a module
there that reopens it, with `frozen = false`, `sealed = false` or
`locked = false`, has that export taken away; otherwise the closed set would
not be closed. Locks follow directories, not contracts, so closing a pattern
leaves its members' locks alone.

A guard never deletes what an author wrote. A statement it changes is commented
out line by line and its replacement is fenced:

```js
// espalier guard: export const frozen = false;
// espalier guard begin
export const frozen = true;
// espalier guard end
```

An export already holding the value is left alone, and a module that does not
export it gains a fenced line at its end. A module the guard creates opens with
`// espalier guard created` and a hash of its contents. The export may be
written in any form a module can export it: a value over several lines, one of
several declarations, an export list, or a re-export. One that is destructured,
`export const { frozen } = settings`, is refused as `guard_unsupported_export`,
since there is no line to set it on. Every edit is restored in memory before it
is written, and one that would not come back byte for byte is refused as
`guard_unsupported_module`.

Everything is planned and checked before the first write. The written espalier
is then compiled, and a guard that would leave it unable to compile is taken
back and reported as `guard_invalid`. Guard never touches git.

## One guard at a time

A repository holds one guard. While any module carries a guard's marks, `guard`
refuses with `already_guarded`; run `unguard` first. Lint reports each marked
module as `guard_in_place`, a warning: expected on the branch the guard is for,
and a reminder anywhere it would be merged.

A nested espalier is a separate system, and a guard reaches no further than the
espalier it is run in. Run `guard` inside the child to guard it.

## The workflow

```bash
espalier guard --close . --open src/components/Checkout/ --edit src/router.ts
git commit -am "Guard the checkout work"          # the guard commit
# the agent works, and checks with:
espalier lint --base <guard commit>
espalier unguard
git commit -am "Lift the guard"
```

`lint --base` judges each change by the espalier at the guard commit, so the
work cannot unfreeze what it edits. See
[LOCKS.MD](../../LOCKS.MD#guarding-a-piece-of-work).

Every operational failure code is listed in [ERRORS.MD](../../ERRORS.MD).
