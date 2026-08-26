import { test } from 'node:test'
import assert from 'node:assert/strict'

test('dist bundle loads and exports the plugin contract', async () => {
  const mod = await import('../dist/index.js')
  assert.equal(mod.name, 'media-gen')
  assert.ok(Array.isArray(mod.inject))
  assert.ok(mod.inject.includes('tools'))
  assert.equal(typeof mod.apply, 'function')
  assert.equal(typeof mod.Config, 'function')
  assert.equal(typeof mod.TokensApiClient, 'function')
})
