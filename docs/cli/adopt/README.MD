# `espalier adopt`

Brings an existing directory under the espalier: infers its shape from the files already there, writes stub rule modules, and narrows `ignore` so they take effect.

```bash
espalier adopt src/clients
```

`adopt` produces structure. It cannot produce meaning — the `rule` bodies are yours to write, and until you do, the generated documentation says where things go and nothing about how they should be written.

## Usage

```text
espalier adopt <path>

  <path>           directory to bring under the espalier
  --dry-run        print what would be written, write nothing
  --config <path>  use this config file instead of discovering one
  --format <fmt>   human or jsonl (default: human)
  --out <dest>     stdout, stderr, or a file path (default: stdout)
```

`adopt` never overwrites a rule module that already exists. The `rule` body is the expensive part and the whole point of the exercise; a re-run that ate one would be worse than no command at all. Existing modules are reported as `skipped` and left alone, so running `adopt` twice on a growing directory adds what is new and touches nothing else.

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

export const rule = ``;                  // TODO

export async function lint() {}
```

`description` is the filename without its extension, after "a" — so `requestModels.ts` gets `"a requestModels"`, which is ugly on purpose. It is marked `TODO`, it appears in the project map, and a phrase that reads like it was written by a machine is a phrase someone will replace. A plausible-sounding wrong description is the one that survives review.

and narrows the config:

```diff
 ignore:
-  - src/**
+  - src/api/**
+  - src/components/**
```

The replacement entries are the queried path's siblings — everything the old entry covered except the area now described.

Adopting an area that stays ignored would do nothing, so `adopt` edits the entry that covered it. That is the only reason it touches configuration.

When no `ignore` entry covers the path, there is nothing to narrow and `adopt` leaves the config alone. `espalier init` writes no ignore list unless asked, so that is the common case; the narrowing matters for a repository that reached for [`--ignore-all`](../init/README.MD#--ignore-all) to keep a build green while it was being described.

## What it refuses

Three targets, all for the same reason — the run could not produce a module that governs anything.

A path outside the repository, or one that is not a directory. The espalier root, which is not itself governed. And a path with a dot-prefixed segment: `espalier/.cursor/rules/` is skipped by the compiler, so `adopt .cursor` would report modules written and exit `0` while `lint` went on calling every file under it undeclared. All three fail with `invalid_adopt_target`.

Dot-prefixed paths *inside* an adopted directory are simply not inferred from — they are tooling rather than architecture, and [MATCHING.MD](../../MATCHING.MD#node-kinds) has the reasoning. They are not declared optional either, which is what everything else the inference passes over now becomes: a dot-prefixed path cannot be declared at all, so there is no module to write and nothing for the architect to revisit. `ignore` is where they belong.

The espalier root and the configuration are not inferred from either, for the reason they are invisible to matching: espalier does not describe its own machinery. Nor are they evidence of a shape — with `root: tools/espalier`, counting the espalier root as a sibling is how `adopt tools` turns `tools/espalier/` and `tools/lib/` into one dynamic directory nobody chose.

## Nested espaliers

A directory holding an `espalier.config.yaml` of its own is a child espalier, and its subtree belongs to it. See [CONFIG.MD](../../CONFIG.MD#nested-espaliers).

**A target inside a child is adopted by that child.** The espalier that gains the modules is the nearest one at or above the target, exactly as with [`explain`](../explain/README.MD#nested-espaliers), so `espalier adopt packages/web/src` writes into `packages/web/espalier/` whether it was run from the repository root or from inside the package. Writing them into the outer espalier would declare files that espalier cannot see and will never lint.

**A child inside the target is skipped.** `adopt packages` infers across every package that has no espalier of its own and passes over the ones that do — subtree, config and rule modules alike. They are not declared optional either. Optionality is what the inference says about a file it could have declared and did not always find; a child's contents are not this espalier's to declare at all, and a stub inviting the architect to revisit one would be inviting them to break the boundary.

## Inference

Three signals, all conservative, and **two of a thing is a pattern**. That threshold comes from the failure being asymmetric rather than from confidence: two directories that happen to look alike cost you a placeholder to rename, while an espalier that declared them separately forbids the third one.

**Sibling directories with matching contents** become a dynamic directory. `stripe/` and `twilio/` holding the same filenames is a strong signal that a provider is a repeating unit rather than two unrelated directories.

**Repeated filename shapes** become a dynamic leaf. Two or more files sharing an extension in one directory become `[tsx].tsx` rather than one node each.

**A file named after the directory holding it** becomes a [back-reference](../../TYPES.MD#back-references). Where every instance of a dynamic directory holds a file whose name is the instance's own, that is `{client}.ts` — one file per client, named for it, required.

**The first signal wins where they meet.** Inside a dynamic directory, the shared filenames are the evidence that made it a family — `stripe/` and `twilio/` are a repeating unit *because* both hold a `client.ts` and a `requestModels.ts`. Collapsing those into `[ts].ts` because they share an extension would discard the stronger finding and declare something nobody observed. So the intersection is declared exactly as it is, and the extension rule applies only to a directory that is not part of a family.

When in doubt, `adopt` generalises. An over-general espalier is a working one that you tighten later; an over-specific espalier declares today's files and forbids tomorrow's, so every file anyone adds is a violation. Collapsing a dynamic leaf back into two exact nodes is a two-minute edit. Discovering that your espalier has frozen the repository is a bad afternoon.

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

That espalier is wrong rather than loose. It says a client directory may hold any of those three files, so `mailgun/mailgun.ts` is `unexpected_path` on the day it is written — the over-specific failure this document warns about, reached by a route the optional rule was never meant to cover.

`{client}.ts` is the statement that is actually true, and the language already has it. `adopt` writes it when **every** instance holds a file named after itself:

```text
written   espalier/src/clients/[client]/{client}.ts.mjs
```

Every instance, not two of three. The other thresholds are two because a placeholder costs a rename and being wrong costs a forbidden file; here being wrong costs `missing_required_file` on a directory that never had one, reported the moment the espalier is written. Two clients following a convention and a third not following it is not a convention, and the optional leaves are the right answer for it.

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

Declaring the extras as a dynamic leaf was a third wrong answer, quieter than either — it silently legalises every future `.ts` file in every client directory, which is the over-general failure this document warns about everywhere else. `optional` names one file. That is the difference.

An optional declaration is still a guess, and it is the one worth reviewing first: `adopt` has seen one client with a webhook and cannot know whether that makes webhooks a client-shaped thing or makes stripe unusual. The stub says so, and renaming or deleting it is the same two-minute edit as any other.

### Placeholder names

Mechanical, and meant to be renamed:

```text
src/clients/stripe/      →  [client]      the parent directory, singularised
components/*.tsx         →  [tsx]         the extension, when there is no parent to name
alpha/, beta/            →  [directory]   at the repository root, which has no name
```

The root is the one place with no parent to borrow from — paths are root-relative, so its name is the empty string. `[directory]` is the same kind of guess as `[client]`: mechanical, obviously a placeholder, and renaming it is step one of [After adopting](#after-adopting).

Singularising is naive — it strips a trailing `s`, and nothing more. `[client]` for a `clients/` directory is right often enough to be worth doing and wrong in a way that is obvious on sight, which is the useful combination for a name you are being asked to replace.

It will not produce `[provider]`. No input contains that word; only you know it. That is why renaming is step one of what comes next, and why generated documentation is not worth reading until you have done it.

## Scope

Adopt one area at a time. `adopt .` is legal and infers across the whole repository, which on anything sizeable produces more guesses than anyone will review — and unreviewed inference is how an espalier ends up describing a shape nobody chose.

The value is in the prose you add afterwards, and prose is written per area. There is no hurry: an espalier describing three directories well beats one describing thirty badly.

## After adopting

1. Rename placeholders to words that mean something.
2. Write `description` for each module — one line, in the vocabulary of the task. It is what appears in the project map.
3. Write `rule` bodies. This is the part that makes the documentation worth generating.
4. Add `lint` functions where a check is worth having. Structural enforcement already works without them.
5. Run [`espalier build`](../build/README.MD), then [`espalier lint`](../lint/README.MD).

## Output

Three kinds of line, tagged as such under `--format jsonl`:

| `kind` | |
|---|---|
| `written` | a stub rule module this run created |
| `skipped` | a rule module that already existed and was left alone |
| `narrowed` | an `ignore` entry that was replaced |

A `written` line carries `optional` when the module it wrote declares the file optional, and `--format human` marks the same line:

```json
{"kind":"written","path":"espalier/src/clients/[client]/client.ts.mjs"}
{"kind":"written","path":"espalier/src/clients/[client]/webhook.ts.mjs","optional":true}
{"kind":"skipped","path":"espalier/src/clients/[client]/requestModels.ts.mjs"}
{"kind":"narrowed","path":"espalier.config.yaml"}
```

```text
written   espalier/src/clients/[client]/webhook.ts.mjs  (optional)
```

The marker is there because the three `written` lines are not equally trustworthy. `client.ts` was observed in every sibling; `webhook.ts` was observed in one, and whether that makes webhooks part of the shape or makes that sibling unusual is the question only the architect can answer. A report that printed them identically would be hiding its least confident guess among its most confident ones.

There is no kind for a file the inference declined to declare, because it no longer declines. Every visible file under the target is named by a module when the run finishes, and the run's output is what it wrote rather than what it gave up on.

`--dry-run` prints exactly these lines and writes nothing.

Every operational failure code is listed in [ERRORS.MD](../../ERRORS.MD).
