# config: `root` is a directory, however it is spelled

`root: ./espalier/` names the same directory as `root: espalier`, and the run is
the same run. The espalier root is invisible to matching either way.

It was not. Every other use of this value compares it against a
repository-relative path, and those carry neither a leading `./` nor a trailing
slash — so the espalier compiled from the right directory and then reported
every rule module inside it as `unexpected_path`, including its own cache file.
A spelling was deciding whether the tool could see itself.

The spelling is not a contrivance. The rest of the file invites it: `ignore`
uses a trailing slash to *mean* a directory, so writing one here is consistent
rather than careless.

`root: .` is refused instead of normalized. An espalier root equal to the
repository root would make every path invisible, which is not a configuration
with a meaning.

Pins: CONFIG.MD "root".
