# constraint scope and recursive captures

no-as-any covers **/*.{ts,tsx}; no-fetch covers backend/**/*.ts only.

  backend/orders/handler.ts   both constraints run
  web/app.tsx                 no-as-any only — wrong subtree, and .tsx
                              is outside no-fetch's extension anyway

Also pins the recursive capture: [...path] over backend/orders/handler.ts
yields ["orders"], as an array, not a string.

Pins: MATCHING.MD "Captures", "Multiple extensions".
