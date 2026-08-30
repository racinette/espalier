export const aggregate = true;
export const rule = `Keep at least one YAML fixture.`;

export async function lint({ matches, emit }) {
  if (matches.length === 0) {
    emit({ code: "empty_yaml_group", message: "0 YAML fixtures", severity: "info" });
  }
}
