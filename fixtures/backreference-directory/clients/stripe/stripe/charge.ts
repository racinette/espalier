export function charge(amount: number) {
  return request("/charges", { amount });
}
