# emit with a path override

The client rule runs once per provider — twice here — and each invocation
reports the same problem against clients/registry.ts. The issue lands on the
file that must change, not on the file that noticed.

Two invocations, two issues. Nothing is deduplicated: the two agree on path,
code and message while disagreeing on captures, and collapsing them would
mean discarding one of two true findings on a coin toss. Emitting once is
the rule's job, not the runner's.

The registry itself is declared, but a rule may attach an issue to any path
inside the repository, declared or not.

Pins: cli/lint/README.MD "Attaching an issue elsewhere", "Ordering".
