import { createTemplate } from "espalier";

export const description = "an implementation module";
export const abstract = true;

export const guidance = `Every module is declared beside this contract, with what it must hold to. An
undeclared one is reported: a new module is a decision about the shape of the
implementation, made where that shape is written down. Declare it first, then
\`espalier create src/<module>.ts\` starts it with its header.`;

export const template = createTemplate(({ captures }) => `// TODO: what ${captures.module}.ts is. docs/<DOCUMENT>.MD "<section that specifies it>".

export {};
`);
