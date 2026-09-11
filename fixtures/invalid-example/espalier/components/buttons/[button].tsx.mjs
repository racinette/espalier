export const description = "a button component";
// The file exists, but this rule's pattern is components/buttons/*.tsx and
// this path is not under it. A reference not owned by its declaring rule is a
// specification error.
export const referenceImplementation = "components/Modal.tsx";
export const rule = `Default-export a single component named after the file.`;
export async function lint() {}
