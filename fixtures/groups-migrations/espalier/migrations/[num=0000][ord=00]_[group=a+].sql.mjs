export const description = "a migration step";
export const rule = "One statement per step.";
export async function lint() {}

export const groups = {
  set: {
    by: ["num", "group"],
    description: "a migration set",
    rule: "Steps are numbered from 01 with no gaps.",
    async lint({ captures, matches, emit }) {
      const ords = matches.map(({ captures }) => Number(captures.ord)).sort((a, b) => a - b);
      const expected = ords.map((_, index) => index + 1);
      if (ords.join() !== expected.join()) {
        emit({ code: "set_gap", message: `set ${captures.num}_${captures.group} has steps ${ords.join(", ")}`, metadata: { members: matches.map(({ path }) => path) } });
      }
    },
  },
  release: {
    by: ["num"],
    description: "one release's migrations",
    rule: "Every group in a release is listed in RELEASES.txt as `<num> <group>`.",
    async lint({ captures, matches, read, emit }) {
      const manifest = await read("migrations/RELEASES.txt");
      const listed = new Set(manifest.split("\n").filter(Boolean));
      for (const group of new Set(matches.map(({ captures }) => captures.group))) {
        if (!listed.has(`${captures.num} ${group}`)) {
          emit({ code: "unlisted_group", message: `${captures.num} ${group} is not in RELEASES.txt`, path: "migrations/RELEASES.txt", severity: "warning" });
        }
      }
    },
  },
};
