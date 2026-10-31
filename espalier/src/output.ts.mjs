export const instanceOf = "[module].ts.mjs";
export const description = "formats and destinations";

export const guidance = `Owns both encodings and every destination. Once \`cli.ts\` has built a
Reporter, everything the run says goes through it: issues, records, warnings
and operational failures. Only \`help\`, \`examples\`, \`--version\`, and argument
errors raised before a Reporter exists write to process streams directly,
since none of them has a format or destination to honour. JSONL is a stream
of events whose completion is the exit code. The human formatter buffers and
writes the summaries itself, which is why it takes a \`Mode\` and commands only
record entries. \`nested.ts\` re-roots every path a Reporter carries for a child
espalier, so a new path-bearing field must be translated there too. The JSONL
explanation leaves out each map entry's parsed \`segment\`, which only the
human layout reads. A standard-stream destination drops writes once its reader
has closed, so piping into \`head\` ends the output, not the run, and the exit
code still reports the result. The
encodings are specified under "Output" in \`docs/cli/lint/README.MD\` and
\`docs/cli/build/README.MD\`.`;
