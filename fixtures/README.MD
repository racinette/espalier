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
  expected-init/        init fixtures only: the tree init must produce
  expected-adopt/       adopt fixtures only: the tree adopt must produce
  human/                golden --format human output, byte for byte
```

A fixture may contain a symlink; git stores one, and the harness copies verbatim so a relative link still means what it was written to mean. An absolute link would be a link to the machine it was written on, so fixtures use relative ones.

The fixture directory *is* the repository root — config discovery finds `espalier.config.yaml` there (except for init fixtures, which are testing it being written) and every path resolves relative to it. Fixtures are not git repositories, so the runner uses the filesystem walk described in [CONFIG.MD](../docs/CONFIG.MD#what-counts-as-a-file).

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

**`error`** — the `code` of an expected `kind: "failure"` line. A fixture needing to pin another of its fields — which espalier reported it — gives an object instead, compared by the same partial rule as everything else.

**`human`** — a file holding the exact `--format human` stdout of the same lint run, compared byte for byte.

**`warnings`** — the warning messages a run must emit, in order, and no others. At the top level it describes the `lint` run; inside an `init`, `build` or `adopt` block it describes that one. A warning is advice about the run rather than part of the record of it, so it is compared separately from `issues` and from `report`. Only `lint` emits one today — this key is per-command because a warning belongs to the run that produced it, not because every command has one. A scoped `lint` uses it to say how much of the repository it actually checked, which for a run spanning child espaliers is one line per espalier and the only place a child that was visited and found nothing differs from one that was never visited at all.

**`args`** — extra arguments for the `lint` run, and for its `again` rerun. Scoping is the one thing about `lint` that cannot be expressed by the tree alone: a fixture pinning what a path argument does has to be able to pass one. Everything else the harness runs — `explain`, the ownership sweep — is unscoped regardless, because those answer questions about the espalier rather than about a run.

```json
"args": ["packages/api"]
```

**`env`** — environment the lint run is given, on top of the harness's own. Only an impure rule has any use for it, and only one fixture family has a use for an impure rule: warm and cold output are identical by design, so a token the runner cannot see is the only way a skipped rule becomes visible.

**`again`** — a second `lint` over the same copy, after something changed. Only an incremental run has anything to say here; a fixture that reran without a cache would be asserting that the same input gives the same answer.

```json
"again": {
  "apply": "after",
  "delete": ["src/gone.ts"],
  "env": { "ESPALIER_FIXTURE_TOKEN": "second" },
  "exit": 0,
  "issues": [ ... ]
}
```

`apply` names a directory in the fixture copied over the repository — files to add, or to replace. `delete` removes paths. `env` applies to this run alone. `exit` and `issues` are compared exactly as the first run's are. A fixture with an `after/` directory ignores it in its config, like the rest of its scaffolding.

**`explain`** — expected `espalier explain --format jsonl` output for specific paths. Ownership is invisible in lint output when a repository is clean, so fixtures that pin *which rule owns what* assert it here rather than contriving a violation to make it observable.

```json
"explain": {
  "clients/stripe/client.ts": {
    "exit": 0,
    "object": { "rule": "clients/[provider]/client.ts.mjs" }
  }
}
```

`exit` is the process exit code — `0` declared, `1` not — and `object` is the single line the run emitted, compared by the same partial rule as everything else. The exit code is asserted separately because it is process state rather than payload, and because "is this path declared" is the whole question `explain` answers.

An optional `human` names a file, relative to the fixture, holding the exact stdout of the same query at `--format human`. It is compared byte for byte, like a build golden and for the same reason: the layout is fixed by [cli/explain/README.MD](../docs/cli/explain/README.MD#human-layout), and a format nobody pins is a format that drifts. Not every query needs one — pin the shapes, not every instance of them.

**`ownership`** — every file in the fixture, and the rule module that owns it, or `null` for one nothing owns.

```json
"ownership": {
  "clients/registry.ts": "clients/[summary].ts.mjs",
  "clients/stripe/client.ts": "clients/[provider]/client.ts.mjs",
  "package.json": null
}
```

Unlike everything else here, this one is **exhaustive**: the harness walks the fixture itself and every file it finds must appear in the map, with no extras. Partial comparison is what makes the other keys readable; it is also what made ownership invisible.

A clean run says nothing about who owns what. A matcher that handed every file to the wrong rule would still exit `0` with no issues, and until now the only thing making ownership observable was an `explain` assertion — which covers the paths a fixture happened to name and no others. Six fixtures asserted `exit: 0` and between them pinned four owners.

**A fixture that runs `lint` should carry an `ownership` map.** It costs a line per file and it is the only assertion that fails when a file quietly changes hands.

## The agreement sweep

Every fixture whose espalier compiles is also swept for **disagreement between commands**, whether or not it wrote anything asking for it. Nothing needs to be added to `expected.json`; there is nothing to write.

The sweep asserts relationships rather than answers:

- A path `explain` calls owned is a path `lint` enumerated. Claiming an owner for a file no walk reached is how a symlink came to be governed by one command and invisible to the other.
- A path nothing excluded is a path something enumerated. There is no third category.
- What `explain` says excludes a path is what the repository says excludes it.
- For every directory holding a governed file, `explain` on that *prefix* declares the rule that owns it. The prefix form walks the trie itself instead of resolving one path through it, so this is the half that catches a walk losing its captures on the way down — the node it fails to reach declares nothing, and every owner beneath it goes missing. Asking `explain` about a *file* would not: that path resolves through the same function `lint` does, and comparing a function with itself pins nothing.

Paths inside a child espalier are answered by that child, so the sweep opens it and asks it, rather than comparing two different questions.

This exists because the bugs that have actually happened here were not wrong answers, they were two commands giving different ones — and every assertion above this line describes a single command's output. Line coverage cannot see it either: the code was running the whole time. Nobody had compared the results.

**`stderr`** — fragments the `lint` run must write to stderr. For effects with no reporting channel: addon disposal happens after the last issue is emitted and after the exit code is decided, so a marker on stderr is the only way to see it happened.

**`error`** — for `exit: 2`, the operational failure that must be reported. The espalier never compiles, so `issues` is empty.

**`adopt`** — present only on adopt fixtures, and shaped exactly like `init` and `build`: `exit`, `args` (the target directory goes here), and `report`. Compared against an `expected-adopt/` tree.

**`init`** — present only on init fixtures. `exit` is the run's exit code, `args` any extra flags, and `report` the lines it must print. Like `build`, it runs against a throwaway copy and its result is compared against an `expected-init/` tree — byte for byte, and both ways.

```json
{
  "init": {
    "exit": 0,
    "args": ["--ignore-all"],
    "report": [{ "kind": "written", "path": "espalier.config.yaml" }]
  }
}
```

An init fixture has no `espalier.config.yaml` of its own, because writing one is the thing under test. It is the only kind of fixture that does not, and the harness runs `init` from the fixture root rather than discovering a config.

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

All three write blocks also accept **`human`**, naming a file that holds the exact `--format human` stdout of the same run. It is compared byte for byte, like an `explain` golden and for the same reason: the report's column widths are fixed by the command's page, and a format nobody pins is a format that drifts. `adopt-partial-overlap` carries one because the label column is padded to a width no surviving label reaches — `uncovered` was nine characters and collided with the path beside it, and the golden is what keeps the fix from being quietly undone.

`exit` and `issues` describe a `lint` run and `build` describes a `build` run; a fixture may carry either or both, and the harness runs only what is asserted.

## `expected-build/`

The tree `espalier build` must produce, compared **byte for byte**, both ways: every file in `expected-build/` must exist with exactly those bytes, and every generated file the run produced must appear in `expected-build/`. Nothing is partial here. `build` promises byte-comparable output and a golden tree is the only assertion that holds it to that.

The harness copies the fixture to a scratch directory before running `build`, excluding `FIXTURE.MD`, `expected.json`, `human/`, `expected-init/` and `expected-build/` itself, and compares what `build` left behind. Fixtures are never written into.

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
| `case-sensitive-matching` | names compared case-sensitively, static and dynamic alike |
| `unusual-filenames` | spaces, accents, other scripts, no extension, and a dot-prefixed path |
| `espalier-declares-nothing` | an espalier with no rules: every path is a violation |
| `unexpected-path-recognized-node` | the deepest recognized node, in all three degradation cases |
| `constraints-require-owner` | constraints do not run on files no structural rule owns |
| `constraint-scope` | subtree and extension scoping; recursive captures as arrays |
| `constraint-extension-list` | a constraint leaf listing two extensions, and the file it must not visit |
| `constraint-after-recursive` | a constraint with segments after `[...path]`, matched from the end and not captured |
| `emit-path-override` | an issue attached to a file other than the one being linted |
| `invalid-overlapping-siblings` | two dynamic siblings that can match the same filename |
| `invalid-capture-names` | one dynamic directory described under two names |
| `invalid-ignored-required-file` | a required static leaf that `.espalierignore` also matches |
| `build-placement-and-pruning` | placement, pruning, ordering, and every part of the rendered document |
| `build-double-catch` | two open sets described in one closed-set statement; the root is never pruned |
| `build-unmarked-documentation` | a hand-written documentation file halts the run before anything is written |
| `build-orphan-deletion` | orphans deleted, unchanged files left alone |
| `build-ignored-generated` | an ignored path is not swept, and a real orphan still is |
| `nested-lint-recursion` | a child is found and run, root rules stop at the boundary, paths are re-rooted |
| `lint-scoped-child` | a path argument decides which children run at all, and the outer espalier is scoped too |
| `nested-ignored-config` | a config `.espalierignore` matches is data, not a child |
| `nested-child-failure` | one child that will not compile, and a sibling reported anyway |
| `nested-build-per-child` | each child builds in its own frame, and the outer run sweeps none of it |
| `nested-three-levels` | a child of a child: delegation is a rule, not a first-hop special case |
| `nested-build-child-failure` | one espalier that will not compile, and nothing written anywhere |
| `build-check-drift` | `--check` reports `missing`, `changed` and `stale`, and writes nothing |
| `build-inline` | one document at the root, and the distributed run's files removed |
| `build-empty-rule` | a section with nothing to say is omitted, heading and all |
| `explain-prefix` | both answer shapes, and the rule that decides which one you get |
| `explain-ungoverned` | which list excluded a path, and that ignored is not declared |
| `init-bare` | the config, the espalier root, and the warning about a missing .gitignore |
| `init-ignore-all` | the opt-in backlog, and the three routes that keep paths out of it |
| `init-existing-config` | refusing to overwrite, without touching the tree |
| `init-no-common-ignore` | declining the common block; `--lang` still writes its own |
| `addons-shared-resource` | one setup, one shared object, one disposal |
| `addons-disposed-on-failure` | disposal runs even when a rule throws |
| `invalid-example` | an example that does not match its own rule's pattern |
| `example-inline` | `exampleSource`: exempt from the path checks, fenced when rendered |
| `example-source-one-line` | a one-line source, which the old newline rule could not express |
| `invalid-example-both` | a module setting both example exports is refused, not resolved |
| `optional-leaf` | an optional leaf on the spine and inside a dynamic directory, and both new sentences |
| `invalid-optional` | `optional` on a dynamic leaf is rejected, not ignored |
| `backreference-leaf` | `{name}` resolves, is required per instance, and coexists with a dynamic sibling |
| `backreference-directory` | `{name}` as a directory: a constraint below one still runs, and `explain` still declares it |
| `backreference-with-capture` | a segment holding a back-reference and a placeholder: bound per instance, dynamic tier |
| `invalid-backreference` | a `{name}` with no `[name]` above it never compiles |
| `constraint-only-placement` | a placement point with no trie node, and a generated description |
| `adopt-sibling-directories` | matching siblings become a dynamic directory, and the ignore entry narrows |
| `adopt-partial-overlap` | the shared files are required and the odd one out is declared optional |
| `adopt-optional-directory` | a directory only some siblings have keeps its name, and everything inside it is optional |
| `adopt-repeated-filenames` | files sharing an extension collapse, but not inside a family |
| `adopt-skips-existing` | a second run does not overwrite a written rule body |
| `adopt-dotted-target` | a dot-prefixed target is refused, because no module there would load |
| `adopt-skips-child` | a child inside the target is passed over, not declared optional |
| `adopt-skips-espalier-root` | a target containing the espalier root does not infer from it |
| `adopt-root-target` | the root has no name to singularise, and no empty path segment |
| `adopt-into-child` | a target inside a child is adopted by the child's espalier |
| `adopt-named-after-directory` | a file named for its directory becomes `{client}.ts`, not three optional leaves |
| `lint-cache-replay` | an unchanged file is not linted again |
| `lint-cache-read-dependency` | a rule reruns when a file it read changed, and only that rule |
| `lint-cache-glob-dependency` | a listing that gained a file reruns the rules that listed it |
| `lint-cache-espalier-changed` | an edited espalier discards every entry, not the edited rule's |
| `lint-cache-not-trusted` | a cache written against another espalier is discarded unread |
| `read-ungoverned` | `read` refuses an ignored file, though it exists and is readable |
| `symlink-governed` | a link is the file it points at: owned, listed by `files`, opened by `read` |
| `symlink-cycle` | a link onto an ancestor is not followed, and nothing is reported twice |
| `symlink-broken` | a link pointing nowhere fails the run rather than being stepped over |
| `config-root-spelling` | `root` normalized: a trailing slash decided whether the tool could see itself |
| `ignore-files` | two named ignore files, and `.espalierignore` layered after both |
| `ignore-reinclude` | un-pruning a directory to re-include one committed file out of it |
| `shipped-ignore-lists` | what `--lang` writes covers, and what it deliberately does not |

## Adding one

A fixture needing an `ignoreFiles` source names it **`.gitignore.fixture`**, never `.gitignore`. Git honours a real one, so every path it excluded would be a path `git add -A` silently skips and the next clone never receives. The mechanism under test is `ignoreFiles`, which reads whatever the config names, so the filename is free — and picking a free one is better than committing around git. `explain-ungoverned` and `ignore-files` both do this. `init` takes `-i` for exactly this, so a fixture can exercise the real mechanism under a name git leaves alone. The behaviours that genuinely need the real filename — `init` defaulting to it, and refusing when it is not there — live in `test/candidates.test.ts`, in a temporary directory git never sees.

A fixture earns its place when prose in the specification could be read two ways. Write `FIXTURE.MD` first, saying which sentence of which document it pins — if that cannot be written, the case is probably covered already.
