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
  assert.match(client, /compactDownloadTimestamp/)
  assert.match(client, /imageTaskId/)
  assert.match(client, /tokensapi-image-\$\{index \+ 1\}-\$\{timestamp\}/)
})

test('client bundle owns only namespaced media option questions and initializes their defaults', async () => {
  const client = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  assert.match(client, /MEDIA_QUESTION_ID_PREFIX = 'tokensapi_media__'/)
  assert.match(client, /priority: -100/)
  assert.match(client, /isMediaOptionQuestionPending\(pendingInteraction\)/)
  assert.match(client, /questions\.map\(initialMediaQuestionDraft\)/)
  assert.match(client, /question\.initialSelected/)
  assert.match(client, /mediaQuestionMeta\(question\.id\)\?\.defaultIndex/)
  assert.match(client, /event\.key !== ' ' && event\.key !== 'Enter'/)
  assert.match(client, /'aria-pressed': selected/)
  assert.match(client, /Promise\.resolve\(\)\.then\(\(\) => pending\.cancel\(\)\)/)
  assert.match(client, /var defaultDraft = initialMediaQuestionDraft\(question\)/)
  assert.match(client, /\? \{ \.\.\.defaultDraft, skipped: false \}/)
  assert.match(client, /使用默认值并跳过当前选择/)
})

test('wizard recommendation labels use plain Chinese text instead of the UI badge trigger', async () => {
  const host = await readFile(new URL('../dist/index.js', import.meta.url), 'utf8')
  assert.doesNotMatch(host, /\(Recommended\)/)
  assert.match(host, /\\uFF08\\u63A8\\u8350\\uFF09/)
})

test('default image upload configuration uses the API-key assets endpoint', async () => {
  const source = await readFile(new URL('../src/host/index.ts', import.meta.url), 'utf8')
  assert.match(source, /imageUploadURL: Schema\.string\(\)\.default\('https:\/\/tokensapi\.ai\/v1\/assets\/images'\)/)
  assert.match(source, /uploadAuthMode: Schema\.union\(\['account', 'api_key'\]\)\.default\('api_key'\)/)
})
