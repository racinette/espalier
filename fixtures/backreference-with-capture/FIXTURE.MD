# backreference-with-capture

Pins a segment holding a back-reference **and** a placeholder —
[MATCHING.MD](../../docs/MATCHING.MD#back-references): *"A segment may hold a
back-reference and a placeholder: `[provider]/{provider}-[kind].ts` names one
file per provider per kind. Such a segment is dynamic rather than resolved,
because it still matches many."*

`backreference-leaf` pins the resolved case, where the segment becomes one
literal and a different branch of the matcher handles it. This is the other
one: the segment stays dynamic, so it is compiled to a pattern per instance
rather than cached once, and the back-reference is substituted into that
pattern before the placeholder is matched against what is left.

- **The back-reference binds to the instance.** `stripe/twilio-charges.ts`
  is `unexpected_path`, even though `twilio` is a real sibling and
  `twilio-charges` is a name the shape could otherwise produce. A matcher that
  compiled the segment once and reused it — which is what happens for every
  back-reference-free segment — would accept it under both providers.
- **The placeholder still captures.** `kind` is `charges`, not the whole
  filename, so the literal from the back-reference is consumed rather than
  swallowed by the capture.
- **The tier is dynamic.** It matches many, so it sits beside `[note].md` in
  the dynamic tier and is checked against it for ambiguity — the two do not
  collide only because no filename ends in both `.ts` and `.md`. A `[helper].ts`
  sibling would be rejected as `ambiguous_siblings`, which is why there is not
  one here.
