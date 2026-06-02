# Lint Context

Constraint rule modules live under the configured **root** directory (see `espalier.config.yaml`). Each pairs a glob **selector** with a `.mjs` rule file. Paths below are relative to root:

- `**/*.ts/no-as-any.mjs` — selector `**/*.ts`
- `backend/**/*.ts/no-fetch.mjs` — selector `backend/**/*.ts`

The `selector` field on `ConstraintLintContext` is that glob (not the full rule module path). The `path` field on every lint context remains repo-relative: the file under lint in the working tree.

```js
/**
 * A single issue reported by a linter.
 *
 * @typedef {Object} LintIssue
 *
 * @property {string} code
 * Stable machine-readable issue identifier.
 *
 * @property {string} message
 * Human-readable issue description.
 *
 * @property {'error'|'warning'|'info'} [severity='error']
 * Issue severity level.
 *
 * @property {number} [line]
 * 1-based line number associated with the issue.
 *
 * @property {number} [column]
 * 1-based column number associated with the issue.
 *
 * @property {Record<string, unknown>} [metadata]
 * Additional structured issue data.
 */

/**
 * Called once for every detected issue.
 *
 * @callback EmitIssue
 * @param {LintIssue} issue
 * @returns {void}
 */

/**
 * Reads file contents from the working tree.
 *
 * If the optional `path` argument is provided, reads that file.
 * Otherwise (or if `path` is `undefined`), reads the file indicated
 * by the context's `path` property.
 *
 * The result is cached for the duration of the lint run,
 * so repeated calls do not re-read the file.
 *
 * @callback ReadFile
 * @param {string} [path]
 * @returns {Promise<string>}
 */

/**
 * Fields shared by every lint invocation.
 *
 * @typedef {Object} LintContextBase
 *
 * @property {string} path
 * Repo-relative path of the file currently being linted.
 *
 * @property {ReadFile} read
 *
 * @property {EmitIssue} emit
 *
 * @property {Record<string, unknown>} addons
 * Additional addons attached at runtime by the override script.
 *
 * Could be something useful: a reference to a Python or Go parsing backend.
 * Anything, really. Just make sure it's not stateful.
 * Remember: linter execution order is not guaranteed.
 */

/**
 * One segment in the root-to-file walk along a structural rule.
 *
 * @typedef {Object} PathSegment
 *
 * @property {'directory' | 'file'} kind
 *
 * @property {string} pattern
 * Segment from the structural pattern (literal or `[capture]`).
 *
 * @property {string} actual
 * Corresponding segment in the working tree.
 * Equals `pattern` when the segment is not a template.
 *
 * @property {boolean} isTemplate
 * True when this segment contains one or more `[capture]` placeholders.
 *
 * @property {Record<string, string>} captures
 * Bindings introduced by this segment only. Empty for literal segments.
 */

/**
 * Context passed to a structural rule's `lint` function.
 *
 * Structural rules are positioned in the rule tree under root by target
 * file path (for example `components/buttons/[button].tsx.mjs`).
 *
 * @typedef {LintContextBase & Object} StructuralLintContext
 *
 * @property {string} pattern
 * Full structural pattern for this rule, without the `.mjs` suffix.
 * Example: `"clients/[apiProvider]/[apiProvider].ts"`.
 *
 * @property {Record<string, string>} captures
 * `[capture]` bindings introduced by this rule's pattern only.
 *
 * For a literal rule such as `requestModels.ts`, this is `{}` even when
 * ancestor directories used captures.
 *
 * @property {Record<string, string>} allCaptures
 * Union of every `captures` entry along `segments`, from the structural
 * root to this file. Includes bindings from ancestor directories and from
 * this rule's own pattern.
 *
 * @property {PathSegment[]} segments
 * Root-to-leaf walk along the matched structural tree. Same depth as
 * splitting `pattern` on `/`, with the leaf segment having
 * `kind: 'file'`.
 */

/**
 * Context passed to a constraint rule's `lint` function.
 *
 * Constraint rules are attached to glob selectors under root rather than
 * to a single structural path. See the examples above this block.
 *
 * @typedef {LintContextBase & Object} ConstraintLintContext
 *
 * @property {string} selector
 * Glob selector that matched this file, relative to the configured root.
 */

/**
 * Context passed to `lint`. The runner supplies exactly one of the two
 * shapes depending on how the rule module was attached.
 *
 * @typedef {StructuralLintContext | ConstraintLintContext} LintContext
 */
```
