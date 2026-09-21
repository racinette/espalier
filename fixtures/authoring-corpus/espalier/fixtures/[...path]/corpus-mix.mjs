import { parseCase } from "../../../helpers/case.mjs";

export const aggregate = true;
export const targets = ["*/case.json"];
export const description = "the fixture corpus stays mixed enough";
export const rule = `The selected fixture cases together keep a mixed corpus:
at least three cases, mutation share between one quarter and three quarters,
mean depth at least 1.5, and mean args at least 1.5.`;

const MIN_CASES = 3;
const MIN_MUTATION_SHARE = 0.25;
const MAX_MUTATION_SHARE = 0.75;
const MIN_MEAN_DEPTH = 1.5;
const MIN_MEAN_ARGS = 1.5;

export async function lint({ matches, read, emit }) {
  if (matches.length < MIN_CASES) {
    emit({
      code: "corpus_too_small",
      message: `need at least ${MIN_CASES} cases, have ${matches.length}`,
    });
    return;
  }

  const cases = [];
  for (const { path } of matches) {
    const parsed = parseCase(await read(path));
    if (!parsed.ok) return;
    cases.push(parsed);
  }

  const mutations = cases.filter((entry) => entry.kind === "mutation").length;
  const share = mutations / cases.length;
  if (share < MIN_MUTATION_SHARE || share > MAX_MUTATION_SHARE) {
    emit({
      code: "mutation_share",
      message: `${mutations}/${cases.length} mutations`,
    });
  }

  const meanDepth = cases.reduce((sum, entry) => sum + entry.depth, 0) / cases.length;
  if (meanDepth < MIN_MEAN_DEPTH) {
    emit({ code: "mean_depth", message: `mean depth ${meanDepth}` });
  }

  const meanArgs = cases.reduce((sum, entry) => sum + entry.args, 0) / cases.length;
  if (meanArgs < MIN_MEAN_ARGS) {
    emit({ code: "mean_args", message: `mean args ${meanArgs}` });
  }
}
