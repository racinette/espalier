# `espalier explain`

Answers what the espalier says about a path, without running any checks.

```bash
espalier explain src/clients/
espalier explain src/clients/stripe/client.ts
espalier explain components/Modal.tsx
```

`espalier build` writes this same information into the repository as documentation, and `espalier lint` delivers the relevant part of it attached to a violation. `explain` is the direct query: useful while authoring an espalier, and useful to an agent that wants the rules for an area before writing anything.

## Usage

```text
espalier explain <path>

  <path>                a file path or a directory prefix
  --format human|jsonl  output format (default: human)
  --config <path>       use this config file instead of discovering one
```

## A prefix

Returns everything the espalier declares beneath it: what may exist, which files are required, the rule for each, and every constraint that applies in that subtree.

```text
$ espalier explain components/

components/                              shared UI components

  Declared here:
    components/buttons/[button].tsx      a button component
    components/layouts/[layout].tsx      a layout component

  Nothing else may exist under components/. Any other path is reported
  as unexpected_path.

── components/buttons/[button].tsx ───────────────────────────────────

  a button component
  [button] matches one filename segment. Zero or more may exist.

  Rule
    Default-export a single component named after the file.
    Props must be a named exported interface `<Name>Props`.

  Example
    components/buttons/SubmitButton.tsx

── Constraints applying under components/ ────────────────────────────

  no-as-any                              **/*.{ts,tsx}
    Never use `as any`. Narrow with a type guard, or widen the
    declared type.
```

The closed-set statement and the cardinality lines come from the espalier's structure rather than from anything an author wrote. They are usually the most useful part of the answer.

## A path

Returns the rule that owns it, its captures, and every constraint that applies.

The path does not have to exist. Matching is pure, so `explain` answers "would this be legal, and what would apply" before the file is written — the same question `lint` answers afterwards, from the same source, so the two cannot disagree.

For a path nothing declares, the answer is the deepest recognized node:

```text
$ espalier explain components/Modal.tsx

  components/Modal.tsx is not declared.

  The espalier recognizes components/
  Declared there:
    buttons/     a button component
    layouts/     a layout component
```

This is never a ranked guess at where the file belongs. See [MATCHING.MD](../../MATCHING.MD).

For a path `espalier` does not govern, the answer says so and names which list excluded it:

```text
$ espalier explain package.json

  package.json is not governed by espalier.
  Ignored by the default ignore list (defaultIgnore: true).
```

## Exit codes

| | |
|---|---|
| `0` | the path is declared, or the prefix contains declarations |
| `1` | the path is not declared |
| `2` | operational failure |
