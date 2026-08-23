export function refund(id: string) {
  return fetch(`https://api.stripe.com/refunds/${id}`);
}
