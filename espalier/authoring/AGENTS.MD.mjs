export const description = "the authoring contract init copies into every espalier root";
export const guidance = `Handwritten, not generated: \`espalier init\` copies it to the espalier root,
where agents editing rule modules load it by convention. A change here is a
change to every copy this repository ships, and each must stay byte-identical:
\`espalier/AGENTS.MD\` and the compiler example's, which
\`test/authoring.test.ts\` compares, and the \`init\` fixtures' expected copies,
which the conformance suite compares.`;
