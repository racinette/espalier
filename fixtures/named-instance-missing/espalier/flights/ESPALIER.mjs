export const instanceOf = "../[group]";
export const description = "flight planning";
export function guidance({config, path, captures}) {
  return `Flight domain decisions for ${path}; group=${captures.group}; mode=${config.build.guidanceMode}.`;
}
