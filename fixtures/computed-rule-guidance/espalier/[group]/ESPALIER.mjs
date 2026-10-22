export function description({ config, pattern, path, captures }) {
  if (pattern !== "[group]" || path !== null || Object.keys(captures).length) throw new Error("dynamic directory context");
  return `operation group (${config.build.guidanceMode})`;
}
