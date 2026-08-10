/**
 * An operational failure: espalier could not do its job. Exits 2, reports the
 * failure, lints nothing.
 *
 * Codes are chosen at the throw site and deliberately have no central registry
 * yet. We do not know which failures actually surface across real codebases,
 * and a list written before the implementation would be a guess — codes nothing
 * throws, and throws with no code. Once the set stops moving it gets harvested
 * into docs/cli/lint/README.MD in one pass.
 *
 * Three are load-bearing today, because fixtures compare against them exactly:
 * `ambiguous_siblings`, `inconsistent_capture_names`, `ignored_required_path`.
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
