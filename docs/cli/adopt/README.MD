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

## Inference

Two signals, both conservative, and **two of a thing is a pattern**. That threshold comes from the failure being asymmetric rather than from confidence: two directories that happen to look alike cost you a placeholder to rename, while an espalier that declared them separately forbids the third one.

**Sibling directories with matching contents** become a dynamic directory. `stripe/` and `twilio/` holding the same filenames is a strong signal that a provider is a repeating unit rather than two unrelated directories.

**Repeated filename shapes** become a dynamic leaf. Two or more files sharing an extension in one directory become `[tsx].tsx` rather than one node each.

**The first signal wins where they meet.** Inside a dynamic directory, the shared filenames are the evidence that made it a family — `stripe/` and `twilio/` are a repeating unit *because* both hold a `client.ts` and a `requestModels.ts`. Collapsing those into `[ts].ts` because they share an extension would discard the stronger finding and declare something nobody observed. So the intersection is declared exactly as it is, and the extension rule applies only to a directory that is not part of a family.

When in doubt, `adopt` generalises. An over-general espalier is a working one that you tighten later; an over-specific espalier declares today's files and forbids tomorrow's, so every file anyone adds is a violation. Collapsing a dynamic leaf back into two exact nodes is a two-minute edit. Discovering that your espalier has frozen the repository is a bad afternoon.

### Siblings that only partly match

Real directories are rarely uniform. `adopt` declares **the intersection** — the filenames every sibling has — and reports the rest:

```text
src/clients/stripe/client.ts
src/clients/stripe/requestModels.ts
src/clients/stripe/webhook.ts
src/clients/twilio/client.ts
src/clients/twilio/requestModels.ts
```

```text
declared  [client]/client.ts
          [client]/requestModels.ts
uncovered src/clients/stripe/webhook.ts
```

The union was the alternative, and it asserts something nobody said: that every client has a webhook. It would also report `src/clients/twilio/webhook.ts` as `missing_required_file` on the very first run, which is `adopt` inventing a requirement and then complaining that it is unmet.

Declaring the extras as a dynamic leaf was the other alternative, and it is worse in the quiet direction — it silently legalises every future `.ts` file in every client directory, which is the over-general failure this document warns about everywhere else.

So the odd file out is left undeclared and named in the output. `lint` will report it as `unexpected_path` until you decide whether it is a fourth rule, a fifth client, or something that belongs elsewhere. That decision is exactly the kind `adopt` cannot make and should not fake.

### Placeholder names

Mechanical, and meant to be renamed:

```text
src/clients/stripe/      →  [client]      the parent directory, singularised
components/*.tsx         →  [tsx]         the extension, when there is no parent to name
```

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

Four kinds of line, tagged as such under `--format jsonl`:

| `kind` | |
|---|---|
| `written` | a stub rule module this run created |
| `skipped` | a rule module that already existed and was left alone |
| `uncovered` | a file the inference did not declare, and why |
| `narrowed` | an `ignore` entry that was replaced |

```json
{"kind":"written","path":"espalier/src/clients/[client]/client.ts.mjs"}
{"kind":"skipped","path":"espalier/src/clients/[client]/requestModels.ts.mjs"}
{"kind":"uncovered","path":"src/clients/stripe/webhook.ts","reason":"present in some sibling directories but not all"}
{"kind":"narrowed","path":"espalier.config.yaml"}
```

`--dry-run` prints exactly these lines and writes nothing.

Every operational failure code is listed in [ERRORS.MD](../../ERRORS.MD).
