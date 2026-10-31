export const description = "a module";
export const groups = { modules: { by: [], lint({ emit, matches }) { emit({ code: "module_group", message: "Group members.", severity: "info", metadata: { members: matches.map((match) => match.path) } }); } } };
