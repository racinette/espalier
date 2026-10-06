# Adoption improvements

Each milestone is a separate commit, with its documentation, runnable code
where needed, and validation complete before moving to the next.

- [x] Make persistent findings caching opt-in and move its requirements into
  `espalier help cache`. Commit: `5218f26`; 447 tests passed.
- [x] Clarify addon ownership: in-process compiler services, helpers versus
  owned resources, per-check lifetime, deterministic reuse, and disposal.
  Commit: `4c9c539`; authoring and init fixtures passed.
- [x] Ship a runnable TypeScript addon example: lazy compilation from governed
  snapshots, compiler settings, shared facts with policy in rules, and small
  semantic tests proving reuse, changed inputs, order independence, and isolation.
  Commit: `5e91941`; four semantic tests, uncached lint, guidance freshness,
  and reuse/freshness mutation checks passed.
- [x] Complete the compiler testing and optional cache recipe: matching and
  creation tests, source/configuration/membership/support invalidation, and
  explicit resource setup/disposal for rule-body tests.
  Commit: `cd8d28b`; six executable tests, lint, guidance freshness,
  and declaration-dependency mutation check passed.
- [x] Add compiler diagnostic adaptation and linked-dependency coverage:
  application locations, readable origins, safe coordinates, and trusted
  declaration identity with logical paths.
  Commit: `5f18ac0`; eight executable tests, linked support invalidation, and
  mutations for path identity, fallback coordinates, and linked declarations.
- [x] Explain which example mechanisms to copy, cohesive modules and static
  responsibility names, reusable versus application prose, and profiling real
  workloads without requiring new framework timing APIs.
  Validation: 448 full-suite tests passed; final package checks executed all
  eight compiler recipes from an installed copy. Generated guidance is current.
  The snapshot test also detects untracked application reads.

The adopter's private analyzer still needs to adopt shared compiler ownership;
this repository cannot implement or measure that private change.
