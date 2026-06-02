# Lint Context

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
 * @typedef {Object} LintContext
 *
 * @property {string} path
 * Repo-relative path of the file currently being linted.
 *
 * @property {string} pattern
 * Structural path pattern or constraint glob that matched `path`.
 * `pattern === path` for exact structural rules.
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
```
