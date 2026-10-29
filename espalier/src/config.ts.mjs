export const instanceOf = "[module].ts.mjs";
export const description = "finding and validating the configuration";

export const guidance = `Finds \`espalier.config.yaml\`, validates it, and returns the \`Config\` every
other module reads. \`docs/CONFIG.MD\` specifies discovery and each key, and
\`docs/AUTHORING.MD\` specifies the authoring contract that \`init\` and
\`migrate\` vendor. Validation is strict and happens before any walk or
compile. Every rejection is an OperationalError raised through \`fail\`. A key
this module does not know is rejected, so a new key needs a parser here and a
section in that document. \`migrate\` is the one command that must read a
config this version rejects. It reuses \`locateConfig\`, \`readConfigFile\` and
the exported value parsers instead of \`loadConfig\`, so keep each value's
validation in one exported parser rather than copying it. \`root\` is
normalized to the plain repository-relative form other modules compare paths
against, so its spelling cannot change what is matched. This module reads
\`.espalierignore\` only as lines. Compiling it, and reading \`ignoreFiles\`, is
left to \`repository.ts\`.`;
