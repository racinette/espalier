# Locked parts of an espalier

Pins LOCKS.MD "Which lock applies" and build "Marks". `src/core/` is locked by
its directory module, so `http.ts` inherits the lock; `src/core/plugins/`
reopens itself with `locked = false`, so `[plugin].ts` is unlocked. In the
unlocked `clients/`, the abstract `[provider].ts` locks itself, and
`stripe.ts`, declared against it, is not locked: a declaration inherits from
its directory, not its contract.

Every locked node carries 🔒 in the map and in its section heading, the legend
explains each mark the map uses, and the working instructions add the locked
behaviour because the espalier has a lock. `explain` names the module whose
export decided a path's lock.
