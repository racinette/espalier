# init: the config, the espalier root, and the exclusions nobody chooses

`init` writes two things and describes nothing. No `ignore` entry for the
repository's own source is generated, so it stays in scope and the first `lint`
reports all of it.

The config is not empty, though. Every `init` writes the common list — VCS
directories, repository metadata, CI, licences, editor droppings — because
`.gitignore` never names `.git/` and a walk that descends into it is a walk
through several tens of thousands of objects. Those entries are in the config
rather than inside the tool, so they can be read and deleted like any other.

That is deliberate. You have just run `init` on a repository that declares
nothing; you are not wiring that into CI before describing anything, so the
noise is visible only to the person who caused it. Guessing a source layout
before anyone has said what matters would also leave `adopt` unpicking a coarse
`src/**` on every run. See `init-ignore-all` for the opt-in.

## The `.gitkeep`

Git does not track empty directories. Without this file the espalier root
vanishes on the first commit and the next person to clone gets
`espalier_root_missing` before writing a line — a bad first five minutes caused
entirely by a tool's own scaffolding.

It works because dotfiles in the espalier are skipped rather than read;
`init-existing-config` pins that half. Otherwise `compile` would reject it as
`invalid_espalier_entry` and `init` would produce a repository that cannot be
linted.

## `--no-ignore-file`

This repository has no ignore file, so the run says so — `--no-ignore-file` is
the flag that says it. Without one, `init` writes `ignoreFiles: [.gitignore]`,
finds no such file, and stops with `ignore_file_missing` having written
nothing: a config naming a file it does not have would govern everything while
looking correct.

The declined answer is **written down** as `ignoreFiles: []` rather than left
out. The key is empty by default, so omitting it would produce the same
behaviour and none of the record — and the next reader could not tell a
decision from an oversight. `init-ignore-all` pins `--ignore-file`, the other
half of the same choice, and `test/candidates.test.ts` pins both refusals.

## No `expected.json` lint assertion

There is nothing to lint: this fixture has no config until the run under test
writes one. It is the only kind of fixture that ships without one.

Pins: cli/init/README.MD "What it writes", "`--ignore-file` and
`--no-ignore-file`", "Why no ignore list for your source".
