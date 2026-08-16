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

`package.json` and `.github/workflows/ci.yml` are absent because
`defaultIgnore` already covers them. Writing them down would be recording
something that was never going to be reported, which is how a backlog becomes
a junk drawer.

`.github/` is the one that pins matching semantics. Its entry in the default
list is directory-only, and the check has to ask about a directory by name —
`ignores()` assumes its last segment is a file everywhere else, so without an
explicit directory flag the entry silently never matches and `.github/**` ends
up in the generated config.

`README.MD` **is** listed, because it is deliberately not in the default list:
a README per package directory is a convention an espalier might well hold.
`default-ignore-list` pins the other side of that same decision.

Pins: cli/init/README.MD "`--ignore-all`"; CONFIG.MD "`defaultIgnore`".
