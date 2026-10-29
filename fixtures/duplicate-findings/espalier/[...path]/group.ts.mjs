export const guidance = "Report a group finding once.";
export const aggregate = true;
export function lint({ emit }) {
  for (let i = 0; i < 13; i++) {
    emit({ path: "shared.ts", code: "problem", message: "shared problem", line: 3, column: 2 });
  }
}
