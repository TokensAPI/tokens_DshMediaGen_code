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

test('client bundle exposes per-image downloads through the safe host route', async () => {
  const client = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  assert.match(client, /\/media-gen\/download\?url=/)
  assert.match(client, /'aria-label': '下载图片'/)
  assert.match(client, /M12 3v11m0 0 4-4/)
  assert.match(client, /download: filename/)
})

test('wizard recommendation labels use plain Chinese text instead of the UI badge trigger', async () => {
  const host = await readFile(new URL('../dist/index.js', import.meta.url), 'utf8')
  assert.doesNotMatch(host, /\(Recommended\)/)
  assert.match(host, /\\uFF08\\u63A8\\u8350\\uFF09/)
})
