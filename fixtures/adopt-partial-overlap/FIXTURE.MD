# adopt: siblings that only partly match

`stripe/` has a `webhook.ts` that `twilio/` does not. `adopt` declares the
**intersection** — `client.ts` and `requestModels.ts` — and reports the odd
file out as `uncovered`.

Both alternatives are worse, in opposite directions.

The **union** would declare `[client]/webhook.ts`, asserting that every client
has a webhook. Nobody said that. It would also report
`src/clients/twilio/webhook.ts` as `missing_required_file` on the first run,
which is `adopt` inventing a requirement and then complaining that it is unmet.

An **extra dynamic leaf** — `[client]/[ts].ts` for the remainder — would say
nothing and legalise every future `.ts` file in every client directory. That is
the over-general failure the document warns about everywhere else, and it fails
quietly, which is worse.

So the file is left undeclared and named in the output. `lint` reports it as
`unexpected_path` until someone decides whether it is a fourth rule, a fifth
client, or something that belongs elsewhere. That decision is exactly what
`adopt` cannot make and must not fake.

Pins: cli/adopt/README.MD "Siblings that only partly match".
