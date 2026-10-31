export const description = "a step of another table";
export const groups = { step: { by: ["step"], lint({ emit, matches }) { emit({ code: "other_step", message: "Group members.", severity: "info", metadata: { members: matches.map((match) => match.path) } }); } } };
