export const description = "a specification document";

export const rule = `Named in upper case, one document per subject, opening with
a level-one heading. These are the specification: where the code and one of
these disagree, the document is right, and a code change that contradicts one
is a change to the document first.`;

export async function lint({ captures, read, emit }) {
  const { doc } = captures;
  if (doc !== doc.toUpperCase()) {
    emit({ code: "not_uppercase", message: `"${doc}.MD" must be named in upper case` });
  }

  const text = await read();
  if (!text.startsWith("# ")) {
    emit({ code: "no_heading", message: "must open with a level-one heading", line: 1 });
  }
}
