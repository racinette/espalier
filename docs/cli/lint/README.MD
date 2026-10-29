# `espalier lint`

Validates the repository against the espalier. This is where enforcement happens — everything `espalier build` produces is advisory, and `lint` is what makes the advice true.

```bash
espalier lint
espalier lint src/clients
espalier lint --format jsonl
```

## Usage

```text
espalier lint [paths...]

  paths                 restrict the run to these files and directories

  --format human|jsonl  output format (default: human)
  --out <dest>          stdout, stderr, or a file path (default: stdout)
  --rule <module>       run one rule module only
  --config <path>       use this config file instead of discovering one
  --no-guidance        omit guidance bodies from output
  --jobs <n|auto>       maximum workers (default: lint.jobs, otherwise auto)
```

## What it does

1. **Compile the espalier.** Load the config, read the tree, parse every path into a pattern, import every rule module, validate its exports, build the matcher, and render computed descriptions, guidance, and directory guidance. Anything wrong here — an ambiguous espalier, a module that fails to import, a missing `guidance` export, a guidance callback that fails — stops the run before repository linting begins. Workers receive rendered guidance text and descriptions; they do not evaluate those callbacks. `--no-guidance` suppresses output, not compilation or callback validation.
2. **Collect files.** Walk the filesystem from the repository root, never descending into a directory an exclusion matches, then drop the unconditionally invisible paths. Symlinks are followed, a link onto a directory containing it is not, and a traversal failure stops the run. Nothing consults git. See [CONFIG.MD](../../CONFIG.MD).
3. **Resolve ownership.** Each file gets exactly one structural owner, or none. Files with no owner report `unexpected_path` and are otherwise left alone. A match of an abstract contract that no instance declares reports `undeclared_instance`. Required named leaves with no file report `missing_required_file`; absent required named directory instances report `missing_required_directory`; collections below their minimum report `missing_required_match`. See [MATCHING.MD](../../MATCHING.MD).
4. **Prepare execution.** Capture governed source contents, await addon preparation, and initialize all participating workers.
5. **Run rules.** For every owned file: its inherited structural checks and local `lint`, plus each per-file constraint whose directory pattern and selector admit it. Run each aggregate once over its complete selected group, and each grouping of a dynamic rule once per group of files sharing its `by` captures in one directory.
6. **Report and clean up.** Report distinct issues from each invocation as they arrive, then dispose worker-local addons.

Rules execute independently and in unspecified order. A rule may read any governed file through `read` and list governed files through `files`, but must not depend on another rule having run. Helpers and addons receive repository contents from those functions. Shared analysis may reuse identical inputs when answers remain independent of previous calls. See [TYPES.MD](../../TYPES.MD#execution).

For expensive custom checks, measure program construction and analysis queries
separately from total lint time. `espalier examples compiler-addon` provides a
shared compiler pattern and a profiling recipe; its tiny correctness fixtures
are not a performance benchmark.

## Constraint selection

A constraint selects files by either a filename extension or an exported
`targets` array of relative positive globs. An extensionless filename requires
`targets`; a filename with an extension forbids it. A filename selector matches
the complete extension exactly: `.ts` does not include `.d.ts`. A target glob
such as `**/*.ts` matches both names. Selectors intersect the
constraint's directory pattern and cannot make an ignored, ungoverned, or
structurally unowned path admissible. Per-file constraints run once per
selected path; aggregates receive the complete selected set. See
[MATCHING.MD](../../MATCHING.MD#target-selectors).

## Aggregate constraints

A constraint exporting `aggregate = true` runs once over its complete selected
population rather than once per file. Its filename extension or `targets`
selects that population by the same rule as a per-file constraint. Its sorted
`matches` retain each file's captures, and the group may be empty. The callback receives
`patterns`, the admission globs, rather than a singular `pattern`. See
[TYPES.MD](../../TYPES.MD#aggregate).

Aggregate execution is not a post hook. It cannot observe findings or mutable
state from ordinary rules, whose order remains unspecified. It is one ordinary
deterministic invocation whose input happens to be a set of matches.

The match set is complete even during a scoped lint. If the requested scope
intersects a selected member, the rule receives its whole repository-wide
group; calculating an average over only the CLI selection would make the same
repository pass or fail depending on how lint was invoked. An empty group uses
the constraint's static prefix to decide whether it intersects the scope.

Choosing whether an obligation is per-file or aggregate is
[`espalier help authoring`](../help/README.MD).

## Groupings

A dynamic structural rule may export `groups`, naming subsets of its captures
that identify groups of its files: the steps of one migration set, say, by
number and group name. Each grouping's `lint` runs once per distinct value of
those captures per directory, with the members and the shared captures. Groups
are induced by the files present, so none is empty. See
[TYPES.MD](../../TYPES.MD#groups).

A grouping is scoped like an aggregate: if the scope reaches one member, the
grouping receives the whole group. Its issues carry the rule's module path,
the grouping's name as `group`, the shared captures, and the grouping's own
guidance text; the default issue path is the group's directory.

## Scoping

A path argument restricts the file set, at the cost of completeness:

- `unexpected_path` is reported for files in scope
- `missing_required_file` is reported only for required leaves inside the scope
- `missing_required_match` is reported only for containing directories inside the scope, counting their full owned membership
- structural and per-file constraint invocations are limited to owned files in scope; an aggregate whose selection intersects the scope still receives its complete group, and so does a grouping one of whose members is in scope

A scoped run cannot tell you the repository conforms — only that the part you asked about does. The human summary says so explicitly. **CI runs unscoped.**

Use an unscoped run to establish repository conformance. A scoped run only establishes conformance within the requested scope.

There is no `--staged`. A hook that genuinely wants a narrow run already knows which files it is about to commit, and passing them as arguments is one shell substitution — `espalier lint $(git diff --name-only --cached)`. Building that into the tool would have meant a git-index dependency, a flag whose behaviour nobody could pin without making fixtures into git repositories, and a second spelling of scoping that already exists.

## Parallel execution

Lint callbacks execute in Node worker threads with separate JavaScript heaps.
The coordinator owns repository discovery, preparation, scheduling, and output.

Without an explicit CLI or API jobs option, each project uses
[`lint.jobs`](../../CONFIG.MD#lintjobs), defaulting to `auto`. An explicit
number or `auto` overrides every project's setting for this invocation;
otherwise nested projects use their own defaults.

`--jobs auto` uses up to four workers, bounded by available CPU parallelism and
the number of jobs. `--jobs N` accepts a positive safe integer and caps the
worker pool at N; `--jobs 1` uses the same worker lifecycle with serial execution.
The API spelling is `check({ cwd: ".", jobs: N })` or
`check({ cwd: ".", jobs: "auto" })`.

The coordinator resolves ownership, captures a governed source snapshot, and
awaits addon preparation. It starts only the workers needed for the selected
jobs, with one worker even when there are no jobs so the addon lifecycle remains
well-defined. All worker setups finish before any lint callback starts.

One file and its applicable structural/per-file rules form a job. Each aggregate
is one job containing its complete selected match set, and so is each group of
a grouping. Free workers take the next
job from the queue. Rules and their context API remain unchanged; rules must not
rely on worker assignment or invocation order. Findings are reported centrally
as they arrive. Findings, including metadata, must support structured cloning
to cross the worker boundary. The issue set is independent of the worker count; stream order
is unspecified. Duplicate suppression remains local to each invocation.

Each worker pays the CPU and memory cost of addon `setup`. Building a compiler
program in every worker can dominate a small lint run, making additional
workers more expensive without reducing elapsed time. Compare worker counts
on the actual project and set `lint.jobs` accordingly. Share transferable
analysis through `prepare` where possible; live compiler resources remain
local to each worker.

Nested projects run in turn, each with separate preparation and worker-local
addons. Their pools do not overlap, so the job limit bounds the whole command.
An initialization failure prevents all lint jobs in that project. An execution
failure stops dispatch, allows active jobs to finish, disposes initialized
addons, and fails the project. An unexpected worker exit is an operational
failure, including exit code zero. Successful results from a partial failed run
are not a conformance claim.

Every selected check executes on every run. No persistent findings cache is
read or written. `--cache` is not an accepted option. Per-run source snapshots
and addon analysis reuse do not persist findings between runs.

## Nested espaliers

A directory holding an `espalier.config.yaml` of its own is a child espalier, and its subtree belongs to it rather than to the outer one. See [CONFIG.MD](../../CONFIG.MD#nested-espaliers).

`lint` runs them all. The outer run finishes first — including `addons` disposal, since a child shares nothing with it — and each child is then visited in turn as a complete separate run. A child's own children are found by the child's run, so nesting has no depth limit.

**Paths are re-rooted.** A child reports paths relative to itself; the outer run rewrites them relative to where the command was invoked, so `packages/web/src/index.ts` reads the same whether it came from the root espalier or the one inside `packages/web`. The `espalier` field on the issue says which one spoke.

**Scoping applies first.** A child whose directory does not intersect the path arguments is not run at all. `espalier lint packages/api` visits the espalier in `packages/api` and no other.

**A child that fails does not stop its siblings.** The run reports the failure with its `espalier` field set, continues to the next child, and exits `2`. This is the one place a failure is not the end of the run, and the partition is why: the outer espalier and every sibling are complete without it, and a broken package hiding a violation in another package would be a worse report than the one that names both. What a `2` promises is unchanged — the output is partial, however much of it arrived.

## Issues

An issue is one finding at one path. JSONL issue fields come from the `emit`
call, plus what the runner knows:

| Field | |
|---|---|
| `path` | repo-relative path the issue is attached to |
| `code` | machine-readable identifier, from the rule |
| `message` | human-readable description, from the rule |
| `severity` | `error`, `warning`, or `info`; defaults to `error` |
| `rule` | espalier-relative module path, or `null` for built-in issues |
| `group` | the grouping that reported it; present only on a grouping's issues |
| `espalier` | repo-relative directory of the espalier that reported it, or `null` for the one this command loaded |
| `pattern` | the rule's declaration as authored, without `.mjs`, or `null` for built-in issues |
| `captures` | values from placeholders in the declaration; for a grouping, the values its members share |
| `line`, `column` | 1-based, or `null` |
| `metadata` | arbitrary structured data from the rule |
| `guidance` | the module's `guidance` body, or the grouping's |

Human output uses the rendered description in rule headings. The JavaScript
API also exposes `description` and `referenceImplementation` on its `Issue`
objects; JSONL lint issue records omit those two fields. JSONL `explain`
records include descriptions.

`rule` is the module's path in the espalier — `clients/[provider]/client.ts.mjs` — because that is the thing you open to change the behaviour. Identity never derives from description prose, which collides and changes.

**`guidance` is included by default,** in both formats. Delivering the rule at the moment it was violated is the mechanism by which agents learn what the repository expects; a violation that says only "this is wrong" wastes the one moment the agent is guaranteed to be paying attention. `--no-guidance` drops it for machine consumers that do not need it.

### Attaching an issue elsewhere

A rule may attach its issue to a different path than the one being linted:

```js
emit({
  path: "clients/registry.ts",
  code: "unregistered_client",
  message: `${provider} is not listed in the registry`,
});
```

A rule that discovers a problem while examining one file can report it against the file that must change.

The target must be a repository-relative path inside the repository. It does not have to be governed, declared, or even to exist: a rule may well find that the file which must change is one the espalier has not got around to describing yet, and refusing to report that would punish exactly the person doing the work incrementally. An absolute path, or one escaping the root, is malformed rather than merely undeclared and fails the run.

A rule invoked separately for forty files can report the same conclusion forty
times. Deduplication is local to one invocation; use an aggregate constraint
when the conclusion belongs to the group.

### Built-in issues

These codes come from matching rather than from a rule module. Their `rule` is `null` and their severity is fixed at `error`; the "severity is decided by the rule" principle does not apply where no rule exists to decide.

`unexpected_path` — no structural rule owns this file.

`missing_required_file` — a required static or resolved leaf has no corresponding file in its owning branch. A leaf whose module exports `optional = true` never reports it, at any depth or in any instance of a dynamic directory.

`missing_required_directory` — a required named `instanceOf` directory does
not exist. Its contents can all be optional and the directory itself still be
required. An optional instance is permitted to be absent, but its required
contents are checked when it exists.

`missing_required_match` — a dynamic leaf with `minMatches = N` owns fewer
than N files in an existing owning directory or on the required static spine.
Named specializations count toward their inherited collections. The path is its containing directory
(`.` at the root); metadata names `declared`, `rule`, and enclosing `captures`.
The check uses the full governed file set, even during a partial run, but
reports only collections whose containing directory is inside the scope.

`undeclared_instance` — an abstract contract admits this file, or this
directory reported with a trailing slash, and no instance declares it. The
message names the module to write; `metadata.contract` is the contract's
declaration, `clients/[provider].ts` or `app/[route]/`. The path
is owned, so the contract's own checks still run. See
[INSTANCES.MD](../../INSTANCES.MD).

`unexpected_path` carries the **deepest recognized node** in `metadata`: how far the path was recognized by the espalier, and what is declared at that point. It is never a ranked guess at where the file belongs — see [MATCHING.MD](../../MATCHING.MD).

```json
"metadata": {
  "recognized": "clients/[provider]",
  "captures": {"provider": "acme"},
  "declared": ["client.ts", "requestModels.ts"]
}
```

## Output

`--format` chooses the encoding and `--out` chooses the destination. The two are independent, and everything the run has to say — issues, the partial-run warning, an operational failure — goes through the chosen format to the chosen destination. There is no second channel and no message that arrives by another route, so nothing depends on the reader having guessed which stream it landed on. A consumer that wants two of them runs the command twice.

### `human`

The default. Issues are grouped by path, then by the Espalier and rule module
that emitted them. Each group's guidance text and reference implementation appear
once, before its findings. Groups follow first occurrence; findings retain
their arrival order within each group. Distinct modules remain separate even
when their prose is identical. Every finding is printed, including findings
sharing a location, code, or message. The summary counts findings, not groups.

```text
clients/acme/random.ts
  error  unexpected_path   this path is not declared in the espalier

    The espalier recognizes  clients/[provider]/   (provider = "acme")
    Declared there:
      client.ts
      requestModels.ts

clients/stripe/client.ts

    Guidance (the provider's HTTP client):
      Export a single create<Provider>Client(config) factory.
      All requests go through the shared request helper.

    Reference implementation: clients/twilio/client.ts

  12:3  error  missing_factory   no create<Provider>Client factory is exported

2 errors
```

Built-in issues have no rule behind them, so they show the deepest recognized
node beside each finding. `--no-guidance` omits prose while retaining every
finding and the reference implementation, when present.

`referenceImplementation` is a repository path and reads as one line:
`Reference implementation: <path>`. Inline source is deliberately unsupported;
the report only points to validated code in the repository.

### `jsonl`

One JSON object per line, nothing else. No header, no summary object, no wrapping array, so a consumer can process the stream without buffering it.

Every line carries a `kind` — `issue`, `warning`, or `failure`. A reader dispatches on one field rather than inferring from which keys happen to be present, and a line whose `kind` it does not recognize is one it can skip rather than one it misreads.

```json
{"kind":"issue","path":"clients/acme/random.ts","code":"unexpected_path","message":"…","severity":"error","espalier":null,"rule":null,"pattern":null,"captures":{},"line":null,"column":null,"metadata":{"recognized":"clients/[provider]","captures":{"provider":"acme"},"declared":["client.ts","requestModels.ts"]},"guidance":null}
{"kind":"issue","path":"clients/stripe/client.ts","code":"missing_factory","message":"…","severity":"error","espalier":null,"rule":"clients/[provider]/client.ts.mjs","pattern":"clients/[provider]/client.ts","captures":{"provider":"stripe"},"line":12,"column":3,"metadata":{},"guidance":"…"}
{"kind":"warning","message":"partial run: 3 of 214 files checked. A scoped run cannot tell you the repository conforms."}
{"kind":"failure","code":"ambiguous_siblings","message":"…"}
```

### Ordering and duplicates

The runner promises nothing about the order issues arrive in. Within one lint
invocation, it reports the first occurrence of each distinct finding and drops
identical repeats. Equality uses the normalized path, code, message, severity,
line, column, and deeply equal metadata; object key order does not matter.
Omitted defaults and their explicit equivalents describe the same finding.

Different locations, severities, or metadata remain distinct. Separate rules
and separate invocations keep their findings, even when the reported fields
agree: their matches and captures can carry different meaning. The same
behavior applies to per-file and aggregate rules, every worker count, and the API.

Presentation is the formatter's business, and formatters may buffer. `human`
groups by path and rule identity. `jsonl` does not reorder or group anything;
each issue retains its own guidance text unless `--no-guidance` is selected.

## Exit codes

| | |
|---|---|
| `0` | no error-severity issues |
| `1` | one or more error-severity issues |
| `2` | operational failure |

In a repository with child espaliers the code is the worst of every run: `2` if any espalier failed, otherwise `1` if any reported an error-severity issue, otherwise `0`.

Warnings and info do not fail the run. There is no flag to make them fail: severity belongs to the rule that emits it, and a project that wants a build to break changes the rule rather than the invocation. One rule, one answer, everywhere it runs.

### Failures are not issues

An operational failure means `espalier` could not complete its job. It exits `2`
and reports the failure through the chosen format and destination:

- config missing, malformed, or contradictory
- the espalier is ambiguous, or a rule path is invalid
- a rule module fails to import, or is missing a required export
- addon preparation, setup, or disposal fails
- prepared data cannot be cloned, or a worker exits unexpectedly
- a path under the root cannot be read
- a `lint` function throws

A rule that throws is a bug in the rule, not a finding about the repository. Degrading it to a warning would let a broken espalier report a clean repository, which is the one outcome this tool exists to prevent.

Configuration and compilation failures stop the run before rules execute.
A failure during execution can leave findings already emitted in the output.
The exit code is the authority on whether the run means anything: a `2` says
the output cannot establish conformance, however much of it arrived.

Every operational failure code is listed in [ERRORS.MD](../../ERRORS.MD).

`missing_required_directory` reports an absent required named directory
instance, including an instance whose inherited contents are all optional.
Optional instances are checked when present. Inherited file checks execute
before local checks in the same per-file job. `--rule` selects the authored
module, including a shared base module. Findings retain that module's pattern
and captures.
