# Espalier 0.8.0

Parallel lint execution, required dynamic collections, duplicate-finding
suppression, and configurable architectural initiative for agents.
This release includes breaking changes to caching and addon execution.

## Parallel lint execution and addon lifecycle

- `espalier lint --jobs <n|auto>` and `check({ cwd, jobs })` control a bounded
  Node worker-thread pool. The default, `auto`, uses up to four workers,
  limited by available CPU parallelism and the number of jobs. `--jobs 1`
  runs serially through the same worker lifecycle.
- A file and its structural/per-file checks form one job. An aggregate runs
  as one job over its complete selected group. Available workers take the
  next job; findings stream back as they arrive, in unspecified order.
- Optional `prepare(context)` runs once per project before workers start.
  Its asynchronous `files(pattern)` and `read(path)` access the full governed
  source snapshot, including during scoped lint runs. Preparation and rules
  read the same captured contents.
- Optional `setup(prepared)` runs once in each participating worker and
  returns that worker's `context.addons`. All setups finish before linting
  begins. Prepared data must support structured cloning; ordinary objects
  are copied to each worker, while `SharedArrayBuffer` storage is shared.
  Setup results stay local and can contain functions, compiler instances,
  and handles.
- Initialized workers dispose their resources after success or failure,
  preferring `Symbol.asyncDispose` over `Symbol.dispose`. Setup failures stop
  linting; unexpected worker exits fail the run. Each nested project gets its
  own preparation and worker lifetime, with projects processed in turn.
- The library exports the `Jobs` and `PrepareContext` types. The
  `compiler-addon` example demonstrates preparation, worker-local compiler
  reuse, disposal, freshness tests, and measurement of CPU and memory costs.

Every selected check runs on every invocation. Persistent findings caching
is removed; reuse of analysis for identical inputs within an addon remains
supported.

## Required dynamic collections

Dynamic structural leaves now accept a boolean `optional` export:

| Declaration | Requirement |
| --- | --- |
| Omitted or `optional = true` | Zero or more owned files |
| `optional = false` | At least one owned file per owning directory |

For example, `features/[feature]/[test].test.ts.mjs` with
`export const optional = false` requires a matching test in each existing
feature instance. It does not require a feature instance to exist. Required
collections under static directories apply even when that directory is absent.

Only files owned by the declaration count: a more specific sibling, an ignored
file, or a child Espalier's file cannot satisfy it. An extension list is one
collection, so either extension can satisfy the requirement. Empty required
collections produce `missing_required_match` against the containing directory,
with the declaration, rule module, and enclosing captures in metadata.
Scoped lint counts the full owned membership but reports missing collections
only when their containing directory is in scope.

Generated guidance and `explain` show one-or-more collection requirements,
including requiredness in JSON output. Directory creation help lists required
collections, including those beneath static subdirectories. Creation and
preview still produce only named required files; choose a concrete filename
and create each needed collection member separately.

Named static/resolved leaves retain their existing requiredness defaults.
Constraints continue to reject `optional`.

## Duplicate findings

Identical findings emitted during one rule invocation are reported once.
Identity includes normalized path, code, message, severity, line, column, and
deeply equal metadata; object-key order and explicit versus omitted defaults
do not create duplicates.

Different locations or metadata remain distinct, as do findings from separate
rules or separate invocations. This applies to per-file and aggregate checks,
the CLI, `check`, `runRule`, and `runAggregate`.

## Fixed and evolving architecture guidance

```yaml
build:
  guidanceMode: fixed
```

- `evolving` remains the default: identify architectural gaps, discuss options
  and tradeoffs, obtain agreement, and implement the agreed design.
- `fixed` directs ordinary feature work into the existing architecture.
  When no declared role fits, report the needed path and role and pause the
  affected work until architecture work is explicitly authorized. Authorized
  architecture work can proceed without changing modes or repeatedly asking
  for approval of the agreed design.
- Routine `create`, `lint`, and `build` remain available. The mode changes
  instructions, not matching, lint enforcement, filesystem permissions, or
  commit gates. Adoption changes architectural declarations and follows the
  architecture authorization policy.
- Nested Espaliers select their own mode independently. Their root documents
  now include an explicit architecture-policy section alongside the governance
  boundary. `build.espalierGuidance: false` suppresses the canned sections,
  while authored guidance is retained.
- The shipped authoring contract consults the setting. `init` uses the default;
  `adopt` and `migrate` preserve an explicit selection. Invalid names and
  non-string values fail validation even when canned guidance is disabled.

The authoring contract also clarifies that templates provide a meaningful
starting shape: rendered source may contain TODOs or placeholders and need not
parse or pass lint before the author finishes it. This documents the existing
verbatim creation behavior.

## Upgrading from 0.7.1

Install Espalier 0.8.0 through your project's usual installation method. Before
running checks, review these compatibility changes:

1. Remove `--cache` from CLI invocations and `cache` from `check` options,
   including `cache: false`; both are rejected. Use `jobs` to set concurrency.
2. Remove `unobservedImplementationDependencies` exports from rule and addon
   modules. Compilation and the rule-testing helpers reject this obsolete
   cache declaration.
3. Review addons that assumed one shared instance per run. Allocate live
   resources inside `setup`, which now runs per worker. Move expensive
   transferable analysis into `prepare` when appropriate, and treat prepared
   data as immutable. Read governed sources through the supplied context.
4. Ensure emitted finding metadata supports structured cloning. Rules and
   addons must produce the same answers regardless of worker assignment or
   invocation order. Budget memory for each worker's local services.
5. Tests using `runRule` or `runAggregate` still supply and dispose their own
   addon objects; those helpers do not invoke preparation or start workers.
   Use `check` to test the complete lifecycle and worker transfer.

Then run:

```bash
espalier migrate --dry-run
espalier migrate
espalier build
espalier lint
espalier build --check
```

Migration updates version pins and eligible shipped authoring-contract copies;
it does not rewrite custom addons, rules, or command invocations. Customized
authoring files with the shipped marker removed remain untouched. Incorporate
the guidance changes into those files as appropriate, run your project's rule
tests, and review and commit the migration and generated documents.

[Full changelog](https://github.com/racinette/espalier/compare/v0.7.1...v0.8.0)
