export const description = "the record of what was decided and why";

export const rule = `Every decision that cost an argument is written down here,
struck through rather than deleted when it is superseded. A reversal that
leaves no trace is a decision that will be made again.`;

export async function lint({ read, emit }) {
  const text = await read();
  if (!text.includes("## Constraints")) {
    emit({
      code: "no_constraints",
      message: "must carry a `## Constraints` section: it is what a new session reads first",
    });
  }
}
