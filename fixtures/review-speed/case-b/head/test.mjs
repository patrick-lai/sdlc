import { strict as assert } from 'node:assert'
import { checkout } from './checkout.mjs'
import { createApi } from './api.mjs'
const calls = []
const api = createApi(value => { calls.push(value); return value })
assert.equal(checkout({newCheckout: true}, {id: 'u'}, ['x'], api).user, 'u')
assert.equal(calls.length, 1)
assert.throws(() => checkout({newCheckout: true}, null, ['x'], api), /authentication/)
assert.throws(() => checkout({newCheckout: true}, {id: 'u'}, [], api), /empty cart/)
