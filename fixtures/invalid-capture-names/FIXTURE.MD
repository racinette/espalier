# invalid: inconsistent capture names

`clients/[provider]/` and `clients/[vendor]/` are the same node in the
trie described under two names, so one captured value would have two
names. The espalier fails to compile.

Pins: MATCHING.MD "Ambiguity is rejected", second case.
