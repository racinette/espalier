export const description = "a step of this feature";
export const groups = { step: { by: ["step"], abstract: true, lint({ emit, matches }) { emit({ code: "feature_step", message: "Group members.", severity: "info", metadata: { members: matches.map((match) => match.path) } }); } } };
