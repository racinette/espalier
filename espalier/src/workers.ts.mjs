export const instanceOf = "[module].ts.mjs";
export const description = "the bounded lint worker pool";

export const guidance = `Schedule file and aggregate jobs only after every worker initializes. Report findings centrally and clean up all workers on success or failure. Nested project pools do not overlap.`;
