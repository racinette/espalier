# Literal names

Pins MATCHING.MD "Literal names" and TYPES.MD "literalName". A Next.js-shaped
tree: `app/[slug]/` is a directory whose name is `[slug]`, declared with
`literalName` on its directory module and specialized as an instance of the
`[route]/` pattern beside it, so it inherits the page and makes the optional
loading state required. `pages/[id].tsx` is a file whose name is `[id].tsx`,
declared with `literalName` on its rule module.

Pins that a literal node is static: it owns its path ahead of the dynamic
sibling, its files are required by default, and it reports no capture of its
own, while the inherited `[route]` rule still sees `route = "[slug]"`. The map
marks the node `literal name`. A literal
`[lang=a+].tsx` is a name, not a mask, so its document explains no mask.
