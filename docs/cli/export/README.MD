# `espalier export`

Agents need guidance in forms their tools understand — rules, invocable skills, a stable map of where code belongs. Hand-maintaining those artifacts alongside an espalier guarantees drift: the linter enforces one thing while the agent reads another.

`espalier export` compiles the espalier into target-specific agent artifacts. The espalier remains the single source of truth; exports are generated outputs. Regenerate after every espalier change, and do not edit them by hand.

```bash
espalier export
```

To fail CI when the source changed but committed exports did not:

```bash
espalier export check
```

Output paths and enabled targets are configured in `espalier.config.yaml`. See [CONFIG.MD](../../CONFIG.MD). Concrete file formats differ per target — see [targets/](targets/).

For why skills and rules are separate, how agent tools load them, and why constraint selectors behave differently in export than in lint, see [RULES&SKILLS.MD](../../RULES&SKILLS.MD).

## Why export exists

`espalier` closes the loop between architectural intent and what agents actually do. Linting enforces constraints after the fact; export supplies the **before** guidance so agents start closer to the target.

Without export, teams copy `rule` text into Cursor rules, Claude instructions, or internal docs by hand. Those copies diverge from the modules `espalier lint` actually runs. Export keeps agent guidance and validation aligned because both are compiled from the same `.mjs` files.

## What export produces

From each rule module, the exporter derives agent-facing surfaces. **Linters are not exported** — they run via `espalier lint` (see [lint/README.MD](../lint/README.MD)).

| Output | Source rules | Role |
|--------|--------------|------|
| **Skills** | Structural only | Creation — where new code goes, how it is named, what conventions apply |
| **Rules** | Structural + constraint | Agent context — structural rules attach when a matching file is read; constraint rules load eagerly (see [RULES&SKILLS.MD](../../RULES&SKILLS.MD)) |
| **Project layout** | Structural only | Orientation — a compact map of the repository shape, always available |

All three describe the same conventions from the same modules. They differ in **how and when** the agent receives them, not in what the project requires.

### One `rule`, multiple surfaces

Every rule module exports a mode-invariant `rule` string (see [README.MD](../../../README.MD#writing-rules)). The exporter embeds that text in skills and rules without rewriting it. Creation and editing use different delivery mechanisms — skills for new artifacts, rules for context during work — but the conventions stay identical.

**Structural rules** govern _what exists and where_. They export as skills (creation) and as rules that attach when the agent reads a matching path (editing). Their `contentDescription` feeds the project layout annotations and skill summaries.

**Constraint rules** govern _how code is written_ for files matching a selector at lint time. They export as **eagerly loaded** editing rules, not as skills. Rationale: [RULES&SKILLS.MD](../../RULES&SKILLS.MD).

### Project layout

The layout is a deterministic tree built from the structural portion of the espalier: directories preserved, `.mjs` suffixes stripped, `contentDescription` inlined beside each entry. Constraint rules are omitted. It gives agents a small, stable overview of where new code belongs without loading every skill at once.

How each target renders the layout (standalone file, always-on rule, etc.) is defined in that target's doc.

## How this fits the development loop

Export does not replace lint. It complements it:

| Moment | Export | Lint |
|--------|--------|------|
| Agent plans or creates new code | Layout + skills + eager constraint rules (Scope) | — |
| Agent edits an existing file | Layout + structural rule on read + constraint rules (Scope) | — |
| Agent (or CI) finishes a change | — | Selector-accurate checks |

Guidance from export steers; lint corrects. See [TYPES.MD](../../TYPES.MD) for lint context shapes.

## Configuration

Configure at least:

- **`root`** — directory containing the espalier tree
- **`export.<target>`** — per-target output locations and options

Targets may place skills and rules in separate directories when the tool treats them differently. Details are target-specific.

## Export targets

| Target | Doc |
|--------|-----|
| Cursor | [targets/CURSOR.MD](targets/CURSOR.MD) |
| Claude Code | [targets/CLAUDE-CODE.MD](targets/CLAUDE-CODE.MD) |

Each target adapts the same three outputs to what its runtime supports. Formats, frontmatter, directory layout, and templates live in the target docs — not here.

## Practices

- **Regenerate, don't patch.** Treat exports like build artifacts.
- **Write `contentDescription` for humans and agents.** It appears in the layout and drives skill descriptions; prefer `"a button component"` over `"button.tsx file"`.
- **Write constraint Scope text clearly.** Export cannot hide subtree selectors from context; agents rely on Scope during creation; lint enforces selectors.
- **Commit exports when your workflow expects it.** Use `espalier export check` in CI so agents never follow stale guidance.
