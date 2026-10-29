# Operational failures

Every code `espalier` reports with `kind: "failure"`. All of them exit `2`.

An operational failure means the run could not complete: the configuration is
wrong, the espalier does not compile, or a rule or addon failed. Findings
already emitted can remain in CLI output, and other child projects may still
run. Exit `2` means that output cannot establish conformance. Programmatic
`check` rejects with `OperationalError` instead of returning partial findings.

Six codes are **issues** rather than failures and are not listed here:
`unexpected_path`, `missing_required_file`, `missing_required_directory`,
`missing_required_match`, `missing_required_group` and `undeclared_instance`. They come from matching, exit `1`, and are documented in [MATCHING.MD](MATCHING.MD#built-in-issues) and [cli/lint/README.MD](cli/lint/README.MD#built-in-issues).

Codes emitted by rule modules are free-form strings chosen by their authors. `espalier` neither validates nor namespaces them. Everything below is `espalier`'s own.

## How a code gets here

Codes are chosen at the throw site, as each failure turns out to be real, and this table is the harvest. A registry written in advance would be a guess at which failures matter, and tailoring the implementation to a table is the wrong direction of fit.

Deciding late is fine; letting the record drift afterwards is not. A test scans `src/` for every `fail()` call and holds the two to each other in both directions: a code in the source and not here fails the suite, and so does a code here that the source cannot throw.

Neither direction proves a code is *reachable*. A validation whose predicate was inverted would satisfy both — the code exists, this table lists it, and nothing ever throws it — so `test/failures.test.ts` drives a real run into each condition and asserts the code that comes out. Every code here is observed firing except `internal_error`, which is by definition a bug rather than an input, and `duplicate_structural_rule`, which nothing can currently reach; that test says why.

## Configuration

See [CONFIG.MD](CONFIG.MD).

| Code | |
|---|---|
| `config_not_found` | no `espalier.config.yaml` found before the filesystem or linked-worktree boundary |
| `config_malformed` | not valid YAML, or not a mapping |
| `config_unknown_key` | a key `espalier` does not recognize — usually a typo. A leftover `version` key is this: `pin` is the only version, and `espalier migrate` removes it |
| `config_missing_pin` | `pin` is required so the repository cannot silently change tool versions |
| `version_mismatch` | the running CLI is not the exact version recorded in `pin`. Install that version, or run `espalier migrate` |
| `config_missing_ignore_files` | `ignoreFiles` is required. `[]` names none; omit is not a decision |
| `config_missing_skip` | `skip` is required. `[]` skips nothing; omit is not a decision |
| `skip_hides_grammar` | a `skip` pattern would individually hide a `.mjs` rule module or an `ESPALIER.mjs` in an inspected directory |
| `config_invalid_value` | a key holds the wrong type, or `root` escapes the repository |
| `espalier_root_missing` | the configured `root` is not a directory |
| `ignore_file_missing` | a path in `ignoreFiles` is not there. A config that names a file depends on it |
| `config_exists` | `init` only: a configuration is already here, and it will not be overwritten |
| `unknown_language` | `init --lang` only: no shipped list by that name. The available names are reported with it |
| `contradictory_flags` | two flags that cannot both be honoured — `init --no-ignore-file` with `--ignore-file` |
| `cannot_downgrade` | `migrate` only: `pin` is newer than the running CLI, and migrate will not rewrite the config toward an older implementation |

## The espalier tree

See [MATCHING.MD](MATCHING.MD). These are compilation failures, detected before
repository linting begins.

| Code | |
|---|---|
| `invalid_espalier_entry` | a file that is neither a `.mjs` module nor an `ESPALIER.mjs`, and is not skipped |
| `malformed_placeholder` | an unclosed `[` or `{`, an unmatched `]`, a name that is not an identifier, or a mask or list after `=` that is not in the vocabulary |
| `ambiguous_captures` | a segment whose captures could split some name in two ways; the message shows the name and both splits |
| `malformed_constraint_leaf` | a constraint missing both selection forms, or a malformed filename extension selector |
| `malformed_node_description` | invalid directory metadata, conflicting guidance formats, or a description/guidance function that throws or returns a non-string |
| `multiple_recursive_placeholders` | more than one `[...name]` in one path |
| `duplicate_placeholder_name` | the same capture name twice in one path |
| `unbound_backreference` | a `{name}` with no `[name]` earlier in the same path |
| `extension_list_on_structural_leaf` | `{ts,tsx}` on a literal structural leaf, or alternatives in a name with no placeholder, such as `README{,.local}.MD`, where it is unclear which alternative must exist; a name with a placeholder may hold alternatives |
| `ambiguous_siblings` | overlapping siblings in one tier without a provably strictly narrower winner |
| `inconsistent_capture_names` | one dynamic directory described under two names |
| `duplicate_structural_rule` | two modules governing the same path |

## Rule modules

See [TYPES.MD](TYPES.MD).

| Code | |
|---|---|
| `module_import_failed` | the module could not be parsed or threw while being imported |
| `module_missing_export` | no `guidance`, or no `description` on a structural rule |
| `module_invalid_export` | an export of the wrong type or on the wrong rule kind, `targets` together with a constraint filename extension, a `lint` that is not a function, or a `rule` export, which `espalier migrate` renames to `guidance` when it is a direct declaration and refuses when destructured or re-exported |
| `invalid_reference_implementation` | a `referenceImplementation` that is absent, is not a governed file, or is not actually owned or covered by its rule |
| `invalid_instance` | a specialization has a missing, incompatible, or cyclic base, introduces an unsupported child, or weakens inherited requirements; or a group declaration names no sibling rule with groupings, changes more than its captures, writes in a value its placeholder does not admit, or binds captures no grouping groups by |

## Configuration against the espalier

| Code | |
|---|---|
| `ignored_required_path` | a static leaf hidden by external policy or `.espalierignore` — the configuration asks for both and gets neither |

## During a run

| Code | |
|---|---|
| `rule_threw` | a `lint` function threw. A bug in the rule, not a finding about the repository |
| `rule_guidance_failed` | a function-valued `guidance` or `description` threw or rejected while rendering declaration guidance |
| `invalid_issue` | `emit` was called with something that is not a well-formed issue |
| `invalid_issue_path` | an emitted or read path is not a non-empty relative string, or escapes the repository |
| `read_failed` | a snapshot file could not be read, an aggregate read omitted its path, or an isolated rule test lacks the requested contents |
| `read_ungoverned` | `read` was given a path outside the governed set — ignored, invisible, another espalier's, or not there |
| `unreadable_path` | a path under the root could not be read — a broken symlink, or permissions. What cannot be read cannot be pronounced correct |

## Addons

See [CONFIG.MD](CONFIG.MD#addons).

| Code | |
|---|---|
| `addons_import_failed` | the addons module threw while being imported |
| `addons_invalid_export` | a prepare/setup hook is not a function, setup returns neither a non-null non-array object nor undefined, or the module declares unsupported implementation dependencies |
| `addons_prepare_failed` | addon preparation threw an ordinary exception; context validation failures retain their specific codes |
| `addons_invalid_prepared` | preparation returned data that cannot be cloned to workers |
| `addons_setup_failed` | `setup` threw; no lint invocations start in that project |
| `addons_dispose_failed` | worker-local addon disposal threw |

## Parallel execution

| Code | |
|---|---|
| `invalid_jobs` | jobs is not a positive safe integer or auto |
| `worker_failed` | a worker could not start, crashed, or exited unexpectedly, including exit code zero |

## Command-specific

| Code | |
|---|---|
| `path_outside_repository` | `explain` was given a path outside the root |
| `invalid_adopt_target` | `adopt` was given a path that is outside the repository, is not a directory, is excluded by repository policy, would produce skipped rules or prose, or is the espalier root |
| `unmarked_documentation` | a build-owned documentation path contains an unmarked file; `build --force` may overwrite it, while `adopt --force` first preserves its contents in the corresponding `ESPALIER.mjs` |
| `missing_argument` | a command was invoked without an argument it needs |
| `invalid_create_target` | `create` was given a path outside the repository, excluded by repository policy, not structurally declared as a file or directory, or admitted by an abstract contract without being declared as an instance |
| `invalid_template_arguments` | create options or optional-leaf selections are invalid; template arguments are unknown, missing, outside schema choices, before `--`, or supplied to `help` |
| `create_target_exists` | the requested file or directory already exists; `create` never overwrites |
| `template_threw` | a template renderer threw instead of producing source |
| `template_invalid_result` | a template renderer returned something other than a string |
| `create_write_failed` | the rendered file or staged directory could not be written to its requested path |
| `invalid_check_options` | programmatic check was passed the unsupported cache option |

## Rule-module parse locations

When a rule file fails to parse, `module_import_failed` includes its
repository-relative path and available 1-based line and column in the message
and in JSONL `detail.path`, `detail.line`, and `detail.column`. A nested failure's
path is relative to the Espalier named by its `espalier` field.

Node's dynamic-import errors can omit source coordinates. After a syntax
failure, Espalier uses a bounded Node syntax check of that rule's source to
recover them without executing the module again. This adds no check to a
successful import. If the rule itself parses, the failure may come from an
imported helper or runtime code; no location is guessed for the importing rule.
If the syntax check is unavailable or provides only a line, the original error
is retained with only the coordinates that could be established.

## The runner itself

| Code | |
|---|---|
| `internal_error` | a bug in `espalier`. The stack trace is reported; please open an issue |
