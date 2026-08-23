export const description = "operational failures";

export const rule = `Holds \`fail()\`, which every operational failure goes through. A code it raises
that \`docs/ERRORS.MD\` does not list fails the suite, and so does a documented
code nothing raises.`;

export async function lint() {}
