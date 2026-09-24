export const targets = ["**/*.+(ts|tsx)"];
export const aggregate = true;
export const rule = "Public export names are unique across the application.";
export async function lint() {}
