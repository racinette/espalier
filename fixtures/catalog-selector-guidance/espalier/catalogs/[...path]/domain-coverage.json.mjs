export const aggregate = true;
export const description = "every locale covers the same domains";
export const rule = `Every locale represented in the catalog tree has the same
set of domain files. A missing domain leaves part of the storefront untranslated.`;

export async function lint({ matches, emit }) {
  const byLocale = new Map();
  for (const { path } of matches) {
    const [, locale, filename] = path.split("/");
    const domains = byLocale.get(locale) ?? new Set();
    domains.add(filename);
    byLocale.set(locale, domains);
  }
  const allDomains = new Set([...byLocale.values()].flatMap((domains) => [...domains]));
  for (const [locale, domains] of byLocale) {
    for (const domain of allDomains) {
      if (!domains.has(domain)) {
        emit({ code: "missing_locale_domain", severity: "error", message: `${locale} lacks ${domain}` });
      }
    }
  }
}
