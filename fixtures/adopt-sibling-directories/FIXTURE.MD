# adopt: sibling directories with matching contents

The worked example from cli/adopt/README.MD, made executable. `stripe/` and
`twilio/` hold the same two filenames, so they become one `[client]/` node and
their contents become two static leaves under it.

Two of a thing is a pattern. The threshold is not a confidence judgement — it
comes from the failure being asymmetric. Two directories that happen to look
alike cost you a placeholder to rename. An espalier that declared them
separately forbids the third one, and every provider added after adoption is a
violation.

## The name

`[client]` is the parent directory singularised, which is a trailing `s` and
nothing more. It is not `[provider]` and cannot be: no input contains that
word. Renaming is step one of "After adopting" for exactly this reason, and
the generated documentation is not worth reading until it is done.

## The narrowing

`src/**` covered `src/clients`, and adopting an area that stays ignored would
do nothing. `src/` has no other children, so the entry is removed outright
rather than replaced — and the `ignore:` key goes with it, because a list key
with nothing under it is not valid YAML.

Pins: cli/adopt/README.MD "What it infers", "Inference", "Placeholder names".
