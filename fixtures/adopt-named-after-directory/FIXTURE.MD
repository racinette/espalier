# adopt: a file named after the directory holding it

Three clients, each holding a file named for itself and a `README.MD`:

    src/clients/stripe/stripe.ts
    src/clients/twilio/twilio.ts
    src/clients/sendgrid/sendgrid.ts

The sibling-directory signal fires on the `README.MD` they share and produces
`[client]/`. The three `.ts` files have nothing in common as names, and that is
where this fixture starts.

Read as ordinary members they are three names, each held by one sibling out of
three, which makes them optional leaves — and that espalier is not merely loose,
it is wrong. It says a client directory may hold any of `stripe.ts`,
`twilio.ts` or `sendgrid.ts`, so `mailgun/mailgun.ts` is `unexpected_path` on
the day it is written. The over-specific failure the whole command is built to
avoid, reached through the rule that exists to avoid the opposite one.

`{client}.ts` is the statement that is true of all three, and it is required per
instance, so the next client is described rather than forbidden.

## Every instance, not two of them

The other two signals fire at two, because a placeholder that is wrong costs a
rename while separate declarations forbid the third sibling. This one does not:
a back-reference that is wrong costs `missing_required_file` on a directory
that never had that file, reported the first time the espalier runs. Two
clients following a convention and a third ignoring it is not a convention, and
the optional leaves `adopt-partial-overlap` pins are the right answer for it.

`README.MD` is here to prove the two signals coexist: it is shared by every
instance and stays an ordinary required leaf beside the back-reference.

Pins: cli/adopt/README.MD "Inference", "A file named after its directory".
