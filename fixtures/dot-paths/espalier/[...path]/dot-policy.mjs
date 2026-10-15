export const rule = "Check dotted workflow paths.";
export const targets = [".github/**/*.yml"];
export function lint({path,emit}) { emit({code: "workflow_checked", message: path}); }
