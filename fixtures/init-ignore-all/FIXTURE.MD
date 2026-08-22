# init --ignore-all: putting the existing tree out of scope

The opt-in for a repository already in CI, where a red build on the day you
introduce `espalier` is a problem.

One entry per top-level path, ordered the way everything else in `espalier`
orders siblings — directories before files, then lexicographic:

    src/**
    test/**
    README.MD
    main.ts

## What is left out, and why it is the interesting half

Four paths are missing from that list, each excluded by a different route.

`package.json` is absent because `--lang javascript` wrote it into `ignore` a
few lines above. `.github/workflows/ci.yml` is absent because the always-written
common list did. `build/**` is absent because `.gitignore.fixture` says `build/`
and `-i` named that file, so `ignoreFiles` will exclude it at every run. And
`.gitignore.fixture` itself is absent because a file `ignoreFiles` names is
configuration this run read, invisible for the same reason the config is.

Writing any of them down would be recording something that was never going to
be reported, which is how a backlog becomes a junk drawer.

The ignore file is not called `.gitignore`, because git honours that name and
would hide `build/out.js` from the repository — the fixture would arrive at the
next clone missing the file it is about. `-i` exists partly so that choice is
available; the refusals that need the real filename live in
`test/candidates.test.ts`.

`.github/` is the one that pins matching semantics. Its entry is directory-only,
and the check has to ask about a directory by name — `ignores()` assumes its
last segment is a file everywhere else, so without an explicit directory flag
the entry silently never matches and `.github/**` ends up in the generated
config.

`README.MD` **is** listed, because it is deliberately not in any shipped list:
a README per package directory is a convention an espalier might well hold.
`shipped-ignore-lists` pins the other side of that same decision.

## `--ignore-file`

`-i .gitignore.fixture` is what makes the run succeed at all. `init` insists on
an ignore file it can find, and there is no `.gitignore` here — `init-bare`
pins the other way out of that, `--no-ignore-file`.

Pins: cli/init/README.MD "`--ignore-all`", "`--lang`", "`--ignore-file` and
`--no-ignore-file`"; CONFIG.MD "What is ignored without being configured".
