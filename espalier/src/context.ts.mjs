export const description = "the lint context handed to rules";

export const rule = `Built once and used by both the runner and the programmatic API, because
\`docs/API.MD\` promises a rule fails under test for the reason it fails in
production. Two implementations would make that a coincidence.`;

export async function lint() {}
