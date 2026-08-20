# adopt: siblings that only partly match

`stripe/` has a `webhook.ts` that `twilio/` does not. `adopt` declares the
shared filenames as required and the odd one out as
[optional](../../docs/TYPES.MD#optional) — `[client]/webhook.ts.mjs` carries
`export const optional = true`, and the run leaves a repository that lints
clean.

Both alternatives were false, in opposite directions, which is why this needed
a third statement rather than a better guess.

Declaring `webhook.ts` **required** asserts that every client has one. Nobody
said that, and it reports `src/clients/twilio/webhook.ts` as
`missing_required_file` on the first run — `adopt` inventing a requirement and
then complaining that it is unmet.

Leaving it **undeclared** is the opposite failure: `lint` reports
`unexpected_path` for a file everybody agrees belongs there, so the command
succeeds and hands back a broken repository.

An **extra dynamic leaf** — `[client]/[ts].ts` for the remainder — would say
nothing and legalise every future `.ts` file in every client directory. That is
the over-general failure the document warns about everywhere else, and it fails
quietly, which is worse. `optional` names one file. That is the difference.

The written module is compared byte for byte, so the `// TODO` on the optional
line is pinned too: it is the guess most worth reviewing, and a stub that did
not say so would be one the architect skims past.

Pins: cli/adopt/README.MD "Siblings that only partly match".
