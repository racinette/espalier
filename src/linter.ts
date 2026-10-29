// Contextual typing helpers for rule linters. docs/TYPES.MD "Typed linter helpers".

import type { CaptureValue } from "./match.js";
import type { Severity } from "./output.js";

/** The author-supplied portion of an issue; the runner derives the rest. */
export interface LintIssue {
  code: string;
  message: string;
  severity?: Severity;
  path?: string;
  line?: number;
  column?: number;
  metadata?: Record<string, unknown>;
}

export type EmitIssue = (issue: LintIssue) => void;
export type ListFiles = (pattern: string) => Promise<string[]>;
export type ReadFile = (path?: string) => Promise<string>;
export type AggregateReadFile = (path: string) => Promise<string>;

export interface LintContext<
  Captures extends Record<keyof Captures, CaptureValue> = Record<string, CaptureValue>,
  Addons = Record<string, unknown>,
> {
  path: string;
  /** The rule's declaration as authored, without `.mjs`. */
  pattern: string;
  captures: Captures;
  read: ReadFile;
  files: ListFiles;
  emit: EmitIssue;
  addons: Addons;
}

export interface LintMatch<
  Captures extends Record<keyof Captures, CaptureValue> = Record<string, CaptureValue>,
> {
  path: string;
  captures: Captures;
}

export interface AggregateLintContext<
  Captures extends Record<keyof Captures, CaptureValue> = Record<string, CaptureValue>,
  Addons = Record<string, unknown>,
> {
  matches: LintMatch<Captures>[];
  patterns: string[];
  read: AggregateReadFile;
  files: ListFiles;
  emit: EmitIssue;
  addons: Addons;
}

/** The context of one grouping's `lint`. docs/TYPES.MD "groups". */
export interface GroupLintContext<
  Captures extends Record<keyof Captures, CaptureValue> = Record<string, CaptureValue>,
  Addons = Record<string, unknown>,
> {
  /** The grouping's name, as declared in `groups`. */
  group: string;
  /** The directory holding the group, with a trailing slash, or `.`; the default issue path. */
  path: string;
  /** The rule's declaration as authored, without `.mjs`. */
  pattern: string;
  /** The values of the `by` captures that every member shares. */
  captures: Partial<Captures>;
  matches: LintMatch<Captures>[];
  read: AggregateReadFile;
  files: ListFiles;
  emit: EmitIssue;
  addons: Addons;
}

export type Linter<
  Captures extends Record<keyof Captures, CaptureValue> = Record<string, CaptureValue>,
  Addons = Record<string, unknown>,
> = (context: LintContext<Captures, Addons>) => void | Promise<void>;

export type AggregateLinter<
  Captures extends Record<keyof Captures, CaptureValue> = Record<string, CaptureValue>,
  Addons = Record<string, unknown>,
> = (context: AggregateLintContext<Captures, Addons>) => void | Promise<void>;

export type GroupLinter<
  Captures extends Record<keyof Captures, CaptureValue> = Record<string, CaptureValue>,
  Addons = Record<string, unknown>,
> = (context: GroupLintContext<Captures, Addons>) => void | Promise<void>;

/** Supplies contextual types and returns the same ordinary linter unchanged. */
export function createLinter<
  Captures extends Record<keyof Captures, CaptureValue> = Record<string, CaptureValue>,
  Addons = Record<string, unknown>,
>(linter: Linter<Captures, Addons>): Linter<Captures, Addons> {
  return linter;
}

/** Supplies contextual types and returns the same aggregate linter unchanged. */
export function createAggregateLinter<
  Captures extends Record<keyof Captures, CaptureValue> = Record<string, CaptureValue>,
  Addons = Record<string, unknown>,
>(linter: AggregateLinter<Captures, Addons>): AggregateLinter<Captures, Addons> {
  return linter;
}

/** Supplies contextual types and returns the same grouping linter unchanged. */
export function createGroupLinter<
  Captures extends Record<keyof Captures, CaptureValue> = Record<string, CaptureValue>,
  Addons = Record<string, unknown>,
>(linter: GroupLinter<Captures, Addons>): GroupLinter<Captures, Addons> {
  return linter;
}
