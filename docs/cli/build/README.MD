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
espalier build [--check] [--inline] [--config <path>]

  --check          compare generated output against what is on disk,
                   write nothing, exit 1 if they differ
  --inline         write a single document at the root instead of
                   distributing files through the tree
  --config <path>  use this config file instead of discovering one
```

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
3. Drop placement points with no assigned rules and no `ESPALIER.MD` — an intermediate directory whose content all lives deeper produces no file, and agents walking up still find the deeper one.
4. Render each surviving point.
5. Write with a provenance header, in deterministic order.

Ordering is directories before files, then lexicographic, static before dynamic, so output is byte-comparable between runs.

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

```markdown
<!-- src/clients/AGENTS.MD -->

Outbound API integrations. Every upstream provider gets its own directory;
nothing outside src/clients/ performs HTTP requests directly.

## Structure

    [provider]/                    one directory per upstream provider
      client.ts                    an integration with an external API
      requestModels.ts             request payload types
      handlers/
        webhook.ts                 an inbound webhook handler

Zero or more provider directories may exist. For each one that does,
client.ts and requestModels.ts are required; handlers/webhook.ts is
optional. Nothing else may exist under src/clients/.

## src/clients/[provider]/client.ts — an integration with an external API

Export a single `create<Provider>Client(config)` factory. All requests go
through the shared helper in `src/clients/request.ts`; do not call fetch
directly.

Example: src/clients/stripe/client.ts
```

## Ownership

Output is distributed through the tree rather than confined to one directory, so ownership is tracked by provenance rather than by path. Every generated file opens with a marker:

```markdown
<!-- generated by espalier — do not edit — source: espalier/src/clients -->
```

That one line does three jobs: it tells `build` which files it may delete, it tells `lint` which files to skip, and it tells `build` what it must not touch.

- Files bearing the marker are rewritten each run. Any that this run did not produce — because the espalier node was renamed or removed — are deleted, since a document that keeps steering agents after its rule is gone is worse than no document.
- A documentation file **without** the marker halts the build. Move its content into the corresponding `ESPALIER.MD` and run again; `build` will not eat a hand-written file.
- Generated files are invisible to matching, so espalier's own output is never reported as `unexpected_path`.

No record of past runs is kept. Finding orphans is a scan of the file list `build` already has for files matching the configured filename and carrying the marker — a manifest would be a second source of truth with nothing to add.

## `--check`

Renders everything in memory, compares against what is on disk, writes nothing. Reports files that are missing, changed, or stale.

Exits `1` when the output differs, `2` on operational failure. Run it in CI so agents are never guided by documentation that was generated before the last espalier change.

## `--inline`

Writes one document at the root containing every rule body, and no distributed files.

The distributed form assumes agents pick up documentation from ancestor directories of the file they are working on. A tool that reads only the repository root gets nothing from distribution, and `--inline` gives it everything in the one file it does read. The cost is that the whole repository's rules are resident at all times, which is why it is not the default.

## Configuration

The output filename and inline mode are configured under `build` in `espalier.config.yaml`. See [CONFIG.MD](../../CONFIG.MD).
