export const aggregate = true;
export const rule = `Exercise each element frequently across the fixture suite.`;

export async function lint({ matches, read, emit }) {
  const contents = await Promise.all(matches.map(({ path }) => read(path)));
  const elements = contents.flatMap((text) => JSON.parse(text)).sort();
  emit({
    code: "element_frequency",
    message: `${matches.length}:${elements.join(",")}`,
    severity: "info",
    metadata: {
      matches: matches.map(({ path, captures }) => ({ path, fixture: captures.fixture })),
    },
  });
}
