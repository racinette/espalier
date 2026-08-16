// Counts what a real addon would do expensively once: start something, hand it
// to every rule, and shut it down at the end.
let started = 0;

export async function setup() {
  started += 1;
  const seen = [];
  return {
    started,
    seen,
    note: (path) => seen.push(path),
    [Symbol.asyncDispose]: () => {
      // Disposal runs after the last issue is emitted and after the exit code
      // is decided, so it has no reporting channel. stderr is the only place a
      // fixture can observe it at all.
      process.stderr.write(`addons disposed after ${seen.length} file(s)\n`);
    },
  };
}
