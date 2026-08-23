# matching: a capture is the text it matched, not the segment it sits in

`[provider]-provider/` has a literal suffix, so matching `stripe-provider`
binds `provider` to `stripe` — not to `stripe-provider`. `{provider}Impl.ts`
then resolves to `stripeImpl.ts`, with the literal `Impl` carried along.

`clients/twilio-provider/stripe-providerImpl.ts` is the assertion, and it is
the exact file somebody writes who believes a back-reference means *the same
name as the directory*. It is wrong twice over — wrong capture, wrong instance
— so it reports `unexpected_path`, and `twilioImpl.ts`, which is what
`{provider}Impl.ts` resolves to here, reports `missing_required_file`.

Both halves matter. A back-reference that substituted the whole segment would
make the file legal; one that ignored the literal `Impl` would look for
`twilio.ts`. Only a substitution of the captured text into the surrounding
literals produces this pair of issues.

This is also why the documentation says `{provider} repeats what [provider]
matched` rather than naming the directory: with a literal beside the
placeholder, the two are different strings.

Pins: MATCHING.MD "Back-references", MATCHING.MD "Captures".
