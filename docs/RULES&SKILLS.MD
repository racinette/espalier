# Rules and Skills

This document explains one design choice: why `espalier export` produces both **rules** and **skills**.

The short version:

- Rules are good for files the agent has already read.
- Skills are needed before a file exists.
- Constraint rules are loaded up front because tool-level glob scoping is not reliable enough for them.
- `espalier lint` is still the source of truth for what actually applies.

For export commands and target formats, see [cli/export/README.MD](cli/export/README.MD) and [cli/export/targets/](cli/export/targets/).

## Rules Only Attach After a Read

In tools like Cursor and Claude Code, a path-based rule is usually attached when the agent **reads** a matching file.

If the agent reads `components/Button.tsx`, the tool can notice the path and add the matching rule to context.

If the agent writes to `components/Button.tsx` without reading it first, that rule does not get attached.

Writing does not load rules. Reading does.

That matters because blind edits are bad in two ways:

- The agent has not seen the current file contents.
- The agent also misses any rules that would have been attached by reading the file.

So agents should read files before changing them. That is not just a good coding habit; it is how the rule system gets the right context into the conversation.

## Why Structural Rules Become Skills

A structural rule describes a file that should exist at a particular place:

```text
components/buttons/*.tsx.mjs
```

That rule is useful in two moments.

When editing an existing button, a normal rule works: the agent reads `components/buttons/Submit.tsx`, and the matching rule can attach.

When creating a new button, there is no file to read yet. A path-based rule cannot attach, because `components/buttons/Submit.tsx` does not exist.

That is why structural rules also become skills. The skill gives the agent the placement and conventions before the file exists:

```text
Create button components under components/buttons/*.tsx.
Follow this rule text...
```

So structural rules export twice:

- as **skills**, for creation
- as **rules**, for editing files that already exist and have been read

Both use the same `rule` text. The difference is only how the agent receives it.

## Why Constraint Rules Do Not Become Skills

A constraint rule is different. It describes a style or policy for a set of files:

```text
**/*.ts/no-as-any.mjs
backend/**/*.ts/no-fetch.mjs
```

These are not things the agent creates. There is no single artifact called “the no-fetch file” that should live at a particular path. The rule says: “when working on files like this, follow this convention.”

Because of that, constraint rules do not become skills.

They become rules that are loaded into context by default. Each one includes a **Scope** section that says when it applies:

```text
This rule applies when editing files matching:

backend/**/*.ts
```

The agent uses that Scope text to decide whether the rule matters for the current task.

## Why Constraint Rules Are Not Really Glob-Scoped

This is the important limitation.

At lint time, selectors are exact. If a constraint is written for:

```text
deep/nested/folder/**/*.ts
```

then `espalier lint` can apply it only to those files.

Export cannot promise the same thing. Cursor and Claude Code do not give us a reliable way to say: “load this rule only for files under this exact nested selector, including new files that do not exist yet.”

Even a broad rule like `**/*.ts` only attaches by path after a matching file is read. If the agent is creating a new `.ts` file, there is nothing to read, so that attachment would not happen.

So constraint rules are loaded eagerly instead. They are visible by default, and Scope explains where they apply. This is less precise than lint, but it is more useful than hiding the rule until after the agent has already written the new file.

The contract is:

- Export helps the agent make the right choice early.
- Scope tells the agent when a constraint applies.
- `espalier lint` enforces the selector precisely after the file exists.

## Why the Layout Is Always Present

The project layout is a small map of the structural tree. It tells the agent where things belong without loading every skill at once.

It should always be available because placement decisions happen before the agent knows which exact file it will read or create.

The layout does not replace skills. It only orients the agent. Skills carry the full creation guidance.

## Summary

`espalier` exports guidance this way because rule attachment is read-based:

- Existing file: read first, then path rules can attach.
- New structural file: use a skill, because there is no file to read.
- Constraint rule: load it by default, because glob-scoped attachment is too limited for creation and deep selectors.
- Final truth: run `espalier lint`.

The goal is not to model every selector perfectly in the agent tool. The goal is to give the agent useful guidance early, then let the linter enforce the exact rules.
