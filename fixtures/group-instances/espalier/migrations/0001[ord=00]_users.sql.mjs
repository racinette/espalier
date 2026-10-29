export const instanceOf = "[num=0000][ord=00]_[group=a+].sql.mjs";
export const description = "create users";
export const guidance = "Creates the users table. Step 01 is the `CREATE TABLE`.";

export async function lint({ matches, read, emit }) {
  const first = matches[0];
  if (!/create table users/i.test(await read(first.path))) {
    emit({ code: "set_purpose", message: "step 01 does not create the users table", path: first.path });
  }
}
