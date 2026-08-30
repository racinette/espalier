# `espalier build`

Generates the repository's agent-facing documentation from the espalier.

```bash
espalier build
espalier build --check
espalier build --force
espalier build --inline
```

Everything `build` writes is a generated artifact. The espalier is the source of truth; regenerate after changing it, and do not edit the output by hand.

## Usage

```text
espalier build [--check] [--force] [--inline] [--format <fmt>] [--out <dest>] [--config <path>]

  --check          compare generated output against what is on disk,
                   write nothing, exit 1 if they differ
  --force          overwrite an unmarked file at a planned output path
  --inline         write a single document at the root instead of
                   distributing files through the tree
  --format <fmt>   human or jsonl (default: human)
  --out <dest>     stdout, stderr, or a file path (default: stdout)
  --config <path>  use this config file instead of discovering one
```

`--format` and `--out` mean here exactly what they mean in [`lint`](../lint/README.MD#output), and for the same reason: what a run says and where it says it are separate choices. They describe the *report* — which files were written, which drifted, why the run failed — never the generated documentation itself, whose location comes from the espalier and whose format is markdown.

## Why one mechanism

Agent tools disagree about almost everything: whether rules attach by glob, whether skills exist, what frontmatter means, when a file enters context. Every mechanism that depends on a tool's behaviour at a particular moment has to be re-learned as that tool changes, and none of them cover creation — a rule that attaches when a file is read cannot help an agent writing a file that does not exist yet.

`build` depends on one thing instead: agents read the documentation files in the directory they are working in. That convention is converging across tools, it costs nothing to support, and it works identically for creating a file and for editing one.

Everything else the agent needs arrives from `espalier lint`, which reports violations with the rule text attached. Guidance steers, lint corrects, and both come from the same modules — so they cannot disagree.

## Where files go

A generated file is placed at the **longest static prefix** of what it describes. A directory is a valid placement point only if its entire path contains no dynamic segment; one `[name]` or `[...name]` above it and the file would multiply across instances on disk.

Only dynamic **directory** segments matter. A dynamic filename does not affect placement, because the directory containing it is real.

| Rule | Placed at |
|---|---|
| `main.ts` | root |
| `components/buttons/[button].tsx` | `components/buttons/` |
| `src/clients/[provider]/client.ts` | `src/clients/` |
| `src/clients/[provider]/handlers/webhook.ts` | `src/clients/` |
| `backend/[...path]/no-fetch.ts` | `backend/` |
| `[...path]/no-as-any.{ts,tsx}` | root |

Constraints are not a special case. A recursive placeholder is just a dynamic segment that truncates the prefix.

## What each file contains

**A local map** — its first row names the directory this document describes,
then the structure it owns. A branch stops at the next directory with a
generated document: that directory appears, and the document inside it begins
from the same directory before showing its contents. Intermediate directories
without a document remain expanded, so every structural node appears somewhere.

**Rule bodies** — only for rules placed *here*. Detail does not propagate upward.

**Cardinality and the complete account** — which files are required, which may
appear zero or more times, and the final statement that every path belongs to
the project layout or a documented repository-specific purpose. These come
from the compiled structure and the materialized repository paths rather than
from anything an author writes.

**Node prose** — the body of the directory's `ESPALIER.MD`, if it has one.

**Operational guidance** — the root document introduces Espalier, explains how
its generated guidance aids development, and gives the working loop. A nested
Espalier root instead states its governance boundary; placement documents below
either root inherit the applicable guidance rather than repeating a footer. See
[README.MD](../../../README.MD#who-changes-the-espalier).

The root file additionally carries the project preamble.

## Generation

1. Walk the static spine from the root, stopping at the first dynamic segment. Those are the placement points.
2. Assign every rule to the longest static prefix of its directory path.
3. Drop placement points with no assigned rules and no `ESPALIER.MD` — an intermediate directory whose content all lives deeper produces no file, and the map above it stays expanded through that directory. The root is never dropped: it is the one file every tool reads, and it alone carries the Espalier introduction and development loop.
4. Render each surviving point.
5. Write with a provenance header, in deterministic order. A file whose rendered bytes match what is already on disk is left alone rather than rewritten, so a second run touches nothing and reports nothing.

Everywhere siblings are listed — in the map, in the order files are written — the order is: directories before files, then by specificity (static, then resolved, then dynamic), then lexicographic by authored name. Every tier does work, and together they are total, so output is byte-comparable between runs.

The specificity tier is rarely what decides, because `{` and `[` both sort after every letter, so an authored name usually lands in the same place either way. It is stated because it is the order the matcher uses, and a document listing siblings in one order while ownership resolves them in another would be describing a different espalier.

## Rendering

The document is assembled in a fixed order. A section with nothing to say is omitted entirely, along with its heading; no placeholder text is ever written.

```text
provenance marker
# <name> — `<path>/`          the heading, when the config names the project
node prose                    the ESPALIER.MD body, verbatim
## Governance boundary       nested Espalier root only
## Project layout             the tree
## Governed elsewhere         child espaliers below this point, when any
## `<path>` — <description>   one per structural rule placed here
## Constraints                grouped by extension, then one rule section each
## Other repository paths     one Paths/Purpose table, then the complete account
## Working with Espalier      root file only
```

Text `espalier` composes — the map's own text and the complete-account sentence — is greedily wrapped at 80 columns. Text an author wrote — node prose, rule bodies — is copied verbatim and never re-wrapped, because reflowing someone's markdown is how a tool mangles a table.

### The heading

`# <name>` in the document at the espalier's own root, and
`# <name> — \`<path>/\`` in every document below it, where `name` is the
config's [`name`](../../CONFIG.MD#name) and `path` is the directory the document
was written into, relative to that root. The path is rendered as code so it is
visually distinct from the project name.

Both halves earn their place, and neither on its own would. A document is read in the directory it sits in, by a reader who arrived there and not by one who navigated down from the root — so the path says which directory's rules these are, and the name says which project that directory belongs to. In a monorepo the second question is a real one, and a `src/` heading answers it in a way that is right in every package at once.

**No name, no heading.** A project that has not named itself gets nothing rather than a heading built out of the path alone, because a document headed `# src/` claims to be the authority on a directory whose project it cannot name. `espalier init` writes the directory's own name, so this is the state of a config someone edited rather than of one the tool produced.

### The map

An indented code block drawn as a tree, opening with the directory this document
describes and then proceeding depth-first in sibling order. The first row is
`./` at the espalier root and the full repository-relative path with a trailing
slash at every deeper placement point. The project [`name`](../../CONFIG.MD#name)
is not used there: it names the project, not necessarily its directory.

Every other directory also carries a trailing `/`. Names are authored form, so
a dynamic node appears as `[provider]/` or `[button].tsx`.

Structural rule headings are relative to the placement point that contains
them. A document headed `src/` therefore describes `cache.ts`, not
`src/cache.ts`; an inline `src/` section establishes the same scope before its
rule headings. Espalier keeps repository-relative paths internally and changes
only their presentation.

In distributed output, a map includes the directory where a deeper generated
document takes over and stops that branch there. If the next document is
several directories down, every intermediate directory remains expanded until
that boundary. The deeper document begins with the boundary itself, so the two
maps overlap at exactly one row and the handoff is explicit.

Inline output is the exception: it has no deeper documents to continue into,
so its one map contains the entire espalier.

Branches are drawn with box-drawing characters: `├─ ` for an entry with siblings still to come, `└─ ` for the last one, and, under each of those, `│  ` and three spaces respectively for everything nested inside.

```text
    ./
    ├─ clients/                external API providers
    │  │
    │  └─ [provider]/          (zero or more, any name)
    │     │
    │     ├─ requestModels.ts  request shapes (required)
    │     │
    │     └─ {provider}.ts     the client (required, {provider} repeats what
    │                          [provider] matched)
    │
    ├─ main.ts                 the entry point (required)
    │
    └─ notes.md                developer notes (optional)
```

Indentation alone would say the same thing in less space, and say it less well: text long enough to wrap leaves a reader deciding whether the next line continues the entry above or begins a new one, and a branch answers that before the question is asked.

**A guide row separates two entries whenever either carries text.** It holds the branch characters and nothing else: the bars the entry above it carried, then a `│` at that entry's own depth when a sibling still follows it, and, when that entry is a directory, one more at its children's depth. Trailing spaces are trimmed, so no guide row reaches the text column. Two entries that both carry no text sit adjacent, there being no thread there to lose.

**A directory's guide row descends when a child follows in this map.** The bar
at the children's depth is not a claim that more than one follows — it is the
branch coming down into the first, and the `├─` or `└─` it lands on is drawn
from it. A directory where a deeper generated document takes over is a leaf in
this map, so its guide row carries no child-depth bar. A `└─` with nothing above
it is a corner with no line to turn.

**Text starts at one column across the whole map:** two spaces after the longest rendered line, counting the branch characters and not the four spaces of the code block, which are added to every line afterwards and so cannot change the alignment. Text too long for the remaining width wraps into that column and hangs there, under the branch characters of its own line.

A line's text is the node's description, then its suffixes in parentheses. A file's description is the rule module's `description`; a directory's is the `description` in its `ESPALIER.MD` frontmatter. A node with neither a description nor a suffix gets no text rather than a blank column.

**The parentheses are what separate the two voices.** The description is a sentence somebody wrote; the suffixes are the espalier's annotation of it. Joined by a comma they read as one clause, and a description that already contains commas — `ownership, requiredness, and the deepest recognized node` — swallows the annotation entirely. They are parenthesized on a line that carries no description too, since a bare `zero or more, any name` reads as prose an author chose.

Constraints do not appear. They declare no file and permit none, so a map that listed them would be answering a question nobody asked of it. Their bodies render below, under `## Constraints`.

### Suffixes

There are three kinds, and each is true of the line it sits on and of nothing else. That is the rule they are written to: a suffix whose subject the reader has to locate — which directory, how far up the tree — has spent more attention than it saved.

**`required` and `optional`** mark every leaf the espalier names — every static and resolved one — and neither is a default. A named file carrying no such suffix is not a file whose requiredness is left to inference; there is no such file. Both read against the line's own position, so `requestModels.ts` drawn inside `[provider]/` is required in a `[provider]/` directory, which is where the reader is looking.

A dynamic leaf carries neither. `zero or more, any name` says the count itself, and there is no named file there to require. Marking one `optional` is rejected rather than ignored — see [TYPES.MD](../../TYPES.MD#optional) — because an author writing it believes it changes something.

Directories carry neither. A directory exists exactly when the files described inside it do, so marking one required would either restate its contents or claim that an empty directory satisfies something, and the second is false.

**`zero or more, any name`** marks every node whose own name holds a `[name]` placeholder, wherever the placeholder sits — `[provider]/`, `[button].tsx`, `test-[name].ts`. It teaches the bracket by example on the line the bracket is on, rather than relying on a syntax rule stated once at the top of a file the reader may have entered halfway down.

Both halves are load-bearing and neither stands alone. `any name` without a count leaves *how many* unanswered, and a count without `any name` leaves the brackets unexplained. The count is named rather than implied: a line reading `a domain model, any number` gives the number no subject, and characters in the filename read as well as files in the directory.

**`{provider} repeats what [provider] matched`** marks every node whose name holds a back-reference, one clause per placeholder, comma-joined inside the parentheses. It describes what the capture holds rather than what the segment was, which is the only phrasing that survives an affix: under `[provider]-provider/`, a `{provider}Impl.ts` in the directory named `stripe-provider` is `stripeImpl.ts`, and a suffix promising "the same name as the directory" would be wrong three times out of four.

### The complete account

One sentence follows `Other repository paths`, after the document has described
both the project layout and the purpose-specific paths that exist outside it:
`Every path in this directory must fit the project layout or a documented
repository-specific purpose.` Below the root it names the placement point:
`Every path under src/clients/ must fit the project layout or a documented
repository-specific purpose.`

The sentence closes the combined account rather than pretending the layout map
is an inventory of the filesystem. A directory where the map stops remains in
the project layout; the generated document inside it continues the description.
Child espaliers named under `Governed elsewhere` are likewise established parts
of that layout. Materialized exclusions, generated guidance and configuration
are accounted for by their stated purposes in the table immediately above.

### Governed elsewhere

A directory holding an espalier of its own is not described by this one. Naming
it here makes the handoff visible while leaving its own document authoritative.

```markdown
## Governed elsewhere

- `packages/api/`
- `packages/web/`

Read the documentation inside each one.
```

A list, one bullet per child, sorted by path. Names are relative to the placement point and carry a trailing `/`. The closing sentence takes its singular form — `Read the documentation inside it.` — when there is one child.

**Names and nothing else.** Every child here is a child for the same reason, so a line saying so on each of them is a refrain: the heading already says what they have in common, and the sentence below says what to do about it. Nothing is left for a per-child note to add that is not the child's own document's to say.

**Every document whose closed set covers a child names it.** A child sits inside the subtree of every placement point above it, and each of those files ends on the same absolute sentence, so each of them has to say what it defers to — at its own path: `packages/api/` in the root file, `api/` in `packages/AGENTS.MD`. Naming it only in the deepest one would leave the others claiming a directory a reader can see they do not govern, and the alternative — appending an exception to the closed set — is a sentence that has stopped being terminal.

A child several levels below the nearest placement point is named there too, as `tools/reports/`, since that is the file whose closed set covers it.

The section names the children and stops. It does not say what they contain, which document to open, or what the child's `build.filename` is, because the outer espalier does not know and must not appear to: a summary of somebody else's rules is a second source of truth that goes stale silently. The reader is sent to the directory, where the child's own document is.

### Other repository paths

#### Exclusion scope

Exclusion declarations follow Git's per-directory model. Espalier reads the
repository-root `.espalierignore`, then discovers another `.espalierignore`
whenever the repository walk enters a directory. Patterns are relative to the
directory containing their file. Ancestor files apply first, deeper files
override them, and the last matching pattern within one file wins. An ignore
file below an excluded directory is never discovered, so it cannot re-include
anything beneath that directory.

Rendering preserves comment-or-blank-delimited authored groups. A group appears
in the deepest generated document whose subtree contains every path the group
could affect. A bare recursive pattern therefore stays at the document for its
ignore file's directory; an anchored pattern can move to the document covering
its literal leading path; and a group spanning separate subtrees stays at their
nearest common generated ancestor. If no document exists at the calculated
scope, the nearest generated ancestor owns the group. Parent documents provide
the common policy inherited by their descendants; declarations are not copied
into every descendant.

Configured `ignoreFiles` remain repository-root-relative external sources. They
are not discovered per directory.

One reader-facing table accounts for paths outside the project layout. Its
materialized rows come from entries encountered during this build; its generated
guidance and configuration rows are independent of repository contents.

#### Materialized paths

Only positive rules that are the final winning exclusion for at least one file
or directory encountered by the repository walk. Exact declarations whose path
is absent, glob declarations with no finally excluded match, superseded positive
rules and all negations are omitted. A retained path is governed by the
structure or rejected by its closed set; it is not an exclusion to explain.

The table quotes each winning declaration once and never enumerates the paths
that caused a glob to appear.

```markdown
## Other repository paths

These paths are part of the repository but serve specific purposes outside the
project layout. Use them only for the purpose stated here.

| Paths | Purpose |
| --- | --- |
| `*.log`<br>`coverage/**` | Per-run output. |
| `/dist/` | Generated build contents. |
| `/LICENSE` | Licence and legal. |
| `package.json`<br>`tsconfig.json` | — |
```

One row is one authored group: the uninterrupted declarations introduced by a
`#` comment block, or an uninterrupted undescribed block. Declarations stay in
authored order inside the first cell and the description is written once. A
blank line ends the group. Groups are never merged merely because their
descriptions are identical.

Comments in `.espalierignore` supply `Why`. Comments in `ignoreFiles` do not:
they were written for another tool by somebody answering a different question,
so their groups carry `—`. See [CONFIG.MD](../../CONFIG.MD#espalierignore).

The first cell quotes declarations, not their matches. An exact rooted path is
therefore an exact path, a bare name remains a pattern that can match at any
depth, and a glob appears whole as soon as one encountered entry matches it.
Rules and paths use Markdown code spans, lengthened when a value itself contains
backticks; pipes are escaped so they cannot split a table cell.

Filtering happens before placement. Each surviving authored group appears in
the deepest generated document covering all of its winning rules; common groups
remain in an ancestor and descendants inherit them.

#### Generated guidance and configuration

Additional exact paths name the inputs and output of repository-guidance
generation, independent of ignore matching. Configuration is named without
linking to or recommending changes to an ignore source. Generated documentation
points away from the artifact that will be overwritten and toward the source
where a persistent change belongs.

```markdown
| Paths | Purpose |
| --- | --- |
| `AGENTS.MD` | Generated repository guidance; edits here will be overwritten. Modify [`ESPALIER.MD`](espalier/ESPALIER.MD) to change this document's persistent guidance. |
| `.espalierignore`, `espalier.config.yaml`, `espalier/` | Sources used to generate and check this repository guidance. |
```

Every distributed document names its own generated file. The root additionally
names its config, its espalier root, every `ignoreFiles` entry and
`.espalierignore` when that file exists. Inline output has the root row only.

The generated-file explanation always links to the placement point's
`ESPALIER.MD`. It says `Modify` when that file exists and `Create` when it does
not, so a reader has one concrete place for persistent document guidance in
either case. Links are relative to the generated document and their path
segments are percent-encoded.

Table rows remain one physical line. Pipes in prose and code spans are escaped,
and line breaks become `<br>`, so authored text cannot change the table's
columns.

The whole section follows local rule sections and constraints. A document first
says what it describes, then accounts for the policy and machinery outside that
structure; putting those in the opposite order interrupts the document with
exceptions before it has finished stating the rules.

The section closes with the complete-account sentence. A purpose-specific path
is valid for that purpose without becoming a destination for unrelated work.

### Rule sections

```markdown
## `[provider]/client.ts` — an integration with an external API

<the rule body, verbatim>

Example: src/clients/stripe/client.ts
```

A directory below the placement point may have prose too — a dynamic directory is never a placement point, so its `ESPALIER.MD` body has nowhere of its own to go. It takes the same section, headed by its path with a trailing `/`:

```markdown
## `[provider]/` — one directory per upstream provider

<the ESPALIER.MD body, verbatim>
```

Sections appear in map order, so the map doubles as a table of contents, and a directory's section precedes the sections of everything inside it. The heading is the rule's full path from the repository root, not from the placement point — an agent reading `src/clients/AGENTS.MD` is being told where the file goes, and a relative fragment makes it guess. The `Example:` line carries `example`, the path, and is omitted when the module exports none. A module exporting `exampleSource` instead gets the source as a fenced block under the same heading:

```markdown
Example:

```
export default function Submit() { … }
```
```

One or the other, never both — [TYPES.MD](../../TYPES.MD#example-and-examplesource) rejects a module setting each.

Constraints are grouped by their extension set. Known extensions use the
language names in the renderer's case-insensitive alias map; an unknown
extension falls back to its authored dotted form rendered as code. The group
states its scope in prose, and individual rules render one level beneath it:

```markdown
## Constraints

### TypeScript files

These rules apply to all TypeScript files in this project.

#### no-as-any — no `as any`

<the rule body, verbatim>
```

### Operational guidance

The repository root document ends with an operational introduction, where the
former checking and amendment sections would otherwise have appeared:

```markdown
## Working with Espalier

Espalier is the architecture compiler for this repository. It turns structural
rules and `ESPALIER.MD` guidance into this generated document, then checks the
working tree against them. Use it to place new code, discover the constraints on
a path, and catch architectural drift while a change is still small.

Use this loop:

1. Find the intended path in **Project layout** and read the generated guidance
   in the nearest directory.
2. Run `espalier explain <path>` when you need to understand how a path is
   governed.
3. Make the change without working around the declared structure.
4. Run `espalier lint` and follow the rule text attached to each finding.

Generated guidance files are outputs, not edit targets. When a task explicitly
changes the architecture, update the corresponding `ESPALIER.MD` for guidance
or the structural rule modules for structure, then run `espalier build`.
Otherwise, if the work has no valid place or conflicts with a rule, report the
design gap instead of weakening the espalier. Use `espalier build --force` only
to restore a generated file whose provenance marker was removed; it authorizes
overwriting an unmarked document at a planned output path.
```

A nested Espalier root does not repeat that introduction. After its node prose
and before its project layout it states only what changes at the boundary:

```markdown
## Governance boundary

This directory is governed by an independent Espalier. The parent Espalier
delegates this subtree: its structural rules, exclusions, and generated-document
ownership stop here.

The repository root remains the source of shared project context and the
development workflow. Within this subtree, this document and its descendants
are authoritative for file placement and local constraints. This Espalier may
govern only paths beneath this directory; it cannot redefine its parent or
sibling subtrees.
```

## Example

Given:

```text
espalier
├─ ESPALIER.MD
├─ main.ts.mjs
├─ components/buttons/[button].tsx.mjs
├─ src/clients
│  ├─ ESPALIER.MD
│  └─ [provider]
│     ├─ client.ts.mjs
│     ├─ requestModels.ts.mjs
│     └─ handlers/webhook.ts.mjs
└─ [...path]/no-as-any.{ts,tsx}.mjs
```

`build` writes three files. `components/` and `src/` are placement points with nothing assigned, so they are pruned:

```text
AGENTS.MD
components/buttons/AGENTS.MD
src/clients/AGENTS.MD
```

`src/clients/AGENTS.MD` in full:

```markdown
<!-- generated by espalier — do not edit — source: espalier/src/clients -->

# acme-web — `src/clients/`

Outbound API integrations. Every upstream provider gets its own directory;
nothing outside src/clients/ performs HTTP requests directly.

## Project layout

    └─ [provider]/          one directory per upstream provider (zero or more,
                            any name)
       │
       ├─ handlers/
       │  │
       │  └─ webhook.ts     an inbound webhook handler (required)
       │
       ├─ client.ts         an integration with an external API (required)
       │
       └─ requestModels.ts  request payload types (required)

Every path under src/clients/ must fit the project layout or a documented
repository-specific purpose.

## `[provider]/handlers/webhook.ts` — an inbound webhook handler

Verify the provider's signature before parsing the body. Return 2xx only
after the event is durably recorded.

## `[provider]/client.ts` — an integration with an external API

Export a single `create<Provider>Client(config)` factory. All requests go
through the shared helper in `src/clients/request.ts`; do not call fetch
directly.

Example: src/clients/stripe/client.ts

## `[provider]/requestModels.ts` — request payload types

Export one interface per endpoint the client calls.

```

`handlers/` sorts ahead of its file siblings because directories come first, and `handlers/` itself carries no text because no `ESPALIER.MD` describes it — a blank column would say the same nothing at greater length. `no-as-any` is a constraint on `[...path]`, whose longest static prefix is the root, so it renders in the root file and not here.

## Nested espaliers

A directory holding an `espalier.config.yaml` of its own is a child espalier, and its subtree belongs to it. See [CONFIG.MD](../../CONFIG.MD#nested-espaliers).

The outer run places no document inside a child's subtree and sweeps nothing there — the subtree is not its to describe. Each child is then built as its own run, with its own `build.filename` and `build.inline`, so a monorepo can keep distributed documents at the root and one inline document inside a package that prefers it. Neither run can see the other's output, which is why neither can delete it.

Each child renders exactly as if it had been run alone: its `source:` marker,
governance boundary and complete account are all relative to the child's own
root, because that is the frame a reader standing in the package is in. Nested
status comes from the ancestor configuration, not from which command discovered
the child. Only the report is re-rooted — its paths are relative to where the
command was invoked, and each line's `espalier` names the run that produced it.

**Nothing is written unless every espalier planned successfully.** Each one is rendered in memory, the whole set is checked, and only then does anything reach the filesystem. A child that will not compile means no documents at all — not the root's, not a healthy sibling's.

This is where `build` and [`lint`](../lint/README.MD#nested-espaliers) part company, and the difference is what each of them produces. `lint` writes to a stream: it is advisory, it ends when the run does, and a sibling's findings are worth having even when one package is broken. `build` writes files that outlive the run, and the exit code does not. A tree half-built across espaliers is a root document sending readers to a directory with nothing in it, and nothing in the file to say why. Every failure is reported, so a run that writes nothing still names all of what is wrong.

`--check` is the exception, because it writes nothing to begin with: it reports the drift it found in the espaliers that planned, alongside any failure, and exits `2`. Drift inside any espalier is drift, and the exit code is the worst of every run.

## Ownership

Output is distributed through the tree rather than confined to one directory, so ownership is tracked by provenance rather than by path. Every generated file opens with a marker:

```markdown
<!-- generated by espalier — do not edit — source: espalier/src/clients -->
```

That one line does three jobs: it tells `build` which files it may delete, it tells `lint` which files to skip, and it tells `build` what it must not touch.

`source:` names the espalier directory the file was rendered from — the configured `root` for the root document, `root` plus the placement point below it otherwise. It is there for a human reading the generated file who wants to know where to go and edit; nothing reads it back, and orphan detection uses the marker's presence rather than its contents.

- Files bearing the marker are rewritten each run. Any that this run did not produce — because the espalier node was renamed or removed — are deleted, since a document that keeps steering agents after its rule is gone is worse than no document.
- **The sweep is confined to what the configuration governs.** A marked file that is excluded is never a candidate for deletion. The marker says a file is generated documentation; it does not say it is *this* run's. A repository holding a copy of `espalier`'s output — a golden fixture, a vendored copy of another repository — would otherwise lose it on the first build, with nothing to warn it.
- A documentation file **without** the marker halts the build. Move its content into the corresponding `ESPALIER.MD` and run again; `build` will not eat a hand-written file.
- `--force` bypasses that refusal only when the unmarked file occupies a path
  this run plans to generate. It does not make unmarked files eligible for
  orphan deletion. Because it can overwrite a genuinely hand-written document,
  use it only to recover generated output whose marker was removed accidentally.
- Generated files are invisible to matching, so espalier's own output is never reported as `unexpected_path`.

Only files are deleted. A directory left empty by an orphan deletion stays, because git does not track it and because a tool that removes directories it did not create is one bad path away from removing something it should not have.

No record of past runs is kept. Finding orphans is a scan of the candidate files, less anything excluded, for those matching the configured filename and carrying the marker — a manifest would be a second source of truth with nothing to add.

## Output

A run reports what it did to the filesystem, because writing and deleting documentation silently is how a tool loses the reader's trust the first time it removes something they wanted.

Four kinds of line, tagged as such under `--format jsonl`:

| `kind` | |
|---|---|
| `written` | a generated file this run wrote |
| `deleted` | a generated file this run removed as an orphan |
| `drift` | `--check` only: a file that is `missing`, `changed`, or `stale` |
| `failure` | an operational failure; the run stopped |

```json
{"kind":"written","path":"src/clients/AGENTS.MD"}
{"kind":"deleted","path":"src/legacy/AGENTS.MD"}
{"kind":"drift","path":"AGENTS.MD","state":"changed"}
{"kind":"failure","code":"unmarked_documentation","message":"components/AGENTS.MD exists without a provenance marker"}
```

The `human` format prints one short line per file and a count, and prints nothing at all for a run that wrote nothing and deleted nothing — a build that had no work to do should not look like a build that did some.

## `--check`

Renders everything in memory, compares against what is on disk, writes nothing. Reports files that are missing, changed, or stale.

Exits `1` when the output differs, `2` on operational failure. Run it in CI so agents are never guided by documentation that was generated before the last espalier change.

## `--force`

Authorizes `build` to overwrite an unmarked documentation file at a planned
output path. Without it, that file is an operational failure and nothing is
written anywhere. Other planning failures still stop the entire build.

With `--check`, it permits the comparison but still writes nothing; the
unmarked target is reported as changed. It never deletes an unmarked orphan.

## `--inline`

Writes one document at the root containing every rule body, and no distributed files.

The distributed form assumes agents pick up documentation from ancestor directories of the file they are working on. A tool that reads only the repository root gets nothing from distribution, and `--inline` gives it everything in the one file it does read. The cost is that the whole repository's rules are resident at all times, which is why it is not the default.

The document is the root document with the other placement points folded into it. After the root's own structure and rules, each remaining point in map order becomes a section:

```markdown
## `src/clients/`

Outbound API integrations. Every upstream provider gets its own directory;
nothing outside src/clients/ performs HTTP requests directly.

### `[provider]/client.ts` — an integration with an external API
```

**A folded point contributes its prose and its rule sections, and nothing else.** Everything shifts one heading level down, and the rule bodies are the same bytes they would have been distributed.

There is no second map and no second complete-account sentence, because the root's cover the whole repository already. Both are written relative to the point that produced them, so folded in they would state one rule several times over in words that differ every time — `[provider]/` here, `clients/[provider]/` a section up, `src/clients/[provider]/` at the root — leaving the reader to work out that the three are one. The distributed form repeats itself because each of its files is read alone, which is exactly what this mode is not.

A point exists because it has a document or rules of its own, so this leaves it with something to say. One whose document has a description and an empty body would be left with a bare heading, and loses the heading too, under the ordinary rule that a section with nothing in it is not written.

The `Working with Espalier` section appears once, at the end.

Switching modes deletes the files the other mode produced. They carry the marker, this run did not produce them, and that is the whole orphan rule doing its ordinary job.

## Configuration

The output filename and inline mode are configured under `build` in `espalier.config.yaml`. See [CONFIG.MD](../../CONFIG.MD).

Every operational failure code is listed in [ERRORS.MD](../../ERRORS.MD).
