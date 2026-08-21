# a config `ignore` matches is not a child

`templates/` holds an `espalier.config.yaml`, and the root `ignore` matches it.
That demotes it to plain content: no boundary, no recursion, and the root goes
on governing `templates/index.ts` itself.

This is what a repository storing configs as data needs — this one keeps sixty
under `fixtures/`, several deliberately invalid. Discovery consults `ignore`
before it decides anything.

The `templates/espalier/` modules are ignored too, because ignoring the config
alone leaves them visible and every one of them would be `unexpected_path`.

The child's rule emits at `error` severity and its code is `child_ran`, so a run
that recursed anyway would both report an issue nothing expects and exit `1`.

Pins: CONFIG.MD "Suppressing discovery".
