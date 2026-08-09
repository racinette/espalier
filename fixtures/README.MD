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
```

The fixture directory *is* the repository root — config discovery finds `espalier.config.yaml` there and every path resolves relative to it. Fixtures are not git repositories, so the runner uses the filesystem walk described in [CONFIG.MD](../docs/CONFIG.MD#what-counts-as-a-file).

`FIXTURE.MD` and `expected.json` are ignored by every fixture config. They are scaffolding for the harness, not part of the repository under test, and strict enforcement would otherwise report them as `unexpected_path` in all nine cases. `espalier.config.yaml` needs no such entry — it is invisible unconditionally.

## `expected.json`

```json
{
  "exit": 1,
  "issues": [ ... ],
  "explain": { "<path>": { ... } }
}
```

**`exit`** — the process exit code. `0` clean, `1` violations, `2` operational failure.

**`issues`** — every issue the run must produce, in output order: sorted by path, rule, line, column, code.

**Only the fields present are compared.** An expected issue naming `path`, `code` and `severity` asserts nothing about `line` or `ruleText`. This keeps fixtures readable and stops them failing over cosmetic changes to fields they were not written to test.

**`explain`** — expected `espalier explain --format jsonl` output for specific paths. Ownership is invisible in lint output when a repository is clean, so fixtures that pin *which rule owns what* assert it here rather than contriving a violation to make it observable.

**`error`** — for `exit: 2`, the operational failure that must be reported. The espalier never compiles, so `issues` is empty.

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
| `requiredness-dynamic-directory` | static descendants become required per instantiated dynamic directory |
| `unexpected-path-recognized-node` | the deepest recognized node, in all three degradation cases |
| `constraints-require-owner` | constraints do not run on files no structural rule owns |
| `constraint-scope` | subtree and extension scoping; recursive captures as arrays |
| `emit-path-override-and-dedup` | an issue attached elsewhere; identical issues collapsing |
| `invalid-overlapping-siblings` | two dynamic siblings that can match the same filename |
| `invalid-capture-names` | one dynamic directory described under two names |
| `invalid-ignored-required-file` | a required static leaf that `ignore` also matches |

## Adding one

A fixture earns its place when prose in the specification could be read two ways. Write `FIXTURE.MD` first, saying which sentence of which document it pins — if that cannot be written, the case is probably covered already.
