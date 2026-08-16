# adopt: repeated filename shapes, and where the two signals meet

`components/` holds `Submit.tsx`, `Modal.tsx` and `theme.ts`. Two files share
`.tsx`, so they collapse into `[tsx].tsx`. One file has `.ts`, so it stays as
itself.

## Why this directory is not a family

`components/` has no child directories, so the sibling-directory signal never
fires and the extension rule is free to apply. `adopt-sibling-directories` is
the same rule in the other position: there, `client.ts` and `requestModels.ts`
also share an extension and are **not** collapsed, because the intersection
that made `[client]/` a family is stronger evidence than the extension they
happen to have in common.

Reverting either half of that distinction fails one of these two fixtures.
They are a pair.

## The narrowing

`components/**` covers this area but does not match `components` itself — a
`<dir>/**` entry matches only paths under the directory. Testing membership
with the bare name silently found nothing, so coverage is decided by probing a
path inside, which is the question that actually matters: adopting an area
whose contents stay ignored would do nothing.

Pins: cli/adopt/README.MD "Inference".
