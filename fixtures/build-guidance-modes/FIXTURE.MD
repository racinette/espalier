# build: locked and unlocked espaliers, nested

Pins LOCKS.MD and build "Operational guidance". The outer espalier locks its
root, uses a custom output filename, and folds its subtree into the root
document; its authored prose and structural rules remain present. Its locked
child states the same authorization boundary, its unlocked child carries only
the unlocked guidance, and its suppressed child emits only authored and
structural guidance. Each child keeps its own lock when built as part of the
parent: locks are not inherited across an espalier boundary.

The golden documents pin the complete text, including what locked modules
still permit and how a lock is changed. Every locked module carries 🔒 in the
map, and the legend explains it.
