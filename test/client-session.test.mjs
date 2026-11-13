import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

test('TokensCowork 0.7.13 media result reads the slot session attachment rather than a different global chat', async () => {
  const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  const effects = [], registrations = new Map(), reads = [], cleanups = []
  const React = {
    useSyncExternalStore(_subscribe, read) { return read() },
    useState(initial) { return [initial, () => {}] },
    useEffect(effect) { effects.push(effect) },
  }
  const jsx = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }
  let definition
  vm.runInNewContext(source, { window: { __ModuleLoader__: { load(value) { definition = value } } }, URL, Blob })
  const plugin = definition.factory(name => name === 'react' ? React : jsx)
  const sessions = {
    list: { subscribe: () => () => {}, getSnapshot: () => ({ byId: {}, current: 'other-chat' }) },
    binding(id) { reads.push(id); return { session: { async readAttachment(id) { return { ok: true, value: { data: new Uint8Array([1, 2]), attachment: { mediaType: 'image/png' } } } } } } },
  }
  let dictionaries
  const locale = { register(_namespace, value) { dictionaries = value; return () => {} } }
  plugin.apply({
    get: name => name === 'sessions' ? sessions : locale,
    effect(callback) { const cleanup = callback(); if (cleanup) cleanups.push(cleanup) },
    slots: { inject(_name, f) { f() }, register(options, component) { registrations.set(options.key, component) } },
  })
  assert.ok(dictionaries.zh && dictionaries.en)
  assert.equal(dictionaries.en['ui.next'], 'Next')
  assert.deepEqual(Object.keys(dictionaries.en).sort(), Object.keys(dictionaries.zh).sort())
  const props = { toolName: 'media_generate_image', sessionId: 'own-chat', block: { kind: 'result', content: [{ type: 'image', attachment: { attachmentId: 'image-a' } }] } }
  const wrapped = registrations.get('media_generate_image')(props)
  wrapped.type(wrapped.props)
  for (const effect of effects) { const cleanup = effect(); if (cleanup) cleanups.push(cleanup) }
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(reads, ['own-chat'])
  cleanups.forEach(cleanup => cleanup())
})

test('TokensCowork 0.5.25 media result falls back to the global current session', async () => {
  const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  const effects = [], registrations = new Map(), reads = [], cleanups = []
  const React = {
    useSyncExternalStore(_subscribe, read) { return read() },
    useState(initial) { return [initial, () => {}] },
    useEffect(effect) { effects.push(effect) },
  }
  const jsx = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }
  let definition
  vm.runInNewContext(source, { window: { __ModuleLoader__: { load(value) { definition = value } } }, URL, Blob })
  const plugin = definition.factory(name => name === 'react' ? React : jsx)
  const sessions = {
    list: { subscribe: () => () => {}, getSnapshot: () => ({ byId: {}, current: 'legacy-chat' }) },
    binding(id) { reads.push(id); return { session: { async readAttachment(id) { return { ok: true, value: { data: new Uint8Array([1, 2]), attachment: { mediaType: 'image/png' } } } } } } },
  }
  const locale = { register() { return () => {} } }
  plugin.apply({
    get: name => name === 'sessions' ? sessions : locale,
    effect(callback) { const cleanup = callback(); if (cleanup) cleanups.push(cleanup) },
    slots: { inject(_name, f) { f() }, register(options, component) { registrations.set(options.key, component) } },
  })
  const props = { toolName: 'media_edit_image', block: { kind: 'result', content: [{ type: 'image', attachment: { attachmentId: 'legacy-image' } }] } }
  const wrapped = registrations.get('media_edit_image')(props)
  wrapped.type(wrapped.props)
  for (const effect of effects) { const cleanup = effect(); if (cleanup) cleanups.push(cleanup) }
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(reads, ['legacy-chat'])
  cleanups.forEach(cleanup => cleanup())
})

test('TokensCowork 0.7.13 promotes successful image and video results outside the Called tools group', async () => {
  const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  const registrations = new Map()
  let definition
  const conversationDefinitions = new Map()
  const React = {
    useSyncExternalStore(_subscribe, read) { return read() },
    useState(initial) { return [initial, () => {}] },
    useEffect() {},
  }
  const jsx = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }
  vm.runInNewContext(source, {
    window: { __ModuleLoader__: { load(value) { definition = value } } },
    URL,
    Blob,
    console,
    Set,
  })
  const plugin = definition.factory(name => name === 'react' ? React : jsx)
  const sessions = {
    list: { subscribe: () => () => {}, getSnapshot: () => ({ current: 'chat' }) },
    binding() { return undefined },
  }
  const locale = { register() { return () => {} } }
  const uiConversation = { events: { register(value) { conversationDefinitions.set(value.kind, value); return () => {} } } }
  plugin.apply({
    get(name) {
      if (name === 'sessions') return sessions
      if (name === 'locale') return locale
      if (name === 'uiConversation') return uiConversation
      return undefined
    },
    effect(callback) { callback() },
    slots: {
      inject(_name, callback) { callback() },
      register(options, component) { registrations.set(options.key ?? options.name, { options, component }); return () => {} },
    },
  })

  assert.ok(plugin.inject.includes('uiConversation'))
  const conversationDefinition = conversationDefinitions.get('tokensapi-media-image-result')
  assert.equal(conversationDefinition.kind, 'tokensapi-media-image-result')
  const start = {
    event: {
      type: 'tool/call', seq: 10, time: 100,
      data: { callId: 'call-1', name: 'media_generate_image', arguments: '{"prompt":"mountains"}' },
    },
    location: { kind: 'step', turn: { turn: 1 }, step: { step: 1 } },
  }
  const update = {
    event: {
      type: 'tool/result', seq: 12, time: 120, surfaceOp: 'append',
      data: { message: { source: { callId: 'call-1' }, content: [{ type: 'image', attachment: { attachmentId: 'image-1', mediaType: 'image/png' } }] } },
    },
    location: start.location,
  }
  const startRoute = conversationDefinition.match(start.event)
  const updateRoute = conversationDefinition.match(update.event)
  assert.equal(startRoute.id, 'call-1')
  assert.equal(startRoute.role, 'start')
  assert.equal(updateRoute.id, 'call-1')
  assert.equal(updateRoute.role, 'update')
  assert.equal(conversationDefinition.match({
    type: 'tool/result', seq: 13, time: 130, surfaceOp: 'append',
    data: { message: { source: { callId: 'other-call' }, content: [{ type: 'text', text: 'ordinary result' }] } },
  }), null)
  const initial = conversationDefinition.start({}, start)
  const state = conversationDefinition.update({ state: initial }, update)
  const node = conversationDefinition.buildViewNode({
    key: 'tokensapi-media-image-result:call-1',
    id: 'call-1',
    state,
    current: new Map(),
    start,
    matches: [start, update],
  })
  assert.equal(node.kind, 'tokensapi-media-image-result')
  assert.equal(node.groupTree, 'turn')
  assert.equal(node.visibility, 'visible')
  assert.equal(node.data.block.content[0].attachment.attachmentId, 'image-1')
  assert.ok(registrations.has('tokensapi-media-image-result'))
  const toolRow = registrations.get('media_generate_image').component({
    toolName: 'media_generate_image',
    block: node.data.block,
  })
  assert.equal(toolRow.props.promoted, true)

  const videoDefinition = conversationDefinitions.get('tokensapi-media-video-result')
  assert.equal(videoDefinition.kind, 'tokensapi-media-video-result')
  const videoStart = {
    event: {
      type: 'tool/call', seq: 20, time: 200,
      data: { callId: 'video-call-1', name: 'media_generate_video', arguments: '{"aspect_ratio":"16:9"}' },
    },
    location: { kind: 'step', turn: { turn: 2 }, step: { step: 1 } },
  }
  const videoUpdate = {
    event: {
      type: 'tool/result', seq: 22, time: 220, surfaceOp: 'append',
      data: { message: { source: { callId: 'video-call-1' }, content: [{ type: 'text', text: 'URL: https://s3.tokensapi.ai/video.mp4' }] } },
    },
    location: videoStart.location,
  }
  const videoStartRoute = videoDefinition.match(videoStart.event)
  const videoUpdateRoute = videoDefinition.match(videoUpdate.event)
  assert.equal(videoStartRoute.id, 'video-call-1')
  assert.equal(videoStartRoute.role, 'start')
  assert.equal(videoUpdateRoute.id, 'video-call-1')
  assert.equal(videoUpdateRoute.role, 'update')
  const videoInitial = videoDefinition.start({}, videoStart)
  const videoState = videoDefinition.update({ state: videoInitial }, videoUpdate)
  const videoNode = videoDefinition.buildViewNode({
    key: 'tokensapi-media-video-result:video-call-1',
    id: 'video-call-1',
    state: videoState,
    current: new Map(),
    start: videoStart,
    matches: [videoStart, videoUpdate],
  })
  assert.equal(videoNode.kind, 'tokensapi-media-video-result')
  assert.equal(videoNode.groupTree, 'turn')
  assert.equal(videoNode.visibility, 'visible')
  assert.match(videoNode.data.block.content[0].text, /video\.mp4/)
  assert.ok(registrations.has('tokensapi-media-video-result'))
  const videoToolRow = registrations.get('media_generate_video').component({
    toolName: 'media_generate_video',
    block: videoNode.data.block,
  })
  assert.equal(videoToolRow.props.promoted, true)
})
