# emit with a path override, and deduplication

The client rule runs once per provider — twice here — and each invocation
reports the same problem against clients/registry.ts.

Two invocations, one issue: identical path + code + message collapse.
The issue lands on the file that must change, not on the file that
noticed.

Pins: cli/lint/README.MD "Attaching an issue elsewhere", "Ordering and
deduplication".
