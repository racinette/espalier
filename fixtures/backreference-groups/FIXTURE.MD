# Back-references beside groupings

Pins MATCHING.MD "Ownership" and "Back-references" where a feature's name is
both a directory capture and part of the names inside it, beside groupings
that could take the same files.

- `{feature}.ts` names each feature's entry file. It is declared an instance
  of `[name=a+].ts`, so `checkout.ts` joins that rule's `modules` group beside
  `cart.ts`, with `name = "checkout"`. In `Check-Out/` the value is not a
  member of the contract, so the instance names nothing there: `Check-Out.ts`
  is undeclared and nothing is required. `orders/orders.ts` is required and
  missing.
- `[step=0000]_{feature}.[kind={up,down}].sql` holds a back-reference, so it
  outranks its plain sibling `[step=0000]_[name=a+].sql`: `0001_checkout.up.sql`
  is a step of this feature, and `0001_cart.sql` of another table. Each
  grouping sees only its own files.
- The template declares step `0001` for every feature; checkout declares its
  own `0002`, which holds only checkout's files. Checkout's `0003` and orders'
  `0002` are undeclared.
- Checkout's documents write the feature into names: `[step=0000]_checkout…`
  and `0002_checkout…`, where the template's document shows `{feature}`.
