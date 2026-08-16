export const description = "a button component";
// The file exists, but this rule's pattern is components/buttons/*.tsx and
// this path is not under it. A rule whose example does not match its own
// pattern is a specification error.
export const example = "components/Modal.tsx";
export const rule = `Default-export a single component named after the file.`;
export async function lint() {}
