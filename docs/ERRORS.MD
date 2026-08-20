# Operational failures

Every code `espalier` reports with `kind: "failure"`. All of them exit `2`.

An operational failure is not a finding about the repository. It means the run could not be performed — the configuration is wrong, the espalier does not compile, a rule module misbehaved — and nothing is reported besides the failure itself. A broken setup must not be able to look like a clean repository.

Two codes are **issues** rather than failures and are not listed here: `unexpected_path` and `missing_required_file`. They come from matching, exit `1`, and are documented in [MATCHING.MD](MATCHING.MD#built-in-issues).

Codes emitted by rule modules are free-form strings chosen by their authors. `espalier` neither validates nor namespaces them. Everything below is `espalier`'s own.

## How this list came to exist

These codes were deliberately **not** designed up front. They were chosen at the throw site as each failure turned out to be real, on the reasoning that a registry written in advance would be a guess at which failures matter, and that tailoring the implementation to a table is the wrong direction of fit.

That worked, and this document is the harvest. It is checked by a test that scans `src/` for every `fail()` call: a code that exists in the code and not here fails the suite. Deciding late is fine; letting the record drift afterwards is not.

## Configuration

See [CONFIG.MD](CONFIG.MD).

| Code | |
|---|---|
| `config_not_found` | no `espalier.config.yaml` here or in any parent |
| `config_malformed` | not valid YAML, or not a mapping |
| `config_unknown_key` | a key `espalier` does not recognize — usually a typo |
| `config_missing_version` | `version` is required |
| `config_unsupported_version` | written for a release that means something different |
| `config_invalid_value` | a key holds the wrong type, or `root` escapes the repository |
| `espalier_root_missing` | the configured `root` is not a directory |
| `config_exists` | `init` only: a configuration is already here, and it will not be overwritten |

## The espalier tree

See [MATCHING.MD](MATCHING.MD). All of these are detected before a single repository file is read.

| Code | |
|---|---|
| `invalid_espalier_entry` | a file that is neither a `.mjs` module nor an `ESPALIER.MD` |
| `malformed_placeholder` | an unclosed `[`, an unmatched `]`, or a name that is not an identifier |
| `malformed_constraint_leaf` | a constraint filename that is not a rule name plus an extension |
| `malformed_node_description` | an `ESPALIER.MD` whose frontmatter will not parse |
| `multiple_recursive_placeholders` | more than one `[...name]` in one path |
| `duplicate_placeholder_name` | the same capture name twice in one path |
| `extension_list_on_structural_leaf` | `{ts,tsx}` on a structural rule, which names one file |
| `ambiguous_siblings` | two dynamic siblings that could both own one name |
| `inconsistent_capture_names` | one dynamic directory described under two names |
| `duplicate_structural_rule` | two modules governing the same path |

## Rule modules

See [TYPES.MD](TYPES.MD).

| Code | |
|---|---|
| `module_import_failed` | the module threw while being imported |
| `module_missing_export` | no `rule`, no `lint`, or no `description` on a structural rule |
| `module_invalid_export` | an export of the wrong type |
| `invalid_example` | an `example` that does not exist, or that this rule's own pattern does not match |

## Configuration against the espalier

| Code | |
|---|---|
| `ignored_required_path` | a static leaf that `ignore` also matches — the configuration asks for both and gets neither |

## During a run

| Code | |
|---|---|
| `rule_threw` | a `lint` function threw. A bug in the rule, not a finding about the repository |
| `invalid_issue` | `emit` was called with something that is not a well-formed issue |
| `invalid_issue_path` | an issue's `path` is absolute, empty, or escapes the repository |
| `read_failed` | `read` could not open a file — check with `files` first if existence is in question |
| `git_failed` | `git ls-files` did not succeed in a git-backed root |

## Addons

See [CONFIG.MD](CONFIG.MD#addons).

| Code | |
|---|---|
| `addons_import_failed` | the addons module threw while being imported |
| `addons_missing_setup` | it exports no `setup` function |
| `addons_setup_failed` | `setup` threw. Nothing is linted |

## Command-specific

| Code | |
|---|---|
| `path_outside_repository` | `explain` was given a path outside the root |
| `invalid_adopt_target` | `adopt` was given a path that is not a directory inside the repository, is the espalier root, or has a dot-prefixed segment and so cannot be declared |
| `unmarked_documentation` | `build` found a documentation file with no provenance marker, and will not eat a hand-written file |
| `missing_argument` | a command was invoked without an argument it needs |

## The runner itself

| Code | |
|---|---|
| `internal_error` | a bug in `espalier`. The stack trace is reported; please open an issue |
