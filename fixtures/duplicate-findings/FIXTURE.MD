# duplicate-findings

Pins [lint ordering and duplicates](../../docs/cli/lint/README.MD#ordering-and-duplicates).
Thirteen identical emits become one finding within each invocation. Explicit
defaults and normalized paths coalesce, as do equal metadata objects with
reordered keys. Different paths, codes, messages, severities, locations and
metadata survive. The two per-file invocations keep their separate captures,
and an aggregate keeps its own identical finding. The warm cache replay must
return the same findings as the cold run.
