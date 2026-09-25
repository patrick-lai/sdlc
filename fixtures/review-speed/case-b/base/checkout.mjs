export function checkout(flags, user, cart, api) {
  if (flags.newCheckout) return api.place(user, cart)
  return api.legacyPlace(user, cart)
}
