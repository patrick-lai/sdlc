export function checkout(flags, user, cart, api) {
  return api.place(user, cart)
}
