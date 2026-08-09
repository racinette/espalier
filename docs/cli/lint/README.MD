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
  --rule <module>       run one rule module only
  --staged              lint git-staged files only
  --config <path>       use this config file instead of discovering one
  --no-rule-text        omit rule bodies from output
```

## What it does

1. **Compile the espalier.** Load the config, read the tree, parse every path into a pattern, import every rule module, validate its exports, and build the matcher. Anything wrong here — an ambiguous espalier, a module that fails to import, a missing `rule` export — stops the run before a single repository file is read.
2. **Collect files.** Everything git knows about, minus `ignore` and the unconditionally invisible paths. See [CONFIG.MD](../../CONFIG.MD).
3. **Resolve ownership.** Each file gets exactly one structural owner, or none. Files with no owner report `unexpected_path` and are otherwise left alone. Required leaves with no file report `missing_required_file`. See [MATCHING.MD](../../MATCHING.MD).
4. **Run rules.** For every owned file: its structural rule's `lint`, plus the `lint` of every constraint whose pattern matches it.
5. **Report.** Sorted, deduplicated, in a stable order.

Rules execute independently and in unspecified order. A rule may read any file in the repository, but must not assume another rule has or has not run.

## Scoping

A path argument restricts the file set. This makes `lint` fast enough for a pre-commit hook or an agent stop hook, at the cost of completeness:

- `unexpected_path` is reported for files in scope
- `missing_required_file` is reported only for required leaves inside the scope
- constraint and structural rules run only against files in scope

A scoped run cannot tell you the repository conforms — only that the part you asked about does. The human summary says so explicitly. **CI runs unscoped.**

`--staged` is scoping by another name, restricted to the files git has staged. Same caveat, same warning.

## Issues

An issue is one finding at one path. Fields come from the `emit` call, plus what the runner knows:

| Field | |
|---|---|
| `path` | repo-relative path the issue is attached to |
| `code` | machine-readable identifier, from the rule |
| `message` | human-readable description, from the rule |
| `severity` | `error`, `warning`, or `info`; defaults to `error` |
| `rule` | espalier-relative module path, or `null` for built-in issues |
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

A rule that discovers a problem while examining one file can report it against the file that must change. Identical issues emitted by several invocations collapse — see deduplication below.

### Built-in issues

Two codes come from matching rather than from a rule module. Their `rule` is `null` and their severity is fixed at `error`; the "severity is decided by the rule" principle does not apply where no rule exists to decide.

`unexpected_path` — no structural rule owns this file.

`missing_required_file` — a required static leaf has no corresponding file.

`unexpected_path` carries the **deepest recognized node** in `metadata`: how far the path was recognized by the espalier, and what is declared at that point. It is never a ranked guess at where the file belongs — see [MATCHING.MD](../../MATCHING.MD).

```json
"metadata": {
  "recognized": "clients/[provider]",
  "captures": {"provider": "acme"},
  "declared": ["client.ts", "requestModels.ts"]
}
```

## Output

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

Built-in issues have no rule behind them, so they show the deepest recognized node instead of rule text. Issues from rule modules show the rule body and its `example`.

### `jsonl`

One JSON object per line on stdout, one per issue, nothing else. No header, no summary object, no wrapping array — every line has the same shape, so a consumer can process the stream without buffering it.

```json
{"path":"clients/acme/random.ts","code":"unexpected_path","message":"…","severity":"error","rule":null,"pattern":null,"captures":{},"line":null,"column":null,"metadata":{"recognized":"clients/[provider]","captures":{"provider":"acme"},"declared":["client.ts","requestModels.ts"]},"ruleText":null}
{"path":"clients/stripe/client.ts","code":"missing_factory","message":"…","severity":"error","rule":"clients/[provider]/client.ts.mjs","pattern":"clients/*/client.ts","captures":{"provider":"stripe"},"line":12,"column":3,"metadata":{},"ruleText":"…"}
```

**stdout is the machine stream; stderr is for humans.** Progress, counts, and the partial-run warning go to stderr in both formats, so `espalier lint --format jsonl > issues.jsonl` produces a clean file and still tells the operator what happened.

### Ordering and deduplication

Output is deterministic regardless of execution order or parallelism. Issues sort by `path`, then `rule`, then `line`, then `column`, then `code`.

Issues identical in `path`, `code`, and `message` collapse to one. A rule that runs against forty files and reports the same registry problem each time produces one issue, not forty.

## Exit codes

| | |
|---|---|
| `0` | no error-severity issues |
| `1` | one or more error-severity issues |
| `2` | operational failure |

Warnings and info do not fail the run. There is no flag to make them fail: severity belongs to the rule that emits it, and a project that wants a build to break changes the rule rather than the invocation. One rule, one answer, everywhere it runs.

### Failures are not issues

An operational failure means `espalier` could not do its job. It exits `2`, reports the failure, and lints nothing:

- config missing, malformed, or contradictory
- the espalier is ambiguous, or a rule path is invalid
- a rule module fails to import, or is missing a required export
- `addons` setup throws
- a `lint` function throws

A rule that throws is a bug in the rule, not a finding about the repository. Degrading it to a warning would let a broken espalier report a clean repository, which is the one outcome this tool exists to prevent.

## Watch mode

**Planned.** `--watch` will keep the runner alive between checks.

Compiling the espalier and starting `addons` is the expensive part of a run, and both are stable while the repository changes. Where a rule depends on a language server or an out-of-process parser, paying that startup on every agent stop is the friction that gets a tool switched off. A persistent runner also makes incremental linting practical, since ownership only needs recomputing for paths that changed.

See [README.MD](../../../README.MD#planned).
