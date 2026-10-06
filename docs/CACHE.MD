# Findings cache

Persistent findings caching is an optional optimization. Enable it for a run
with `espalier lint --cache`, or `check({ cwd, cache: true })` in the API.
`espalier help cache` prints this page.

Without caching, Espalier runs every applicable rule, shares file contents
within the run, and sets up and disposes addons normally. It does not collect
a dependency manifest or record findings for later runs. Repeated programmatic
checks still load fresh ES rule and helper modules. The loader retains an
import graph so a later cached check can account for CommonJS libraries Node
reuses without resolving their imports again.

## When to enable it

`lint --cache` remembers what each rule read and what it found, and skips the rules whose inputs have not changed. A warm run over an unchanged repository does no rule work at all and reports exactly what the cold run reported.

Caching can help when rerunning rules costs more than checking their dependencies. Cheap checks may be faster without it. Rules that read the whole project usually rerun after any source edit, even if they share a compiler. Compare cached and uncached runs on the same real repository, both unchanged and after a typical edit, before enabling caching in a lint script.

## What is remembered

The unit is one rule invocation — a module, the pattern that matched, and the path it ran against. For each, the cache holds the paths it read, the globs it listed, its selected membership if it is an aggregate, and the issues it emitted. The cache header also holds the implementation modules and explicit implementation inputs that contributed anywhere in the run. An invocation is replayed when all of these still hold:

- every path it read has the same size and modification time
- every `files` glob still returns the same list
- an aggregate's selected group has the same members
- the espalier is unchanged
- every recorded rule and addon implementation dependency is unchanged

An aggregate's selected membership is recorded automatically. Adding or
removing a selected path reruns it; paths rejected by its selector do not.
Changing a member's contents reruns the aggregate when it read that member.

**The file being linted counts as a path it read**, whether or not the rule opened it. Its contents are what the rule was asked about, and a rule that answered without looking is still answering about that file. The alternative reading is the dangerous one: a rule deciding on `path` and `captures` alone would keep its verdict across every edit to the file it was judging.

**Nothing outside the espalier is hashed.** Size and modification time identify lint inputs and implementation dependencies, so cache validation does not read their contents. It checks recorded paths with `stat`; shared dependencies may be checked for several invocations. Rule loading and addon setup still run. An edit that preserves both size and the recorded modification time can go undetected. Closing it would mean reading every dependency on every run, which is the cost being avoided.

**The espalier is all-or-nothing.** Any change under `root`, or to the config, discards the cache entirely. One comparison covers a rule edit, a renamed node and a changed setting. The architect changes the espalier far less often than the repository changes under it.

## Implementation dependencies

Rule modules are ordinary ES modules, and every local `file:` module loaded by
a rule or addon helps determine its answer. Espalier observes Node's real
module resolution while importing rules, setting up and disposing addons, and
executing `lint`, including transitive and dynamic imports. The resolved files,
relevant package metadata, dependency lockfiles, Node version and resolution
conditions live in the cache header. If any cannot be validated, the complete
cache is discarded and the rules execute.

Observation follows loader chaining, so a loader installed before Espalier —
such as `tsx` supplied through `node --import tsx` — remains responsible for
resolution and transformation. Espalier records the source file that loader
resolved. If the loader encodes query identity into the `file:` pathname,
the source path is recovered when that encoded path is not a file and a
prefix before `?` is. Workers and child processes are separate runtimes and
are not observed.

For those and other inputs the module loader cannot see, a rule or addon may
declare an explicit escape hatch:

```js
export const unobservedImplementationDependencies = [
  "src/query/worker/**/*",
  "src/query/**/*.wasm",
];
```

These positive globs are relative to the repository root and deliberately see
ignored and ungoverned paths. Node's `fs.globSync` discovers their membership;
this is separate from the minimatch queries over governed files used by `files`.
They affect cache validity only: they do not make
the files available to `read`, add them to `files`, or change where an issue
may be attached. Ordinary imports do not belong in this export.

Implementation dependencies are tracked for the whole run. One
change reruns every cached invocation. A narrowed run retains the dependencies
learned by an earlier complete run, including dynamic imports it did not
execute itself.

**A constraint is an invocation like any other.** A file with a structural owner and two constraints reaching it carries three entries, one per module, each with its own reads and globs — so a constraint that listed something notices when that listing changes, and a rule that listed nothing does not re-run because a constraint beside it did.

**Structural findings are never cached.** Ownership resolution reads no file contents and runs in full every time, so `unexpected_path` and `missing_required_file` are always fresh. Only rule bodies are skipped.

**A `files` glob depends on which paths exist, not on what is in them.** Editing a sibling does not invalidate a peer comparison; adding or deleting one does.

## What this asks of a rule

A `lint` function must be a function of what it is handed: `path`, `pattern`, `captures` on an ordinary constraint, or `matches` and `patterns` on an aggregate, and whatever `read` and `files` return. One that consults the clock, the network, or the environment will be replayed with an answer it would no longer give, and the failure is silent — a stale pass, not an error. See [TYPES.MD](TYPES.MD#execution).

The governed set bounds lint data. `read` refuses a path the espalier does not govern, with `read_ungoverned`, and `files` never returns one. An implementation module may itself be ignored or ungoverned and is still stamped, but that does not turn it into data the rule may read. A rule that needs to inspect such a file rather than execute it is a rule whose espalier should stop ignoring it.

Addons must receive repository data through their arguments, not read it
themselves. Read file contents with the lint context's `read` function and pass
the returned contents to the addon. This keeps those reads tracked for cache
invalidation.

Files used to implement the addon itself—such as worker code, parser grammars,
or WebAssembly binaries—belong in `unobservedImplementationDependencies` when
module observation cannot track them.

## The cache

`<root>/.cache/lint.jsonl`, inside the espalier. That directory is already invisible to matching and already skipped when the tree is compiled, so the cache needs no rule of its own to stay out of the way. Each espalier writes its own, since a child shares nothing with its parent here either. Add it to `.gitignore`.

**A cache that cannot be used is not an error.** Missing, unreadable, unwritable, corrupt, or written by a version that no longer applies: the run discards it, does the work, and says nothing. A linter that fails over its own bookkeeping is worse than a slow one.

**Entries are merged, never pruned.** A run narrowed by `--rule` or by path arguments leaves invocations unvisited, and an unvisited invocation cannot be told from one that no longer exists. Only a run that is neither drops what it no longer sees. A valid narrowed run also retains the global implementation dependencies learned previously.

**Caching is opt-in.** Plain `espalier lint` runs every applicable rule and does not read, write, or remove a findings cache. `check({ cwd, cache: true })` enables the same cache through the API. There is no config key for it. The flag applies to every nested espalier in the run.

**Nothing in the output says whether an issue was replayed.** Both formats are identical warm and cold, because a hook that behaves differently on a warm cache is a hook nobody can trust.

## Shared analysis

An addon or parser may memoize analysis for identical inputs. Each rule
invocation must still call `read` and `files` for the lint data its answer
depends on, including when the shared service returns a cached analysis.
Reads recorded by one invocation do not become dependencies of another.

A safe compiler baseline supplies the complete source snapshot and compiler
settings through the rule context on each invocation. This is conservative:
any source edit may rerun every rule using that snapshot. Sharing the compiler
avoids repeated construction; it does not narrow the findings cache's
dependencies. Narrowing requires the analyzer to establish which inputs can
affect each answer, including source membership and module resolution.

Dependency declarations, parser grammars, compiler libraries, and other support
files loaded outside Node's module loader must be declared when they help
determine an answer. This does not authorize reading governed source outside
`read` and `files`. Compiler settings used as lint data must be governed to
read them through the context.

Addon setup and disposal run even when every finding is replayed. Construct
expensive analysis resources lazily so an unchanged cached run need not start
them. Shared resources must return the same answers regardless of rule order.

`espalier examples compiler-addon` is an executable baseline. Its repository
tests enable caching explicitly and compare findings after source-content,
compiler-setting, source-membership, support-declaration, package-metadata,
and analyzer-implementation changes. Every scoped semantic invocation still
reads the full governed snapshot. A warm pass followed by a dependency edit
must agree with a fresh check; sharing analysis does not waive those reads.
