export const description = "the lint worker entry point";

export const guidance = `Keep addon instances local to one worker. Serialize job handling and disposal; return findings and operational failures through the coordinator protocol.`;

export async function lint() {}
