export const description = "turning the espalier into documentation";

export const guidance = `Generated documents state each piece of guidance once. Text an
author writes — a rule's \`guidance\`, a directory's, a grouping's, a declared
instance's — is arbitrarily long, and every agent that reads a document which
repeats it pays for the repetition in tokens. Where that guidance also applies
somewhere else, such as an instance's document, a file that inherits a rule, or
a section that builds on another, refer to where it is rendered: name the
contract and the document that carries it, or say it is above. Never paste it.
This holds wherever generated text is composed, the instance preface that
\`compile.ts\` builds included.

Fixed text the tool writes itself, such as headings, the closing account and
the mask legend, may repeat when it is short and a reference would cost the
reader more. Decide by tokens: what the reader spends on the inline text,
against what they would spend reading the reference's target. The mask legend
stays inline because the page explaining masks is two orders of magnitude
longer, and even so it appears once per document, not once per section.

Before rendering the same text into a second place, decide which kind it is.
Author text is never the exception.`;

export async function lint() {}
