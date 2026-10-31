# `espalier adopt`

Brings an existing directory under the espalier: infers its shape from the
visible files already there and writes stub rule modules. It never changes
repository exclusion policy.

```bash
espalier adopt src/clients
```

`adopt` produces structure. It cannot produce meaning — the `guidance` bodies are yours to write, and until you do, the generated documentation says where things go and nothing about how they should be written. Choosing a rule's kind and writing that prose is [`espalier help authoring`](../help/README.MD).

Adoption changes architectural declarations. In a
[locked](../../LOCKS.MD) part of the espalier, agents need explicit
authorization for that work. The command itself runs either way and never
adds, removes or changes a `locked` export.

## Usage

```text
espalier adopt <path> [--dry-run] [--force]

  <path>           directory to bring under the espalier
  --dry-run        print what would be written, write nothing
  --force          migrate build-output conflicts into ESPALIER.mjs
  --config <path>  use this config file instead of discovering one
  --format <fmt>   human or jsonl (default: human)
  --out <dest>     stdout, stderr, or a file path (default: stdout)
```

`adopt` never overwrites a rule module that already exists. The `guidance` body is the expensive part and the whole point of the exercise; a re-run that ate one would be worse than no command at all. Existing modules are reported as `skipped` and left alone, so running `adopt` twice on a growing directory adds what is new and touches nothing else.

## What it infers

Given:

```text
src/clients/stripe/client.ts
src/clients/stripe/requestModels.ts
src/clients/twilio/client.ts
src/clients/twilio/requestModels.ts
```

`adopt` notices sibling directories with matching contents and writes:

```text
espalier/src/clients/[client]/client.ts.mjs
espalier/src/clients/[client]/requestModels.ts.mjs
```

```js
export const description = "a client";   // TODO

export const guidance = ``;                  // TODO

export async function lint() {}
```

`description` is the filename without its complete extension, after "a" — so
`requestModels.ts` gets `"a requestModels"`. It is marked `TODO`: replace it
with a brief description of what the file is for. The placeholder deliberately
does not pretend to know the file's role in the project.

`adopt` does not edit `.espalierignore`. A target excluded by repository policy
fails with `invalid_adopt_target`; explicitly re-include the directory and its
contents before adopting it. Excluded descendants remain ungoverned
and produce no inferred modules.

If a visible file occupies a documentation path the configured build will own,
the run names every conflict and its corresponding source-side `ESPALIER.mjs`,
then writes nothing. `adopt --force` preserves each document verbatim in a
source-tagged block in that `ESPALIER.mjs`. Existing source prose is retained,
and rerunning the migration replaces the same block rather than duplicating it.
The original document remains until `espalier build --force` replaces it.
New guidance modules store the preserved text as a string export. Existing
legacy Markdown and the serialized string exports produced by adoption or
migration can be updated automatically. Other authored module forms, including
computed guidance, require merging the document into the module manually;
adoption reports the source and refuses before writing its planned changes.

## What it refuses

A path outside the repository, one that is not a directory, one repository
policy excludes, or the espalier root fails with `invalid_adopt_target`.

Dot-prefixed targets and descendants participate in inference like any other
path. To adopt a path such as `.github`, first remove any exclusion for it from
repository policy (including the editable defaults written by `init`).
Adoption also refuses, before writing anything, if `skip` or the reserved
rule-tree bookkeeping directory would hide any proposed module or migrated prose.

The espalier root and the configuration are not inferred from either, for the reason they are invisible to matching: espalier does not describe its own machinery. Nor are they evidence of a shape — with `root: tools/espalier`, counting the espalier root as a sibling is how `adopt tools` turns `tools/espalier/` and `tools/lib/` into one dynamic directory nobody chose.

## Nested espaliers

A directory holding an `espalier.config.yaml` of its own is a child espalier, and its subtree belongs to it. See [CONFIG.MD](../../CONFIG.MD#nested-espaliers).

**A target inside a child is adopted by that child.** The espalier that gains the modules is the nearest one at or above the target, exactly as with [`explain`](../explain/README.MD#nested-espaliers), so `espalier adopt packages/web/src` writes into `packages/web/espalier/` whether it was run from the repository root or from inside the package. Writing them into the outer espalier would declare files that espalier cannot see and will never lint.

**A child inside the target is skipped.** `adopt packages` infers across every package that has no espalier of its own and passes over the ones that do — subtree, config and rule modules alike. They are not declared optional either. Optionality is what the inference says about a file it could have declared and did not always find; a child's contents are not this espalier's to declare at all, and a stub inviting the architect to revisit one would be inviting them to break the boundary.

## Inference

Inference uses three structural signals. Two observed instances are enough to
infer a repeating pattern. This threshold identifies candidates for review;
it does not establish that the instances share an architectural role.

**Sibling directories with matching contents** become a dynamic directory.
`stripe/` and `twilio/` holding the same filenames suggest a repeating unit.
The author decides whether they share a responsibility and contract.

**Repeated filename shapes** become a dynamic leaf. Two or more files sharing a complete extension in one directory become `[tsx].tsx` rather than one node each. `.ts` and `.d.ts` are separate groups.

**A file named after the directory holding it** becomes a [back-reference](../../MATCHING.MD#back-references). Where every instance of a dynamic directory holds a file whose name is the instance's own, that is `{client}.ts` — one file per client, named for it, required.

**The first signal wins where they meet.** Inside a dynamic directory, the shared filenames are the evidence that made it a family — `stripe/` and `twilio/` are a repeating unit *because* both hold a `client.ts` and a `requestModels.ts`. Collapsing those into `[ts].ts` because they share an extension would discard the stronger finding and declare something nobody observed. So the intersection is declared exactly as it is, and the extension rule applies only to a directory that is not part of a family.

These heuristics can generalize files that have distinct responsibilities.
The inferred tree describes observed shape, not an agreed design. Review each
dynamic pattern: retain it for instances sharing a responsibility and contract,
and use static nodes for distinct known roles. Keep fixed parts of repeated
structures explicit. A successful adoption or clean lint run does not establish
that the inferred grouping is appropriate.

### A file named after its directory

Some layouts name the entry point after the thing it implements:

```text
src/clients/stripe/stripe.ts
src/clients/twilio/twilio.ts
src/clients/sendgrid/sendgrid.ts
```

There is nothing in common between those three filenames, so the other two signals have nothing to work with. Read as ordinary members they are three names, each held by one sibling out of three, and the honest reading of that is three optional leaves:

```text
espalier/src/clients/[client]/sendgrid.ts.mjs  (optional)
espalier/src/clients/[client]/stripe.ts.mjs    (optional)
espalier/src/clients/[client]/twilio.ts.mjs    (optional)
```

That structure does not express the observed naming relationship. It permits
those three filenames in any client directory but rejects `mailgun/mailgun.ts`.
A back-reference preserves the relationship while allowing new instances.

`{client}.ts` is the statement that is actually true, and the language already has it. `adopt` writes it when **every** instance holds a file named after itself:

```text
written   espalier/src/clients/[client]/{client}.ts.mjs
```

The repeated name includes any dots in the directory name:
`foo.bar/foo.bar.ts` follows the same convention.

Every observed instance must satisfy the naming relationship. A back-reference
requires a corresponding file in each instance, so inferring it from only two
of three directories would report `missing_required_file` for the third.
When the relationship is not universal, inference retains optional literal
leaves for review.

### Siblings that only partly match

Real directories are rarely uniform. `adopt` declares the filenames every sibling has as required, and the rest as [optional](../../TYPES.MD#optional):

```text
src/clients/stripe/client.ts
src/clients/stripe/requestModels.ts
src/clients/stripe/webhook.ts
src/clients/twilio/client.ts
src/clients/twilio/requestModels.ts
```

```text
written   espalier/src/clients/[client]/client.ts.mjs
written   espalier/src/clients/[client]/requestModels.ts.mjs
written   espalier/src/clients/[client]/webhook.ts.mjs
```

The third module carries `export const optional = true;`, and the run says exactly what the tree says: every client has a `client.ts` and a `requestModels.ts`, and a client may have a `webhook.ts`.

The two alternatives were both false, which is why this needed a third statement rather than a better guess. Declaring `webhook.ts` required asserts something nobody said — that every client has one — and reports `src/clients/twilio/webhook.ts` as `missing_required_file` on the very first run, which is `adopt` inventing a requirement and then complaining that it is unmet. Leaving it undeclared is the opposite failure: `lint` reports `unexpected_path` for a file everyone agrees belongs there, and the first thing the command does after succeeding is hand you a broken repository.

Declaring the extras as a dynamic leaf would silently legalise every future
`.ts` file in every client directory. The inferred optional declarations name
the observed files individually, preserving the narrower structure. On a
dynamic leaf, `minMatches` controls collection cardinality and `optional` is
not accepted; see [TYPES.MD](../../TYPES.MD#minmatches).

An optional declaration also needs review: `adopt` has seen one client with a
webhook and cannot know whether webhooks belong in every client's contract or
whether that sibling needs a distinct role. Resolve that question before
accepting the declaration.

**A directory only some siblings have is declared where it stands, and everything inside it is optional too.** It never joins a family: the shape it would be claiming to share is one nobody observed twice, so it keeps its own name rather than becoming a placeholder. Optionality is inherited, because a file inside a directory that only sometimes exists only sometimes exists.

### Placeholder names

Mechanical, and meant to be renamed:

```text
src/clients/stripe/      →  [client]      the parent directory, singularised
components/*.tsx         →  [tsx]         the extension, when there is no parent to name
alpha/, beta/            →  [directory]   at the repository root, which has no name
```

Leading dots are removed from a parent name before singularising it. Remaining
characters that cannot appear in a capture name become underscores; a leading
digit gains an underscore. Thus `.features/alpha/` suggests `[feature]`.

The root is the one place with no parent to borrow from — paths are root-relative, so its name is the empty string. `[directory]` is the same kind of guess as `[client]`: mechanical, obviously a placeholder, and reviewing its role comes before renaming it in [After adopting](#after-adopting).

Singularising is naive — it strips a trailing `s`, and nothing more. `[client]` for a `clients/` directory is right often enough to be worth doing and wrong in a way that is obvious on sight, which is the useful combination for a name you are being asked to replace.

It will not produce `[provider]`. No input contains that word; only you know it. Review the inferred role first, then name the placeholder before generating guidance.

Documentation ownership follows `fold` exports as well as the inferred
static spine. Beneath a folded directory, a file named like `build.filename`
is an ordinary repository file unless it bears Espalier's provenance marker.
The enclosing document remains build-owned.

## Scope

Adopt one area at a time. `adopt .` is legal and infers across the whole repository, which on anything sizeable produces more guesses than anyone will review — and unreviewed inference is how an espalier ends up describing a shape nobody chose.

The value is in the prose you add afterwards, and prose is written per area. There is no hurry: an espalier describing three directories well beats one describing thirty badly.

## After adopting

1. Review the inferred structure. Discuss the placement options and agree on
   the design before accepting or reshaping it. Check whether dynamic groups
   share a role and contract, which parts should remain static, and whether
   required and optional files express the intended guarantees.
2. Rename retained placeholders to words that mean something.
3. Write `description` for each module using the project's vocabulary, and
   write `guidance` bodies that state the agreed requirements.
4. Implement checks in the generated `lint` functions where worthwhile. The
   `lint` export is optional; structure is enforced without it, so delete the
   stub where there is nothing to check. Test implemented checks against valid
   and violating examples.
5. Run [`espalier build`](../build/README.MD), review the generated guidance,
   then run [`espalier lint`](../lint/README.MD) and `espalier build --check`.

## Output

Three kinds of line, tagged as such under `--format jsonl`:

| `kind` | |
|---|---|
| `written` | a stub rule module this run created |
| `skipped` | a rule module that already existed and was left alone |
| `migrated` | a build-owned document preserved in its durable `ESPALIER.mjs` source |

A `written` line carries `optional` when the module it wrote declares the file optional, and `--format human` marks the same line:

```json
{"kind":"written","path":"espalier/src/clients/[client]/client.ts.mjs"}
{"kind":"written","path":"espalier/src/clients/[client]/webhook.ts.mjs","optional":true}
{"kind":"skipped","path":"espalier/src/clients/[client]/requestModels.ts.mjs"}
{"kind":"migrated","from":"src/AGENTS.MD","path":"espalier/src/ESPALIER.mjs"}
```

```text
written   espalier/src/clients/[client]/webhook.ts.mjs  (optional)
```

The marker is there because the three `written` lines are not equally trustworthy. `client.ts` was observed in every sibling; `webhook.ts` was observed in one, and whether that makes webhooks part of the shape or makes that sibling unusual is the question only the architect can answer. A report that printed them identically would be hiding its least confident guess among its most confident ones.

There is no output kind for an eligible file the inference declined to declare:
every file eligible for adoption is covered by a module when the run finishes.
Excluded paths, child espaliers, and Espalier's own machinery
are outside that claim. The report says what was written, not what was given up
on.

`--dry-run` prints exactly these lines and writes nothing.

Every operational failure code is listed in [ERRORS.MD](../../ERRORS.MD).
