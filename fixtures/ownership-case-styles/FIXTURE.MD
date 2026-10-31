# Case styles and repeat ranges

Pins MATCHING.MD "Case styles" and the `(m..n)` repetition under "Masks".
Components are PascalCase, hooks camelCase, routes kebab-case and jobs
snake_case; a name in another style falls to a bare sibling rule where there
is one and is undeclared where there is not. Runs of capitals and digits are
allowed, so `HTMLView.tsx` is a component and `utf-8.ts` a route. Migrations
take four or more digits, and codes two or three letters followed by up to two
digits.

Also pins the legend generated guidance gives each case style and each form of
range.
