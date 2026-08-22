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
  --no-rule-text        omit rule bodies from output
  --no-cache            re-run every rule, and write no cache
```

## What it does

1. **Compile the espalier.** Load the config, read the tree, parse every path into a pattern, import every rule module, validate its exports, and build the matcher. Anything wrong here — an ambiguous espalier, a module that fails to import, a missing `rule` export — stops the run before a single repository file is read.
2. **Collect files.** Everything git knows about, minus `ignore` and the unconditionally invisible paths. See [CONFIG.MD](../../CONFIG.MD).
3. **Resolve ownership.** Each file gets exactly one structural owner, or none. Files with no owner report `unexpected_path` and are otherwise left alone. Required leaves with no file report `missing_required_file`. See [MATCHING.MD](../../MATCHING.MD).
4. **Run rules.** For every owned file: its structural rule's `lint`, plus the `lint` of every constraint whose pattern matches it.
5. **Report.** Every issue every rule emitted.

Rules execute independently and in unspecified order. A rule may read any file in the repository, but must not assume another rule has or has not run.

## Scoping

A path argument restricts the file set, at the cost of completeness:

- `unexpected_path` is reported for files in scope
- `missing_required_file` is reported only for required leaves inside the scope
- constraint and structural rules run only against files in scope

A scoped run cannot tell you the repository conforms — only that the part you asked about does. The human summary says so explicitly. **CI runs unscoped.**

Speed is not a reason to reach for this. An unscoped run is incremental — see [Incremental runs](#incremental-runs) — and it answers the question a scoped one cannot.

There is no `--staged`. A hook that genuinely wants a narrow run already knows which files it is about to commit, and passing them as arguments is one shell substitution — `espalier lint $(git diff --name-only --cached)`. Building that into the tool would have meant a git-index dependency, a flag whose behaviour nobody could pin without making fixtures into git repositories, and a second spelling of scoping that already exists.

## Incremental runs

`lint` remembers what each rule read and what it found, and skips the rules whose inputs have not changed. A warm run over an unchanged repository does no rule work at all and reports exactly what the cold run reported.

This is what makes running `lint` whole affordable. A hook does not need to work out which files changed and pass them along: scoping trades completeness for speed, and an incremental full run does not.

### What is remembered

The unit is one rule invocation — a module, the pattern that matched, and the path it ran against. For each, the cache holds the paths it read, the globs it listed, and the issues it emitted. An invocation is replayed when all three still hold:

- every path it read has the same size and modification time
- every `files` glob still returns the same list
- the espalier is unchanged

**Nothing is hashed.** Size and modification time come from the file's inode, so a warm run opens no source file at all — its whole I/O is listing the repository, reading the cache, and one `stat` per path some rule depended on. What this leaves open is a file edited within the same second to the same length. Closing it would mean reading every file in the repository on every run, which is the cost being avoided.

**The espalier is all-or-nothing.** Any change under `root`, or to the config, discards the cache entirely. One comparison covers a rule edit, a module the rules import, a renamed node and a changed setting, where tracking them apart would mean walking the module graph. The architect changes the espalier far less often than the repository changes under it. The `addons` module counts as well, since what it returns decides what rules are told. A module *it* imports does not: it lives outside the espalier, where there is no directory to hash and no bound on what could be reached. Editing one is the one change that needs a `--no-cache` run to take effect.

**Structural findings are never cached.** Ownership resolution reads no file contents and runs in full every time, so `unexpected_path` and `missing_required_file` are always fresh. Only rule bodies are skipped.

**A `files` glob depends on which paths exist, not on what is in them.** Editing a sibling does not invalidate a peer comparison; adding or deleting one does.

### What this asks of a rule

A `lint` function must be a function of what it is handed: `path`, `pattern`, `captures`, and whatever `read` and `files` return. One that consults the clock, the network, or the environment will be replayed with an answer it would no longer give, and the failure is silent — a stale pass, not an error. See [TYPES.MD](../../TYPES.MD#execution).

The governed set bounds this. `read` refuses a path the espalier does not govern, with `read_ungoverned`, and `files` never returns one — an ignored or invisible path is one nothing stamps, so a rule that depended on one would be replayed unchanged after it changed. A rule that needs to consult such a file is a rule whose espalier should stop ignoring it.

`addons` are held to the same standard, with one addition: **an addon must not read the repository itself.** A parser handed a path opens a file the run never saw, and that dependency goes unrecorded. Hand it contents, or `read` the path first and throw the string away.

### The cache

`<root>/.cache/lint.jsonl`, inside the espalier. That directory is already invisible to matching and already skipped when the tree is compiled, so the cache needs no rule of its own to stay out of the way. Each espalier writes its own, since a child shares nothing with its parent here either. Add it to `.gitignore`.

**A cache that cannot be used is not an error.** Missing, unreadable, unwritable, corrupt, or written by a version that no longer applies: the run discards it, does the work, and says nothing. A linter that fails over its own bookkeeping is worse than a slow one.

**Entries are merged, never pruned.** A run narrowed by `--rule` or by path arguments leaves invocations unvisited, and an unvisited invocation cannot be told from one that no longer exists. Only a run that is neither drops what it no longer sees.

**`--no-cache`** does the work regardless and writes nothing. There is no config key for it. A project that permanently distrusts the cache is a project whose rules are not pure, and that is something to fix rather than to settle into.

**Nothing in the output says whether an issue was replayed.** Both formats are identical warm and cold, because a hook that behaves differently on a warm cache is a hook nobody can trust.

## Nested espaliers

A directory holding an `espalier.config.yaml` of its own is a child espalier, and its subtree belongs to it rather than to the outer one. See [CONFIG.MD](../../CONFIG.MD#nested-espaliers).

`lint` runs them all. The outer run finishes first — including `addons` disposal, since a child shares nothing with it — and each child is then visited in turn as a complete separate run. A child's own children are found by the child's run, so nesting has no depth limit.

**Paths are re-rooted.** A child reports paths relative to itself; the outer run rewrites them relative to where the command was invoked, so `packages/web/src/index.ts` reads the same whether it came from the root espalier or the one inside `packages/web`. The `espalier` field on the issue says which one spoke.

**Scoping applies first.** A child whose directory does not intersect the path arguments is not run at all. `espalier lint packages/api` visits the espalier in `packages/api` and no other.

**A child that fails does not stop its siblings.** The run reports the failure with its `espalier` field set, continues to the next child, and exits `2`. This is the one place a failure is not the end of the run, and the partition is why: the outer espalier and every sibling are complete without it, and a broken package hiding a violation in another package would be a worse report than the one that names both. What a `2` promises is unchanged — the output is partial, however much of it arrived.

## Issues

An issue is one finding at one path. Fields come from the `emit` call, plus what the runner knows:

| Field | |
|---|---|
| `path` | repo-relative path the issue is attached to |
| `code` | machine-readable identifier, from the rule |
| `message` | human-readable description, from the rule |
| `severity` | `error`, `warning`, or `info`; defaults to `error` |
| `rule` | espalier-relative module path, or `null` for built-in issues |
| `espalier` | repo-relative directory of the espalier that reported it, or `null` for the one this command loaded |
| `pattern` | the normalized glob that matched, or `null` |
| `captures` | values from placeholders in the matched pattern |
| `line`, `column` | 1-based, or `null` |
| `metadata` | arbitrary structured data from the rule |
| `ruleText` | the module's `rule` body |

`rule` is the module's path in the espalier — `clients/[provider]/client.ts.mjs` — because that is the thing you open to change the behaviour. Identity never derives from description prose, which collides and changes.

**`ruleText` is included by default,** in both formats. Delivering the rule at the moment it was violated is the mechanism by which agents learn what the repository expects; a violation that says only "this is wrong" wastes the one moment the agent is guaranteed to be paying attention. `--no-rule-text` drops it for machine consumers that do not need it.

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

A rule that reaches the same conclusion from forty files emits it forty times. Emitting once is the rule's job — see ordering below.

### Built-in issues

Two codes come from matching rather than from a rule module. Their `rule` is `null` and their severity is fixed at `error`; the "severity is decided by the rule" principle does not apply where no rule exists to decide.

`unexpected_path` — no structural rule owns this file.

`missing_required_file` — a required static leaf has no corresponding file. A leaf whose module exports `optional` never reports it, at any depth or in any instance of a dynamic directory.

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

The default. Issues grouped by path, rule text indented beneath, summary last.

```text
clients/acme/random.ts
  error  unexpected_path   this path is not declared in the espalier

    The espalier recognizes  clients/[provider]/   (provider = "acme")
    Declared there:
      client.ts          the provider's HTTP client
      requestModels.ts   request payload types

clients/stripe/client.ts:12:3
  error  missing_factory   no create<Provider>Client factory is exported

    Rule (the provider's HTTP client):
      Export a single create<Provider>Client(config) factory.
      All requests go through the shared request helper.

    Reference implementation: clients/twilio/client.ts

2 errors
```

Built-in issues have no rule behind them, so they show the deepest recognized node instead of rule text. Issues from rule modules show the rule body and its example.

`example` is one line and reads as one: `Reference implementation: <path>`. `exampleSource` is source, so it goes under its own heading and is indented like the rule body rather than interpolated into a sentence — a multi-line value in a `Reference implementation:` line breaks the report's indentation, which is the one thing a fixed layout is for.

```text
    Reference implementation:
      export default function Submit() { … }
```

### `jsonl`

One JSON object per line, nothing else. No header, no summary object, no wrapping array, so a consumer can process the stream without buffering it.

Every line carries a `kind` — `issue`, `warning`, or `failure`. A reader dispatches on one field rather than inferring from which keys happen to be present, and a line whose `kind` it does not recognize is one it can skip rather than one it misreads.

```json
{"kind":"issue","path":"clients/acme/random.ts","code":"unexpected_path","message":"…","severity":"error","espalier":null,"rule":null,"pattern":null,"captures":{},"line":null,"column":null,"metadata":{"recognized":"clients/[provider]","captures":{"provider":"acme"},"declared":["client.ts","requestModels.ts"]},"ruleText":null}
{"kind":"issue","path":"clients/stripe/client.ts","code":"missing_factory","message":"…","severity":"error","espalier":null,"rule":"clients/[provider]/client.ts.mjs","pattern":"clients/*/client.ts","captures":{"provider":"stripe"},"line":12,"column":3,"metadata":{},"ruleText":"…"}
{"kind":"warning","message":"scoped run — 3 of 214 files checked"}
{"kind":"failure","code":"ambiguous_siblings","message":"…"}
```

### Ordering

The runner promises nothing about the order issues arrive in, and never collapses two of them into one. Rules run independently; what they emit is what comes out.

Both are deliberate. Ordering a stream means buffering it, which is the one thing a stream is for not doing, and collapsing issues means discarding one of two findings that agreed on `path`, `code` and `message` while disagreeing on `captures` or `line` — a silent choice between them, made on execution order.

Presentation is the formatter's business, and formatters may buffer. `human` groups by path, because that is how a person reads a report. `jsonl` does not reorder anything.

## Exit codes

| | |
|---|---|
| `0` | no error-severity issues |
| `1` | one or more error-severity issues |
| `2` | operational failure |

In a repository with child espaliers the code is the worst of every run: `2` if any espalier failed, otherwise `1` if any reported an error-severity issue, otherwise `0`.

Warnings and info do not fail the run. There is no flag to make them fail: severity belongs to the rule that emits it, and a project that wants a build to break changes the rule rather than the invocation. One rule, one answer, everywhere it runs.

### Failures are not issues

An operational failure means `espalier` could not do its job. It exits `2`, reports the failure through the chosen format and destination, and lints nothing:

- config missing, malformed, or contradictory
- the espalier is ambiguous, or a rule path is invalid
- a rule module fails to import, or is missing a required export
- `addons` setup throws
- a `lint` function throws

A rule that throws is a bug in the rule, not a finding about the repository. Degrading it to a warning would let a broken espalier report a clean repository, which is the one outcome this tool exists to prevent.

The failures above the run are caught before any file is read, and nothing precedes them. A rule that throws is caught during it, so issues already emitted have already been written. The exit code is the authority on whether the run means anything: a `2` says the output is partial, however much of it arrived.

Every operational failure code is listed in [ERRORS.MD](../../ERRORS.MD).
