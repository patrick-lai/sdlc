export function createApi(save) {
  return {
    place(user, cart) {
      if (!user?.id) throw new Error('authentication required')
      if (!cart.length) throw new Error('empty cart')
      return save({user: user.id, items: cart})
    },
    legacyPlace(user, cart) {
      if (!user?.id) throw new Error('authentication required')
      return save({user: user.id, items: cart, legacy: true})
    }
  }
}
