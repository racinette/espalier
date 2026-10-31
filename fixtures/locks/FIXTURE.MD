# Locked parts of an espalier, and frozen and sealed files

Pins LOCKS.MD "Which lock applies" and build "Marks". `src/core/` is locked by
its directory module, so `http.ts` inherits the lock; `src/core/plugins/`
reopens itself with `locked = false`, so `[plugin].ts` is unlocked. In the
unlocked `clients/`, the abstract `[provider].ts` locks itself, and
`stripe.ts`, declared against it, is not locked: a declaration inherits from
its directory, not its contract.

A lock, freeze or seal is marked where it begins and where it ends, never on
what merely continues it: 🔒 on `src/core/` and 🔓 on `plugins/`, ❄️ on
`vendor/` and ☀️ on `patches/`, 📪 on `components/` and 📬 on `Checkout/`.
The legend explains each mark the map uses, and the working instructions add the locked
behaviour because the espalier has a lock. `explain` names the module whose
export decided a path's lock.

`vendor/` freezes and seals every file beneath it, a snapshot, except that
`vendor/patches/` thaws itself with `frozen = false`: its patches stay editable
while the seal above still keeps any from being added or removed. The released
`0001` users set is frozen and sealed by its group declaration while the orders
set is not, and `locales/[lang].json` is sealed but not frozen: its files stay
editable, and no language is added or removed. The `theme` grouping of
`themes/` is sealed, so no theme is added or removed while a theme may gain a
part. `components/` is sealed, and its declared `Checkout/` reopens itself
with `sealed = false`, as a branch guard would, and `explain` names the seal on
`Button/`. Declared groups and groupings carry their marks in their headings; the legend explains every mark a document
uses, a heading's included, the working instructions add the frozen and sealed
behaviour, and `explain` names the modules that froze and sealed a file, and
marks a sealed grouping. Its human form lines up the values of `Owned by`,
`Frozen by` and `Sealed by` in one column.
