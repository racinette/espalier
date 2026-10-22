# `espalier build`

Generates the repository's agent-facing documentation from the espalier.

```bash
espalier build
espalier build --check
espalier build --force
```

Everything `build` writes is a generated artifact. The espalier is the source of truth; regenerate after changing it, and do not edit the output by hand.

## Usage

```text
espalier build [--check] [--force] [--format <fmt>] [--out <dest>] [--config <path>]

  --check          compare generated output against what is on disk,
                   write nothing, exit 1 if they differ
  --force          overwrite an unmarked file at a planned output path
  --format <fmt>   human or jsonl (default: human)
  --out <dest>     stdout, stderr, or a file path (default: stdout)
  --config <path>  use this config file instead of discovering one
```

`--format` and `--out` mean here exactly what they mean in [`lint`](../lint/README.MD#output), and for the same reason: what a run says and where it says it are separate choices. They describe the *report* — which files were written, which drifted, why the run failed — never the generated documentation itself, whose location comes from the espalier and whose format is markdown.

## Why one mechanism

Agent tools disagree about almost everything: whether rules attach by glob, whether skills exist, what frontmatter means, when a file enters context. Every mechanism that depends on a tool's behaviour at a particular moment has to be re-learned as that tool changes, and none of them cover creation — a rule that attaches when a file is read cannot help an agent writing a file that does not exist yet.

`build` depends on one thing instead: agents read the documentation files in the directory they are working in. That convention is converging across tools, it costs nothing to support, and it works identically for creating a file and for editing one.

Everything else the agent needs arrives from `espalier lint`, which reports violations with the rule text attached. Guidance steers, lint corrects, and both come from the same modules, so drift between them is reviewable. Colocation does not prove the prose and the check are the same obligation; tests and review still establish that.

## Where files go

By default, a generated file is placed at the **longest static prefix** of what it describes. A directory is a valid placement point only if its entire path contains no dynamic segment; one `[name]` or `[...name]` above it and the file would multiply across instances on disk.

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

**Rule bodies** — for rules placed here and sections explicitly folded here.
Other descendant documents retain their own rule detail.

**Cardinality and the complete account** — which files are required, which may
appear zero or more times, and the final statement that every path belongs to
the project layout or a documented repository-specific purpose. These come
from the compiled structure and the materialized repository paths rather than
from anything an author writes.

**Node prose** — the rendered `guidance` from the directory's `ESPALIER.mjs`, if it has one.

**Operational guidance** — the outer-root document introduces Espalier, explains how
its generated guidance aids development, and gives the working loop. A nested
Espalier root states its governance boundary and local architecture-change mode;
placement documents below either root use the applicable guidance. These sections
are included when `build.espalierGuidance` is enabled. See
[README.MD](../../../README.MD#who-changes-the-espalier).

The root file additionally carries the project preamble.

## Generation

1. Walk the static spine from the root, stopping at the first dynamic segment. Those are the placement points.
2. Assign every rule to the longest static prefix of its directory path.
3. Drop placement points with no assigned rules and no `ESPALIER.mjs` — an intermediate directory whose content all lives deeper produces no file, and the map above it stays expanded through that directory. Each Espalier's root is never dropped: it anchors that Espalier's guidance. With operational guidance enabled, the outer root carries the introduction and development loop, while nested roots carry their governance boundary and local architecture policy.
4. Fold each directory marked `fold = true`, and every placement beneath it, into the nearest surviving ancestor. The root always survives. Descendant flags cannot reopen a folded subtree.
5. Render each surviving point, including its folded sections.
6. Write with a provenance header, in deterministic order. A file whose rendered bytes match what is already on disk is left alone rather than rewritten. An unchanged human-format run confirms completion without reporting writes.

Sibling declarations appear with directories before files, then static names,
resolved names, and dynamic patterns within each kind. Within dynamic siblings,
every strictly narrower pattern appears before its broader fallbacks, using the
same containment relation as ownership. Thus `test-[name].ts` appears before
`[file].ts`, and `[name]-special-checksonly/` before `[name]-checksonly/`,
which itself appears before `[world]/`.

When several siblings are ready to appear, choose the lexicographically first
authored name; a broader pattern waits until all its narrower siblings have
appeared. This gives deterministic ordering even when unrelated patterns sit
alphabetically between a specialization and its fallback. The project map and
guidance sections share this order, so the document presents the same
specificity that decides ownership.

## Rendering

The document is assembled in a fixed order. A section with nothing to say is omitted entirely, along with its heading; no placeholder text is ever written.

```text
provenance marker
# <name> — `<path>/`          the heading, when the config names the project
node prose                    the rendered ESPALIER.mjs guidance
## Governance boundary       nested Espalier root only
## Architecture changes      nested Espalier root's own guidance mode
## Project layout             the tree
## Governed elsewhere         child espaliers below this point, when any
## `<path>` — <description>   one per structural rule placed here
## <rule name> — <description>  one per constraint placed here; selection and
                               individual or group scope precede its body
## `<directory>/`             folded placement prose and level-three rule sections
## Other repository paths     one Paths/Purpose table, then the complete account
## Working with Espalier      outer-root file only
```

Text `espalier` composes — the map's own text, constraint selection sentences,
and the complete-account sentence — is greedily wrapped at 80 columns. Text an
author wrote — node prose, rule bodies — is copied verbatim and never
re-wrapped, because reflowing someone's markdown is how a tool mangles a table.

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
them. A document headed `src/` therefore describes `context.ts`, not
`src/context.ts`; a folded `src/` section establishes the same scope before its
rule headings. Espalier keeps repository-relative paths internally and changes
only their presentation.

In distributed output, a map includes the directory where a deeper generated
document takes over and stops that branch there. If the next document is
several directories down, every intermediate directory remains expanded until
that boundary. The deeper document begins with the boundary itself, so the two
maps overlap at exactly one row and the handoff is explicit.

A folded branch has no deeper documents to continue into, so the receiving
map expands through the entire branch. Root folding shows the whole espalier.

Branches are drawn with box-drawing characters: `├─ ` for an entry with siblings still to come, `└─ ` for the last one, and, under each of those, `│  ` and three spaces respectively for everything nested inside.

```text
    ./
    ├─ clients/                external API providers
    │  │
    │  └─ [provider]/          (zero or more matching directories)
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

A line's text is the node's description, then its suffixes in parentheses. A file's description is the rule module's `description`; a directory's is the `description` in its `ESPALIER.mjs` exports. A node with neither a description nor a suffix gets no text rather than a blank column.

**The parentheses are what separate the two voices.** The description is a sentence somebody wrote; the suffixes are the espalier's annotation of it. Joined by a comma they read as one clause, and a description that already contains commas — `ownership, requiredness, and the deepest recognized node` — swallows the annotation entirely. They are parenthesized on a line that carries no description too, so the count remains visibly generated.

Constraints do not appear. They declare no file and permit none, so a map that listed them would be answering a question nobody asked of it. Each renders as a rule section below the map, beside the structural rule sections at its placement point.

### Suffixes

There are three kinds, and each is true of the line it sits on and of nothing else. That is the rule they are written to: a suffix whose subject the reader has to locate — which directory, how far up the tree — has spent more attention than it saved.

**`required` and `optional`** mark every leaf the espalier names — every static and resolved one — and neither is a default. A named file carrying no such suffix is not a file whose requiredness is left to inference; there is no such file. Both read against the line's own position, so `requestModels.ts` drawn inside `[provider]/` is required in a `[provider]/` directory, which is where the reader is looking.

A dynamic leaf carries neither. Its count suffix is `zero or more matching
files` by default, `one or more matching files` for `minMatches = 1`, and
`at least N matching files` for larger minimums. Named specializations count
toward their base collections; independent static siblings do not.

Ordinary directories carry neither. Named directory instances carry `required`
or `optional`, because they have their own existence policy in addition to
their inherited contents.

**`zero or more matching files`** or **`one or more matching files`** marks a file pattern containing a `[name]`
placeholder, such as `[button].tsx` or `test-[name].ts`. A directory pattern
uses **`zero or more matching directories`**. These counts preserve the restrictions expressed by the pattern; none
promises that an arbitrary name is accepted.

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
define the repository presented to Espalier rather than governance exclusions.
When `.gitignore` is configured, nested `.gitignore` files are discovered per
directory and use Git's relative, ordered semantics. Paths they hide do not
appear in this section at all.

One reader-facing table accounts for paths outside the project layout. Its
materialized rows come from repository candidates encountered during this
build; its generated guidance and configuration rows are independent of
repository contents.

#### Materialized paths

Only positive `.espalierignore` rules that are the final winning exclusion for
at least one visible repository candidate. External ignore files have already
removed their matches, so neither their patterns nor overlapping
`.espalierignore` declarations are materialized here.

Exact declarations whose path is absent, glob declarations with no finally
excluded match, superseded positive rules and all negations are omitted. A
retained path is governed by the structure or rejected by its closed set; it is
not an exclusion to explain.

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
| `AGENTS.MD` | Generated repository guidance; edits here will be overwritten. Modify [`ESPALIER.mjs`](espalier/ESPALIER.mjs) to change this document's persistent guidance. |
| `.espalierignore`, `espalier.config.yaml`, `espalier/` | Sources used to generate and check this repository guidance. |
```

Every distributed document names its own generated file. The root additionally
names its config, its espalier root, every `ignoreFiles` entry and
`.espalierignore` when that file exists. Root folding has the root row only.

The generated-file explanation always links to the placement point's
`ESPALIER.mjs`. It says `Modify` when that file exists and `Create` when it does
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

Reference implementation: src/clients/stripe/client.ts
```

A directory below the placement point may have prose too — a dynamic directory is never a placement point, so its rendered `ESPALIER.mjs` guidance has nowhere of its own to go. It takes the same section, headed by its path with a trailing `/`:

```markdown
## `[provider]/` — one directory per upstream provider

<the rendered ESPALIER.mjs guidance>
```

Sections appear in map order, so the map doubles as a table of contents, and a
directory's section precedes the sections of everything inside it. The heading
is relative to the placement point, like its path in that document's map:
`[provider]/client.ts` under `src/clients/`. The `Reference implementation:` line
carries the repository path from `referenceImplementation` and is omitted when
the module exports none. Inline source is deliberately unsupported: an
unvalidated duplicate inside the rule module could drift from real code.

Each constraint gets its own heading at the placement point, alongside the
structural rule sections. Constraints are ordered by their rule-file paths,
regardless of whether they check one file at a time or a group. There are no
constraint-kind or file-kind headings. The sentence immediately after a rule's
heading says which files it governs and whether each file or the whole selected
group must follow the rule:

```markdown
### no-as-any — no `as any`

Each file with exactly `.ts` as its extension under `src/` must follow this rule.

<the rule body, verbatim>

### message-registry — consistent incoming message registry

Together, paths matching `*/messages.tolk` or
`*/operations/*/message.tolk` under `src/` must follow this rule.

<the rule body, verbatim>
```

Filename extensions and exported `targets` keep their distinct meanings in
that sentence. A filename selector for `.json` selects the complete extension;
a glob `**/*.json` also matches names with earlier dots. One rule says "Each
file with exactly `.json` as its extension ..."; the other says "Each file whose
name ends in `.json` ...". For a group-wide rule, the sentence starts
"Together, files ..." instead. No category heading is needed to communicate
the difference.

With `targets = ["**/*"]`, the sentence covers each file (or all files
together) under the static prefix. This broad language requires a recursive
placeholder ending the directory and only static segments before it.
Directories after `[...name]`, a dynamic segment before it, or a more specific
selector make a broad claim false, so the sentence names the directory and
selector patterns instead. For example, a rule with a trailing `handlers/`
directory and `targets = ["**/create.ts"]` says:

```markdown
Each path matching `backend/**/create.ts` within
`backend/**/handlers/*` must follow this rule.
```

Generated documents and default descriptions in `explain` use the same
selector analysis, though the document adds the individual-or-group obligation
and `explain` describes what the constraint applies to. Specific selectors
retain their globs instead of being described as a broader file kind.

### Operational guidance

The repository root document ends with an operational introduction.
`build.guidanceMode` selects its architecture-change policy; the default
`evolving` text is shown below. The introduction names `espalier help` as this
CLI version's manual: the working loop is not the whole reference.

```markdown
## Working with Espalier

Espalier is the architecture compiler for this repository. It turns structural
rules and `ESPALIER.mjs` guidance into this generated document, then checks the
working tree against them. Use it to place new code, discover the constraints on
a path, and catch architectural drift while a change is still small.

`espalier help` prints this CLI version's manual. With no page it lists every
page.

Use this loop:

1. Find the intended path in **Project layout** and read the generated guidance
   in the nearest directory. Choose by documented purpose, not just by which
   pattern accepts the path. If the work needs a role the layout does not
   express, follow the architecture guidance below before placing it.
2. Run `espalier explain <path>` when you need to understand how a path is
   governed.
3. Create a declared file or directory with `espalier create <path>`.
   Use `espalier create <path> help` when you need to inspect template options
   or the directory's required files. A file without a custom template starts
   empty; directory creation includes only required files.
4. Review the created source, complete any placeholders, and make the remaining
   change within the structure established for the task.
5. Run `espalier lint` and follow the rule text attached to each finding.
6. Run `espalier build`, review and include any generated guidance changes,
   then run `espalier build --check` immediately before committing.

Generated guidance files are outputs, not edit targets.

A catch-all such as `modules/[module].ts` is appropriate for general-purpose
code that fits its documented purpose. Passing lint alone does not establish
that a concept belongs there. Repeated file structure, a shared contract, or a
distinct dependency policy can indicate a role that needs explicit placement
and guidance. Use an existing node that expresses that role, or add one when
needed; every helper does not need its own node. Add checks for enforceable
invariants and templates where they help create the files correctly.

Prefer explicit static nodes for known architectural roles. Introduce a
dynamic pattern when multiple instances share a defined responsibility and
contract, rather than to accommodate hypothetical future variation or avoid
naming distinct roles. Keep fixed parts of a repeated structure static. For
example, `messages/languages/[language].ts` varies the language while keeping
its architectural location explicit.

A feature task can require architecture changes even when it does not mention
rule files. Before changing the architecture, explain the gap in the current
structure, present the reasonable placement options and their tradeoffs, and
recommend an approach. Get agreement on that approach before changing
architectural policy in rules, guidance, or configuration. A feature request authorizes
implementing the feature; it does not by itself settle its architectural
design. Raise a missing architectural role before placing the work in a
catch-all.

Include changes to constraint selectors, exclusions, and requiredness in that
discussion. Explain which files become permitted, required, checked, or
excluded, and identify any guarantees the proposal removes. Moving a file
outside a check's scope changes enforcement even if the check stays intact.

Once an approach is agreed, update the corresponding `ESPALIER.mjs` for guidance
and the structural rule modules for structure, then run `espalier build`.
Implement the agreed design without repeatedly requesting approval. Reopen
the discussion if implementation requires a materially different design.
Ordinary code changes that follow the agreed architecture can proceed.

Preserve existing architectural guarantees unless changing them is part of
the task's agreed design. Loosening checks, widening patterns, or adding
exemptions merely to make the implementation pass weakens those guarantees.
A new node can also bypass existing restrictions; check which rules will
apply. When the work conflicts with the intended architecture, report the
design gap instead of hiding it in a catch-all or relaxing the rules.

Use `espalier build --force` only to restore a generated file whose provenance
marker was removed; it authorizes overwriting an unmarked document at a
planned output path.
```

A nested Espalier root does not repeat that introduction. After its node prose
and before its project layout it states the governance boundary:

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

The boundary is followed by an `Architecture changes` section for that child's
own mode, including an explicit mode label. This lets a fixed child report
gaps under an evolving parent, or an evolving child propose changes under a
fixed parent, within its own governance boundary.

In `fixed` mode the working loop is retained, while the architecture-change
paragraphs instruct the agent to use existing declared roles, report the path
and role of a gap, and pause affected work until architecture work is explicitly
authorized. They prohibit policy changes to force a fit and preserve routine
`create` and `build`. An explicit architecture task permits changes without
switching modes. See [guidance modes](../../CONFIG.MD#architecture-guidance-modes).

Set `build.espalierGuidance: false` to omit the canned operational and mode
sections, including the nested governance boundary. The setting does not
suppress provenance, structural maps, exclusions, rule bodies, or authored
`ESPALIER.mjs` guidance.

## Example

Given:

```text
espalier
├─ ESPALIER.mjs
├─ main.ts.mjs
├─ components/buttons/[button].tsx.mjs
├─ src/clients
│  ├─ ESPALIER.mjs
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

    └─ [provider]/          one directory per upstream provider (zero or more
                            matching directories)
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

Reference implementation: src/clients/stripe/client.ts

## `[provider]/requestModels.ts` — request payload types

Export one interface per endpoint the client calls.

```

`handlers/` sorts ahead of its file siblings because directories come first, and `handlers/` itself carries no text because no `ESPALIER.mjs` describes it — a blank column would say the same nothing at greater length. `no-as-any` is a constraint on `[...path]`, whose longest static prefix is the root, so it renders in the root file and not here.

## Nested espaliers

A directory holding an `espalier.config.yaml` of its own is a child espalier, and its subtree belongs to it. See [CONFIG.MD](../../CONFIG.MD#nested-espaliers).

The outer run places no document inside a child's subtree and sweeps nothing there — the subtree is not its to describe. Each child is then built as its own run, with its own `build.filename` and `fold` exports, so a monorepo can keep distributed documents at the root and one folded document inside a package that prefers it. Neither run can see the other's output, which is why neither can delete it.

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
- A documentation file **without** the marker halts the build. Move its content into the corresponding `ESPALIER.mjs` and run again; `build` will not eat a hand-written file.
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

The `human` format prints one short line per changed file and a count. A
successful build that writes and deletes nothing, or a passing `--check`, prints
`Generated guidance is up to date (N files).` The count covers planned generated
documents across the root and all included child espaliers. One document uses
`1 file`. Completion is visible even when no files change; a failed or drifting
check never prints this success line. JSONL remains the event stream described
above, with no completion record; a successful unchanged run exits zero.

## `--check`

Renders everything in memory, compares against what is on disk, writes nothing. Reports files that are missing, changed, or stale.

Exits `1` when the output differs, `2` on operational failure. Run it in CI so agents are never guided by documentation that was generated before the last espalier change.

## `--force`

Authorizes `build` to overwrite an unmarked documentation file at a planned
output path. Without it, that file is an operational failure and nothing is
written anywhere. Other planning failures still stop the entire build.

With `--check`, it permits the comparison but still writes nothing; the
unmarked target is reported as changed. It never deletes an unmarked orphan.

## Folding subtrees

Export `fold = true` in a directory's `ESPALIER.mjs` exports to fold that
directory and its entire subtree into the nearest enclosing generated document:

```js
export const description = "Application source";
export const fold = true;
export const guidance = "Application source guidance.";
```

Omitted `fold` and `fold = false` retain normal document placement. A true flag
absorbs the whole branch: descendants cannot reopen documentation boundaries,
even with an explicit `fold = false`. Sibling branches remain independent.
Folding changes only documentation placement; structural ownership, lint
constraints, and creation behavior keep their original scopes.

At the project root, `fold = true` keeps the root document and folds all other
placements into it. This serves tools that read only the repository root.
Separate child espaliers remain independent and choose their own folding.

Dynamic directories already contribute to their longest static ancestor;
folding below a dynamic segment introduces no per-instance documents and does
not fold that static ancestor or its siblings. Flags on directories containing
only constraints still apply. Every `fold` value must be a boolean,
including flags below an already folded ancestor.

Each folded placement contributes its prose and rule sections under a directory
heading relative to the receiving document. Rule headings inside that section
remain relative to their original placement. Constraints retain their explicit
selection scope. A section with no prose or rule content is omitted.

The receiving document has one map, expanded through folded directories and
stopping at retained documentation boundaries. Folded sections follow its own
rules, before Other repository paths and the complete-account sentence.
Exclusion reasons and machinery paths move to the surviving document covering
them. Local ignore patterns moved upward by folding retain their authored text
and name their original directory scope relative to the receiving document. There is one complete-account sentence per
document and operational guidance remains confined to the Espalier root.

Folding deletes obsolete provenance-marked documents through the ordinary
orphan sweep. Unfolding restores normal placements. `build --check` reports
both changes without writing. Unmarked files are never deleted as orphans,
and an unmarked file at a restored output path still requires `--force`.

## Configuration

The output filename is configured under `build` in `espalier.config.yaml`.
Document folding is authored in `ESPALIER.mjs`. See [CONFIG.MD](../../CONFIG.MD).

Every operational failure code is listed in [ERRORS.MD](../../ERRORS.MD).

## Named instances

A directory declaring `instanceOf` has inherited structure and locally authored
domain guidance. Its concrete layout includes inherited files, while inherited
rule prose stays at the shared contract. The local document names its contract.
Local file specializations document their additional obligations and identify
the inherited rule. `fold` still controls placement. Optional named directory instances receive their local generated documents
only once their source directory exists. Building guidance does not create an
absent optional instance. The ancestor map still describes its declaration.
