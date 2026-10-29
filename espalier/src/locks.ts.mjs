export const instanceOf = "[module].ts.mjs";
export const description = "checking a change to the espalier against a base checkout's locks";

export const guidance = `Judges every change by the locks in force at the base, so a change cannot
unlock what it edits; \`docs/LOCKS.MD\` "Enforcing locks" is the specification.
A module is compared together with every repository file it imports, read with
\`es-module-lexer\`, never with patterns over source text: a guessed import
graph is a lock with a hole in it. The compiled espalier's \`modules\` registry
supplies what each module declares; nothing here re-derives a lock or a
contract. The base must be read by this same version, and a different pin
stops the run rather than comparing two readings.`;
