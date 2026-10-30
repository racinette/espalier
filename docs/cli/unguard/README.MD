# `espalier unguard`

Takes back the guard in place: every module [`espalier guard`](../guard/README.MD)
changed is restored byte for byte, and every module it created is deleted.

```bash
espalier unguard
```

## Usage

```text
espalier unguard [options]

  --no-build         do not rebuild the generated documentation
  --dry-run          print what would be written, write nothing
  --config <path>    use this config file instead of discovering one
  --format <fmt>     human or jsonl (default: human)
  --out <dest>       stdout, stderr, or a file path (default: stdout)
```

Each restored module is reported `written` and each created one `deleted`;
a directory left empty by a deleted declaration goes with it. Without `--no-build`,
the generated documents are rebuilt afterwards. With no guard in place it says
so and changes nothing.

## How it restores

Unguard reads the espalier's files and never compiles them, so a guard comes
back out even of an espalier that no longer compiles. It uncomments every line
the guard commented out and removes every fenced replacement. A line counts as
a mark only when it is a real comment, so text inside a guidance string that
happens to read like one is left alone.

Every module is restored in memory before anything is written. A module whose
marks no longer pair up, or one the guard created whose contents changed since,
was edited after the guard; unguard refuses with `guard_tampered`, names the
module, and writes nothing. Restore that module by hand, then run unguard again.

Unguard does not touch git. Commit what it writes, as the guard was committed.

Every operational failure code is listed in [ERRORS.MD](../../ERRORS.MD).
