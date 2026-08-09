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
```

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
espalier/src/clients/[provider]/client.ts.mjs
espalier/src/clients/[provider]/requestModels.ts.mjs
```

```js
// espalier/src/clients/[provider]/client.ts.mjs

export const description = "a client";   // TODO

export const rule = String.raw``;        // TODO

export async function lint() {}
```

and narrows the config:

```diff
 ignore:
-  - src/**
+  - src/api/**
+  - src/components/**
```

Adopting an area that stays ignored would do nothing, so `adopt` edits the entry that covered it. That is the only reason it touches configuration.

## Inference

Two signals, both conservative:

**Sibling directories with matching contents** become a dynamic directory. `stripe/` and `twilio/` holding the same filenames is a strong signal that a provider is a repeating unit rather than two unrelated directories.

**Repeated filename shapes** become a dynamic leaf. Several `.tsx` files in one directory become `[component].tsx` rather than one node each.

When in doubt, `adopt` generalises. An over-general espalier is a working one that you tighten later; an over-specific espalier declares today's files and forbids tomorrow's, so every file anyone adds is a violation. Collapsing `[component].tsx` back into two exact nodes is a two-minute edit. Discovering that your espalier has frozen the repository is a bad afternoon.

Placeholder names are guessed from the directory or extension and are meant to be renamed. `[provider]` reads better than `[dir]` in generated documentation and in `lint` captures, and only you know which word is right.

## Scope

Adopt one area at a time. `adopt .` is legal and infers across the whole repository, which on anything sizeable produces more guesses than anyone will review — and unreviewed inference is how an espalier ends up describing a shape nobody chose.

The value is in the prose you add afterwards, and prose is written per area. There is no hurry: an espalier describing three directories well beats one describing thirty badly.

## After adopting

1. Rename placeholders to words that mean something.
2. Write `description` for each module — one line, in the vocabulary of the task. It is what appears in the project map.
3. Write `rule` bodies. This is the part that makes the documentation worth generating.
4. Add `lint` functions where a check is worth having. Structural enforcement already works without them.
5. Run [`espalier build`](../build/README.MD), then [`espalier lint`](../lint/README.MD).
