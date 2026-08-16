# init: the config and the espalier root, and nothing else

`init` writes two things and describes nothing. No `ignore` list is generated,
so the repository's existing source stays in scope and the first `lint` reports
all of it.

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

## No `expected.json` lint assertion

There is nothing to lint: this fixture has no config until the run under test
writes one. It is the only kind of fixture that ships without one.

Pins: cli/init/README.MD "What it writes", "Why no ignore list by default".
