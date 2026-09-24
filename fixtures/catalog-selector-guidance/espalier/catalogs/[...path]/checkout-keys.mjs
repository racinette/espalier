export const aggregate = true;
export const targets = ["*/checkout.json"];
export const description = "checkout message IDs agree across locales";
export const rule = `All checkout catalogs expose the same message IDs.
Values differ by locale, but the checkout UI can use one stable key set.`;

export async function lint({ matches, read, emit }) {
  let baseline = null;
  for (const { path } of matches) {
    let catalog;
    try {
      catalog = JSON.parse(await read(path));
    } catch {
      continue;
    }
    if (catalog === null || Array.isArray(catalog) || typeof catalog !== "object") continue;
    const keys = Object.keys(catalog).sort();
    if (baseline === null) {
      baseline = { path, keys };
    } else if (JSON.stringify(keys) !== JSON.stringify(baseline.keys)) {
      emit({ code: "checkout_key_mismatch", severity: "error", message: `${path} differs from ${baseline.path}` });
    }
  }
}
