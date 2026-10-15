# Findings grouped by rule identity

Three findings from one rule share a position. Two even share code and message,
but differ in metadata. Every finding survives, and the rule prose and reference
appear once for that group. A constraint with identical prose is a separate
owner and gets its own group. A built-in finding retains its ordinary format.
JSONL preserves all five complete records and their rule text.

Pins: cli/lint/README.MD "human", "jsonl", "Ordering".
