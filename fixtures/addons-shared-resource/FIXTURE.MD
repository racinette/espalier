# addons: one setup, one object, one disposal

`CONFIG.MD` promises three things about `addons` and nothing exercised any of
them: `setup` runs once before any rule, the returned object reaches every
`lint` invocation, and disposal runs after the run completes.

The addon counts its own `setup` calls in a module-level variable. Both rules
report `started: 1`, so a second call would be visible — `import()` caches the
module, so the counter survives and a per-file setup would read `2`.

Both rules also push into the same `seen` array. The object is shared, not
copied: an addon exists so an expensive resource is paid for once, and a rule
receiving a private copy of a language server would be worse than useless.

## Disposal has no reporting channel

It runs after the last issue is emitted and after the exit code is decided, so
there is nothing for it to emit into. The disposer writes to stderr instead,
and `expected.json` asserts the fragment — the only way a fixture can see that
it happened at all.

`addons disposed after 2 file(s)` also pins the ordering: the count is what it
is because both rules ran first. A disposer that fired early would report a
smaller number rather than passing quietly.

Pins: CONFIG.MD "`addons`"; TYPES.MD `addons`.
