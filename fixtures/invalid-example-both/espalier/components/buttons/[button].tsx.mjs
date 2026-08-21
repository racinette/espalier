export const description = "a button component";

export const rule = String.raw`Default-export a single component named after the file.`;

// Two examples that could disagree is worse than either.
export const example = "components/buttons/SubmitButton.tsx";
export const exampleSource = String.raw`export default function Submit() { … }`;

export async function lint() {}
