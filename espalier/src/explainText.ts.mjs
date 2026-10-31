export const instanceOf = "[module].ts.mjs";
export const description = "the human layout for explain";

export const guidance = `Formats an \`Explanation\` and computes nothing. Its interfaces are the
\`--format jsonl\` payload, which \`explain.ts\` builds and \`output.ts\` writes
with \`JSON.stringify\`. A field the human layout needs is added to the answer,
where JSONL carries it too; the one exception is a map entry's parsed
\`segment\`, which the drawing and legends read and \`output.ts\` leaves out
of JSONL. \`--concise\` is presentation only: it drops prose
here, never from the payload. The map comes from \`render.ts\`'s \`drawMap\`, its legends from
\`marksLegend\` and \`maskLegend\`, and the governed-elsewhere sentence from
\`readInside\`, so a prefix reads as the generated document does; do not
reimplement any of them. Column, rule and wrap
widths, and the rule that author text is indented but never re-wrapped, are
fixed by \`docs/cli/explain/README.MD\` "Human layout".`;
