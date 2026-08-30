// The installed package is the single source of truth for the CLI version.
// From both `src/` after compilation and the packed `dist/src/`, two levels up
// is the package root.

import { readFileSync } from "node:fs";

interface Manifest {
  version: string;
}

const manifest = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
) as Manifest;

export const VERSION = manifest.version;
