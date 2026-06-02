# Cursor export target

Cursor consumes exported guidance as **project rules** (`.mdc` under `.cursor/rules/`) and **project skills** (directories with `SKILL.md` under `.cursor/skills/`). This target maps espalier's three outputs onto those surfaces.

Overview of export concepts: [../README.MD](../README.MD). Why skills and rules are generated this way: [RULES&SKILLS.MD](../../../RULES&SKILLS.MD).

## Configuration

```yaml
# espalier.config.yaml
version: 1
root: espalier/

export:
  cursor:
    rules:
      output: .cursor/rules/espalier
    skills:
      output: .cursor/skills/espalier
```

| Key                    | Purpose                                                     |
| ---------------------- | ----------------------------------------------------------- |
| `export.cursor.rules`  | Root for generated `.mdc` editing rules and the layout rule |
| `export.cursor.skills` | Root for generated skill directories                        |

Paths are relative to the repository root. Adjust them if your project already uses `.cursor/rules/` or `.cursor/skills/` for other content.

## Output tree

Given structural rules under `components/` and a constraint at `**/*.ts/no-as-any.mjs`, `espalier export` might produce:

```text
.cursor/rules/espalier
├─ layout.mdc                    # alwaysApply — project layout
├─ no-as-any.mdc                 # alwaysApply — constraint rule
├─ components
│  ├─ buttons
│  │  └─ *.tsx.mdc               # globs: components/buttons/*.tsx
│  └─ ...
└─ main.ts.mdc

.cursor/skills/espalier
├─ button-component
│  └─ SKILL.md
└─ ...
```

Rule files mirror the structural tree where possible. Skill directories use kebab-case names derived from `contentDescription`.

## Skills

Structural rules export to `.cursor/skills/<name>/SKILL.md`. Skills are for **creation** — they are not glob-attached. The agent invokes or retrieves them when adding new code.

Each skill includes:

- **Frontmatter** — `name` and `description` (description derived from `contentDescription`)
- **Placement** — structural path pattern with wildcards preserved
- **Rule** — the module's `rule` body, unchanged

### Literal path

For `README.MD.mjs`:

```markdown
---
name: readme-md
description: Use when creating the repository root README file.
---

# Placement

New code matching this rule must be placed at:

`README.MD`

# Rule

{rule}
```

### Wildcard path

For `components/buttons/*.tsx.mjs`:

```markdown
---
name: button-component
description: Use when creating a button component.
---

# Placement

New code matching this rule must be placed at:

`components/buttons/*.tsx`

# Rule

{rule}
```

## Editing rules

Structural and constraint rules export to `.mdc` files under `export.cursor.rules`. How they enter context differs:

| Rule kind  | Load mechanism                                                                           |
| ---------- | ---------------------------------------------------------------------------------------- |
| Structural | `alwaysApply: false` + `globs` — attaches when the agent **reads** a matching path       |
| Constraint | `alwaysApply: true` — loaded **eagerly** every session; **Scope** states when it applies |

See [RULES&SKILLS.MD](../../../RULES&SKILLS.MD) for why constraint rules are not glob-scoped in export.

### Structural rules

The `globs` value is the structural pattern without the `.mjs` suffix. This only helps when editing **existing** files; new files need the matching skill.

`description` in frontmatter is derived from `contentDescription`.

```markdown
---
description: a button component
globs: components/buttons/*.tsx
alwaysApply: false
---

# Scope

This rule applies when editing files matching:

`components/buttons/*.tsx`

# Rule

{rule}
```

### Constraint rules

Constraint modules pair a glob **selector** with a `.mjs` file under `root` (see [TYPES.MD](../../../TYPES.MD)). That selector drives **lint** precisely, including nested paths such as `deep/nested/folder/**/*.ts`.

Cursor cannot enforce those selectors through `globs` on rules — especially for deep selector paths, and especially when the agent is **creating** a new file (nothing to read yet, so `globs: **/*.ts` never attaches). Constraint rules are therefore exported with `alwaysApply: true` and **no** reliance on `globs` for correctness.

The **# Scope** section carries the selector in prose. The agent uses it to decide applicability; `espalier lint` enforces the selector regardless.

```markdown
---
description: Apply when editing TypeScript (*.ts) files under backend/.
alwaysApply: true
---

# Scope

This rule applies when editing files matching:

`backend/**/*.ts`

# Rule

{rule}
```

For project-wide selectors such as `**/*.ts`, Scope uses stronger wording:

```text
This rule applies when editing all TypeScript (*.ts) files throughout the project.
```

If a constraint module does not define a custom description, the exporter generates one from the selector. Built-in aliases map common extensions (`*.ts` → TypeScript, `*.tsx` → TypeScript React, and so on). When no alias exists, the raw selector is used.

Do not expect `globs: backend/**/*.ts` to limit when this rule is loaded — it is always in context. Write Scope so the agent knows when to follow it.

## Project layout

The layout is exported as a single always-on rule, typically `layout.mdc`:

```markdown
---
description: Repository architectural layout
alwaysApply: true
---

# Repository Layout

The repository is expected to follow the structure below.

{generated-layout}
```

### Generated layout content

Built from the structural espalier only:

- Directories preserved as in the source tree
- `.mjs` suffix removed from rule filenames
- `contentDescription` as an inline `//` comment beside each file

Example:

```text
├─ components
│  ├─ buttons
│  │  └─ *.tsx                // a button component
│  ├─ dropdowns
│  │  └─ *.tsx                // a dropdown component
│  └─ layouts
│     └─ *.tsx                // a layout component
├─ models
│  └─ *.ts                   // a domain model
└─ main.ts                    // the application entry point
```

## Frontmatter reference

| Field                | Used on                   | Meaning                                     |
| -------------------- | ------------------------- | ------------------------------------------- |
| `alwaysApply: true`  | Layout + constraint rules | Present in every session                    |
| `alwaysApply: false` | Structural rules          | Attach when a file matching `globs` is read |
| `globs`              | Structural rules only     | Path pattern for read-time attachment       |
| `description`        | Rules and layout          | Shown in Cursor's rule picker               |
| `name`               | Skills (`SKILL.md`)       | Skill identifier                            |
| `description`        | Skills (`SKILL.md`)       | When to invoke the skill                    |

## Authoring tips for Cursor

- Tune `contentDescription` in source modules — it drives skill `description`, layout comments, and structural rule `description` in `.mdc`.
- Tune constraint **Scope** text — agents see every constraint rule every session; Scope is how they know a `backend/**/*.ts` rule is not for frontend work.
- Keep `rule` text target-agnostic; Cursor-specific wording belongs in templates only if you add custom exporter hooks later.
- Split `rules` and `skills` roots so project rules and skills do not collide with hand-written `.cursor/` content.
- Run `espalier export check` in CI after changing the espalier.
