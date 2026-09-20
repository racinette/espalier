// Public linter contextual types and their zero-cost identity helpers. This is
// a unit test because TypeScript inference and function identity have no
// repository-tree outcome a fixture could observe.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createAggregateLinter,
  createLinter,
  type AggregateLinter,
  type Linter,
} from "../src/api.js";

interface Parser {
  parse(source: string): unknown;
}

interface Addons {
  parser: Parser;
}

interface ComponentCaptures {
  component: string;
}

interface AggregateCaptures {
  directory: string[];
}

test("createLinter returns the exact ordinary function it receives", () => {
  const callback: Linter = () => {};
  assert.strictEqual(createLinter(callback), callback);
});

test("createAggregateLinter returns the exact aggregate function it receives", () => {
  const callback: AggregateLinter = () => {};
  assert.strictEqual(createAggregateLinter(callback), callback);
});

test("createLinter supplies the complete default context without type arguments", () => {
  createLinter(async ({ path: target, pattern, captures, addons, read, files, emit }) => {
    const pathValue: string = target;
    const patternValue: string = pattern;
    const capture: string | string[] | undefined = captures["name"];
    const addon: unknown = addons["parser"];
    const source: string = await read();
    const peers: string[] = await files("**/*.ts");
    emit({ code: "default_typed", message: pathValue, metadata: { patternValue, capture, addon, source, peers } });
  });
});

test("createLinter contextually types captures, addons, reads, listings, and issues", () => {
  createLinter<ComponentCaptures, Addons>(
    async ({ path: target, pattern, captures, addons, read, files, emit }) => {
      const pathValue: string = target;
      const patternValue: string = pattern;
      const component: string = captures.component;
      const parser: Parser = addons.parser;
      const source: string = await read();
      const peers: string[] = await files("components/*.tsx");
      emit({
        code: "typed",
        message: component,
        severity: "warning",
        path: pathValue,
        metadata: { patternValue, parser, source, peers },
      });
    },
  );
});

test("createAggregateLinter gives every match its specialized captures", () => {
  createAggregateLinter<AggregateCaptures, Addons>(
    async ({ matches, patterns, addons, read, files, emit }) => {
      const pathValue: string = matches[0]?.path ?? ".";
      const directories: string[] = matches[0]?.captures.directory ?? [];
      const source: string = await read(pathValue);
      const peers: string[] = await files(patterns[0] ?? "**/*");
      const parser: Parser = addons.parser;
      emit({ code: "aggregate_typed", message: directories.join("/"), metadata: { source, peers, parser } });
    },
  );
});
