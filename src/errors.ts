/**
 * An operational failure: espalier could not do its job. Exits 2, reports the
 * failure, lints nothing.
 *
 * Codes are chosen at the throw site rather than in a central registry: a list
 * written before the implementation would have been a guess — codes nothing
 * throws, and throws with no code. They have since been harvested into
 * docs/ERRORS.MD, which test/errors.test.ts holds to the source in both
 * directions, so a new code here needs a line there.
 */
export class OperationalError extends Error {
  readonly code: string;
  readonly detail: Record<string, unknown>;

  constructor(code: string, message: string, detail: Record<string, unknown> = {}) {
    super(message);
    this.name = "OperationalError";
    this.code = code;
    this.detail = detail;
  }
}

export function fail(
  code: string,
  message: string,
  detail: Record<string, unknown> = {},
): never {
  throw new OperationalError(code, message, detail);
}
