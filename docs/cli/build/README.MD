# `espalier build`

Generates the repository's agent-facing documentation from the espalier.

```bash
espalier build
espalier build --check
espalier build --inline
```

Everything `build` writes is a generated artifact. The espalier is the source of truth; regenerate after changing it, and do not edit the output by hand.

## Usage

```text
espalier build [--check] [--inline] [--format <fmt>] [--out <dest>] [--config <path>]

  --check          compare generated output against what is on disk,
                   write nothing, exit 1 if they differ
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

**A local map** — the whole subtree beneath this point, one line per node, including nodes whose bodies live in a deeper file. Shape propagates upward.

**Rule bodies** — only for rules placed *here*. Detail does not propagate upward.

**Cardinality and the closed set** — which files are required, which may appear zero or more times, and the statement that nothing else may exist. These come from the espalier's structure rather than from anything an author writes, and they are the most useful lines in the file for an agent about to create something.

**Node prose** — the body of the directory's `ESPALIER.MD`, if it has one.

**The amendment instruction** — that the espalier is not the reader's to change, and that work which does not fit the declared structure should be reported rather than legalised. Every file carries it, because an agent that reads a rule and finds it inconvenient is exactly the agent that needs to have read this. See [README.MD](../../../README.MD#who-changes-the-espalier).

The root file additionally carries the project preamble, the map of the entire repository, and instructions to run `espalier lint`.

## Generation

1. Walk the static spine from the root, stopping at the first dynamic segment. Those are the placement points.
2. Assign every rule to the longest static prefix of its directory path.
3. Drop placement points with no assigned rules and no `ESPALIER.MD` — an intermediate directory whose content all lives deeper produces no file, and agents walking up still find the deeper one. The root is never dropped: it is the one file every tool reads, and it alone carries the map of the whole repository and the instruction to run `lint`.
4. Render each surviving point.
5. Write with a provenance header, in deterministic order. A file whose rendered bytes match what is already on disk is left alone rather than rewritten, so a second run touches nothing and reports nothing.

Everywhere siblings are listed — in a map, in a cardinality sentence, in the order files are written — the order is: directories before files, then static before dynamic, then lexicographic by authored name. All three tiers do work, and together they are total, so output is byte-comparable between runs.

## Rendering

The document is assembled in a fixed order. A section with nothing to say is omitted entirely, along with its heading; no placeholder text is ever written.

```text
provenance marker
node prose                    the ESPALIER.MD body, verbatim
## Structure                  the map, then the cardinality paragraph
## <rule> — <description>     one per structural rule placed here
## Constraints                one ### per constraint placed here
## Checking your work         root file only
## Amending this structure    fixed text, every file
```

Text `espalier` composes — the cardinality paragraph — is greedily wrapped at 80 columns. Text an author wrote — node prose, rule bodies — is copied verbatim and never re-wrapped, because reflowing someone's markdown is how a tool mangles a table. Map lines are never wrapped either; an alignment column that survived a wrap would not be one.

### The map

An indented code block, one line per structural node in the subtree, depth-first in sibling order. Directories carry a trailing `/`. Names are authored form, so a dynamic node appears as `[provider]/` or `[button].tsx`.

Each line is its name, then its description. Descriptions align to one column across the whole map: two spaces after the longest rendered name, including its tree indentation but not the four spaces of the code block, which are added to every line afterwards and so cannot change the alignment. A file's description is the rule module's `description`; a directory's is the `description` in its `ESPALIER.MD` frontmatter, and a directory without one gets no description rather than a blank column.

Constraints do not appear. They declare no file and permit none, so a map that listed them would be answering a question nobody asked of it. Their bodies render below, under `## Constraints`.

### The cardinality paragraph

One paragraph, covering **the same subtree the map covers**. A closed-set statement that stopped at the next placement point would not be closed, and an agent reading the root file to find out where a new file may go is asking about the repository, not about the root directory.

Walking that subtree in map order produces, in this order:

1. **Required here.** `<a>, <b> and <c> are required.` — every static leaf reachable from this point through static directories only, as paths relative to it.
2. **Per dynamic directory.** ``Zero or more `<path>/` directories may exist.`` When instantiating it requires files: `For each one that does, <a>, <b> and <c> are required.`, those paths relative to the instance.
3. **Per dynamic leaf.** ``Zero or more files matching `<path>` may exist.``
4. **The closed set.** `Nothing else may exist under <path>/.`, or `under the repository root.` at the root.

Sentences 2 and 3 name the node by its authored path relative to the placement point, in backticks — `[provider]/` for an immediate child, `src/clients/[provider]/` for one further down. Both the brackets and the path are load-bearing: an agent is being told a shape it has to reproduce and a place to reproduce it, and "zero or more provider directories" tells it neither.

A directory holding both a dynamic directory and a dynamic leaf simply gets both sentences, in that order, and one closing sentence covering them together. That shape is legal — see [MATCHING.MD](../../MATCHING.MD#ambiguity-is-rejected) — and two open sets are describable as long as each is described.

Lists join with commas and a final `and`. A single item takes neither.

### Rule sections

```markdown
## src/clients/[provider]/client.ts — an integration with an external API

<the rule body, verbatim>

Example: src/clients/stripe/client.ts
```

A directory below the placement point may have prose too — a dynamic directory is never a placement point, so its `ESPALIER.MD` body has nowhere of its own to go. It takes the same section, headed by its path with a trailing `/`:

```markdown
## src/clients/[provider]/ — one directory per upstream provider

<the ESPALIER.MD body, verbatim>
```

Sections appear in map order, so the map doubles as a table of contents, and a directory's section precedes the sections of everything inside it. The heading is the rule's full path from the repository root, not from the placement point — an agent reading `src/clients/AGENTS.MD` is being told where the file goes, and a relative fragment makes it guess. The `Example:` line is omitted when the module exports no `example`, and carries the path form or a fenced block for the inline form.

Constraints render the same way one level down, under a shared `## Constraints` heading, with the rule name as the `###` heading and a line naming what it applies to:

```markdown
## Constraints

### no-as-any — applies to TypeScript files throughout the project

Applies to: `**/*.ts`, `**/*.tsx`

<the rule body, verbatim>
```

### Fixed text

Every file ends with the amendment instruction, verbatim:

```markdown
## Amending this structure

This file is generated from `espalier/`, and the structure it describes is not
yours to change. If the work does not fit — a file has nowhere legal to go, or a
rule is wrong for the task — YOU MUST stop and report the gap. YOU MUST NOT
widen a pattern, add a rule, or edit `espalier/` to make an error go away.
Deciding the shape of this project is the architect's job, and a task that
appears to require changing that shape is a task to hand back, not to unblock.
```

The root file additionally carries, immediately before it:

```markdown
## Checking your work

Run `espalier lint` before you finish. Every violation it reports arrives with
the rule text attached, so a failure tells you what to do and not only what is
wrong.
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

`src/clients/AGENTS.MD` in full — the amendment instruction included, since every file carries it:

```markdown
<!-- generated by espalier — do not edit — source: espalier/src/clients -->

Outbound API integrations. Every upstream provider gets its own directory;
nothing outside src/clients/ performs HTTP requests directly.

## Structure

    [provider]/         one directory per upstream provider
      handlers/
        webhook.ts      an inbound webhook handler
      client.ts         an integration with an external API
      requestModels.ts  request payload types

Zero or more `[provider]/` directories may exist. For each one that does,
handlers/webhook.ts, client.ts and requestModels.ts are required. Nothing
else may exist under src/clients/.

## src/clients/[provider]/handlers/webhook.ts — an inbound webhook handler

Verify the provider's signature before parsing the body. Return 2xx only
after the event is durably recorded.

## src/clients/[provider]/client.ts — an integration with an external API

Export a single `create<Provider>Client(config)` factory. All requests go
through the shared helper in `src/clients/request.ts`; do not call fetch
directly.

Example: src/clients/stripe/client.ts

## src/clients/[provider]/requestModels.ts — request payload types

Export one interface per endpoint the client calls.

## Amending this structure

This file is generated from `espalier/`, and the structure it describes is not
yours to change. If the work does not fit — a file has nowhere legal to go, or a
rule is wrong for the task — YOU MUST stop and report the gap. YOU MUST NOT
widen a pattern, add a rule, or edit `espalier/` to make an error go away.
Deciding the shape of this project is the architect's job, and a task that
appears to require changing that shape is a task to hand back, not to unblock.
```

`handlers/` sorts ahead of its file siblings because directories come first, and the cardinality sentence lists the same three leaves in the same order — a reader comparing the sentence against the map should not have to re-sort it in their head. `no-as-any` is a constraint on `[...path]`, whose longest static prefix is the root, so it renders in the root file and not here.

## Ownership

Output is distributed through the tree rather than confined to one directory, so ownership is tracked by provenance rather than by path. Every generated file opens with a marker:

```markdown
<!-- generated by espalier — do not edit — source: espalier/src/clients -->
```

That one line does three jobs: it tells `build` which files it may delete, it tells `lint` which files to skip, and it tells `build` what it must not touch.

`source:` names the espalier directory the file was rendered from — the configured `root` for the root document, `root` plus the placement point below it otherwise. It is there for a human reading the generated file who wants to know where to go and edit; nothing reads it back, and orphan detection uses the marker's presence rather than its contents.

- Files bearing the marker are rewritten each run. Any that this run did not produce — because the espalier node was renamed or removed — are deleted, since a document that keeps steering agents after its rule is gone is worse than no document.
- A documentation file **without** the marker halts the build. Move its content into the corresponding `ESPALIER.MD` and run again; `build` will not eat a hand-written file.
- Generated files are invisible to matching, so espalier's own output is never reported as `unexpected_path`.

Only files are deleted. A directory left empty by an orphan deletion stays, because git does not track it and because a tool that removes directories it did not create is one bad path away from removing something it should not have.

No record of past runs is kept. Finding orphans is a scan of the file list `build` already has for files matching the configured filename and carrying the marker — a manifest would be a second source of truth with nothing to add.

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

## `--inline`

Writes one document at the root containing every rule body, and no distributed files.

The distributed form assumes agents pick up documentation from ancestor directories of the file they are working on. A tool that reads only the repository root gets nothing from distribution, and `--inline` gives it everything in the one file it does read. The cost is that the whole repository's rules are resident at all times, which is why it is not the default.

The document is the root document with the other placement points folded into it. After the root's own structure and rules, each remaining point in map order becomes a section:

```markdown
## src/clients/

Outbound API integrations. Every upstream provider gets its own directory;
nothing outside src/clients/ performs HTTP requests directly.

Zero or more `[provider]/` directories may exist. For each one that does,
handlers/webhook.ts, client.ts and requestModels.ts are required. Nothing
else may exist under src/clients/.

### src/clients/[provider]/client.ts — an integration with an external API
```

Everything shifts one heading level down; nothing else changes, and the rule bodies are the same bytes they would have been distributed. There is no second map — the root's already covers the repository — and the amendment instruction appears once, at the end.

Switching modes deletes the files the other mode produced. They carry the marker, this run did not produce them, and that is the whole orphan rule doing its ordinary job.

## Configuration

The output filename and inline mode are configured under `build` in `espalier.config.yaml`. See [CONFIG.MD](../../CONFIG.MD).

Every operational failure code is listed in [ERRORS.MD](../../ERRORS.MD).
