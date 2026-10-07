# Espalier 0.5.0

Findings caching is now opt-in. Plain `espalier lint` and API `check()` calls
run every applicable rule without reading or writing a findings cache. Enable
it with `espalier lint --cache` or `check({ cache: true })` when it improves
your workload. Uncached runs skip cache dependency tracking and implementation
manifests. Shared reads and addon resources still work without findings caching.

`espalier help cache` now covers cache dependencies, invalidation, shared
analysis, and measuring cold and warm runs on a real project. The ordinary
lint and authoring guides focus on writing and running rules.

## Shared compiler analysis

The new `compiler-addon` example demonstrates a lazy TypeScript program shared
by rules during one check. Each rule records its own source reads and file
listings, while identical snapshots reuse the compiler analysis. Rule modules
keep their own policy and findings; addon disposal releases the shared state.

Copy it with `espalier examples compiler-addon --copy ./compiler-example`.
The example includes executable recipes for semantic checks, rule ordering,
matching and creation, optional cache invalidation, diagnostic locations, and
linked declaration identity. TypeScript is an example dependency, not an
Espalier runtime dependency.

The authoring contract and API documentation clarify in-process addon
ownership, helper responsibilities, cohesive rule modules, and resource
lifetime in tests. Compiler reuse reduces repeated analysis construction;
it does not narrow the inputs on which semantic findings depend.

## Upgrading from 0.4.0

Install 0.5.0 and run `espalier migrate` to update the exact config pin and the
marked authoring contract. Existing valid rule trees do not need to be rewritten.

- Remove `--no-cache` from scripts; the flag is no longer accepted, and plain
  `espalier lint` now provides that behavior.
- Add `--cache` or API `cache: true` wherever you want persistent findings
  caching. API callers that omit `cache` now run without it.
- Addons still run setup and disposal for each check, including cached checks.
  Keep expensive analysis lazy so replayed findings do not construct it.

Run your rule tests, `espalier lint`, `espalier build`, and
`espalier build --check`. Review and commit regenerated guidance with the
migration changes.
