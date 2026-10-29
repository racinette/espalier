export const description = "a migration step";
export const guidance = "One statement per step.";

export const groups = {
  set: {
    by: ["num", "group"],
    abstract: true,
    description: "a migration set",
    guidance: "A set changes one table.",
  },
  release: {
    by: ["num"],
    description: "one release's migrations",
    guidance: "A release ships its sets together.",
  },
};
