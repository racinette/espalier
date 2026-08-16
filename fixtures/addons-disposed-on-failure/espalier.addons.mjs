export async function setup() {
  return {
    [Symbol.asyncDispose]: () => {
      process.stderr.write("addons disposed\n");
    },
  };
}
