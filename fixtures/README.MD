# Conformance fixtures

Each directory here is a complete miniature repository — a config, an espalier, the files being governed, and the exact outcome expected. Together they are the executable form of [MATCHING.MD](../docs/MATCHING.MD) and [cli/lint/README.MD](../docs/cli/lint/README.MD).

They were written from the specification, before the implementation. That order matters: fixtures written afterwards describe whatever got built, and cannot disagree with it.

## Layout

```text
<fixture>/
  FIXTURE.MD            what this case pins down, and why
  espalier.config.yaml
  espalier/             the espalier tree
  <repository files>    at the fixture root, as in a real project
  expected.json         the expected outcome
  expected-build/       build fixtures only: the tree build must produce
```

The fixture directory *is* the repository root — config discovery finds `espalier.config.yaml` there and every path resolves relative to it. Fixtures are not git repositories, so the runner uses the filesystem walk described in [CONFIG.MD](../docs/CONFIG.MD#what-counts-as-a-file).

`FIXTURE.MD` and `expected.json` are ignored by every fixture config. They are scaffolding for the harness, not part of the repository under test, and strict enforcement would otherwise report them as `unexpected_path` in every case. `espalier.config.yaml` needs no such entry — it is invisible unconditionally.

## `expected.json`

```json
{
  "exit": 1,
  "issues": [ ... ],
  "explain": { "<path>": { ... } }
}
```

**`exit`** — the process exit code. `0` clean, `1` violations, `2` operational failure.

**`issues`** — every issue the run must produce, and no others. Order is not compared: the runner does not promise one, so a fixture asserting one would be pinning an accident. Count is compared — two identical issues are not one issue, now that nothing is deduplicated.

**Only the fields present are compared.** An expected issue naming `path`, `code` and `severity` asserts nothing about `line` or `ruleText`. This keeps fixtures readable and stops them failing over cosmetic changes to fields they were not written to test. The rule applies at every depth, so an expected `metadata` naming two keys asserts nothing about a third.

**`explain`** — expected `espalier explain --format jsonl` output for specific paths. Ownership is invisible in lint output when a repository is clean, so fixtures that pin *which rule owns what* assert it here rather than contriving a violation to make it observable.

**`error`** — for `exit: 2`, the operational failure that must be reported. The espalier never compiles, so `issues` is empty.

**`build`** — present only on build fixtures. `exit` is the build run's exit code, `args` any extra flags, and `report` the lines it must print, compared as an unordered multiset with the same partial-field rule as `issues`.

```json
{
  "build": {
    "exit": 0,
    "args": ["--check"],
    "report": [{ "kind": "drift", "path": "AGENTS.MD", "state": "changed" }]
  }
}
```

`exit` and `issues` describe a `lint` run and `build` describes a `build` run; a fixture may carry either or both, and the harness runs only what is asserted.

## `expected-build/`

The tree `espalier build` must produce, compared **byte for byte**, both ways: every file in `expected-build/` must exist with exactly those bytes, and every generated file the run produced must appear in `expected-build/`. Nothing is partial here. `build` promises byte-comparable output and a golden tree is the only assertion that holds it to that.

The harness copies the fixture to a scratch directory before running `build`, excluding `FIXTURE.MD`, `expected.json` and `expected-build/` itself, and compares what `build` left behind. Fixtures are never written into.

**A build fixture with no `expected-build/` asserts that the tree is untouched** — byte-identical to the copy the run started from. That is the assertion for `--check`, which promises to write nothing, and for a run that halts, which must halt before writing rather than partway through. "It failed" and "it failed cleanly" are different claims, and only the second one is worth having.

The cost is that changing the render template touches every build fixture at once. That is the point: a template change is a change to the product's most-read surface, and it should be visible in a diff rather than absorbed by a substring match.

## Instrumented rules

Some fixtures need to observe that a rule *ran*, not that it found something. Those modules emit an `info` issue naming themselves:

```js
export async function lint({ emit }) {
  emit({ code: "ran_no_as_any", message: "constraint ran", severity: "info" });
}
```

That is a fixture technique, not a pattern for real espaliers. `info` does not affect the exit code, so a fixture asserting which constraints ran can still assert `exit: 0`.

## The cases

| Fixture | Pins |
|---|---|
| `ownership-static-beats-dynamic` | precedence between a static and a dynamic leaf; captures on the winner |
| `ownership-dynamic-directory-and-leaf` | overlapping dynamic siblings that compete for different roles |
| `requiredness-dynamic-directory` | static descendants become required per instantiated dynamic directory |
| `unexpected-path-recognized-node` | the deepest recognized node, in all three degradation cases |
| `constraints-require-owner` | constraints do not run on files no structural rule owns |
| `constraint-scope` | subtree and extension scoping; recursive captures as arrays |
| `emit-path-override` | an issue attached to a file other than the one being linted |
| `invalid-overlapping-siblings` | two dynamic siblings that can match the same filename |
| `invalid-capture-names` | one dynamic directory described under two names |
| `invalid-ignored-required-file` | a required static leaf that `ignore` also matches |
| `build-placement-and-pruning` | placement, pruning, ordering, and every part of the rendered document |
| `build-double-catch` | two open sets described in one closed-set statement; the root is never pruned |
| `build-unmarked-documentation` | a hand-written documentation file halts the run before anything is written |
| `build-orphan-deletion` | orphans deleted, unchanged files left alone |
| `build-check-drift` | `--check` reports `missing`, `changed` and `stale`, and writes nothing |
| `build-inline` | one document at the root, and the distributed run's files removed |

## Adding one

A fixture earns its place when prose in the specification could be read two ways. Write `FIXTURE.MD` first, saying which sentence of which document it pins — if that cannot be written, the case is probably covered already.
