// The installed package is the single source of truth for the CLI version.
// From both `src/` after compilation and the packed `dist/src/`, two levels up
// is the package root. `espalier help` and `espalier examples` read docs and
// examples from here so the running CLI prints its own pages.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

interface Manifest {
  version: string;
}

const manifestUrl = new URL("../../package.json", import.meta.url);

/** Directory that contains this package's `package.json`. */
export const PACKAGE_ROOT = path.dirname(fileURLToPath(manifestUrl));

const manifest = JSON.parse(readFileSync(manifestUrl, "utf8")) as Manifest;

export const VERSION = manifest.version;
