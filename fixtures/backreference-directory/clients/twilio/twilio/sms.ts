export function sms(to: string) {
  return request("/messages", { to });
}
