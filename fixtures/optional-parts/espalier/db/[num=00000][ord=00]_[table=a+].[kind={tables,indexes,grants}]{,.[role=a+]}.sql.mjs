export const description = "a migration step";
export const guidance = "One statement per step. Only grants name a role, after the kind.";

export async function lint({ captures, emit }) {
  if (captures.role !== undefined && captures.kind !== "grants") {
    emit({ code: "role_without_grants", message: `this ${captures.kind} step names the role ${captures.role}; only grants do` });
  }
}

export const groups = {
  set: {
    by: ["num", "table"],
    description: "one table's migration set",
    guidance: "Steps are numbered from 00 with no gaps, whatever their kind.",
    async lint({ captures, matches, emit }) {
      const ords = matches.map((match) => Number(match.captures.ord)).sort((a, b) => a - b);
      if (ords.some((ord, index) => ord !== index)) {
        emit({ code: "set_gap", message: `set ${captures.num} ${captures.table} has steps ${ords.join(", ")}` });
      }
    },
  },
};
