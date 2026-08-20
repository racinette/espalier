# build: an ignored path is not swept for orphans

Generated documentation is identified by its provenance header rather than by
its location, which is what lets `build` distribute output through the tree. The
cost is that the marker says a file is generated documentation and not that it
is *this* run's, and a repository holding a copy of `espalier`'s output has
files a run cannot tell from its own by looking.

## The vendored document

`vendor/AGENTS.MD` carries the marker, and `source:` names a placement point no
espalier here has. It is matched by `ignore`, so it is not a candidate for
deletion and survives untouched — `expected-build/vendor/AGENTS.MD` is the same
bytes it started with.

Without this, the first `espalier build` in the espalier repository deletes
twenty-two golden trees under `fixtures/`, which are marked by construction:
they are the recorded output of the `build` fixtures. Nothing warns, and the
run reports it as ordinary orphan cleanup.

## The real orphan

`src/legacy/AGENTS.MD` also carries the marker, is not ignored, and this
espalier no longer produces it. It is deleted, exactly as in
`build-orphan-deletion`. The two files together are what makes this fixture
guard rather than merely pass: sweeping everything deletes `vendor/`, and
sweeping nothing spares `src/legacy/`, and only one report satisfies both.

Pins: CONFIG.MD "`ignore`" and "Ownership", cli/build/README.MD "Ownership".
