import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('dist bundle loads and exports the plugin contract', async () => {
  const mod = await import('../dist/index.js')
  assert.equal(mod.name, 'media-gen')
  assert.ok(Array.isArray(mod.inject))
  assert.ok(mod.inject.includes('tools'))
  assert.equal(typeof mod.apply, 'function')
  assert.equal(typeof mod.Config, 'function')
  assert.equal(typeof mod.TokensApiClient, 'function')
})

test('client bundle registers the published package name', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  const client = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  assert.equal(pkg.name, '@tokensapi/dsh-media-gen')
  assert.match(client, /window\.__ModuleLoader__\.load\(\{\s*id: '@tokensapi\/dsh-media-gen'/)
})
