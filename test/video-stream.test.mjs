import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer } from 'node:http'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { registerVideoStreamRoute } from '../dist/index.js'

async function withStreamRoute(callback, { status = 206, fail = false } = {}) {
  let route
  const calls = []
  const bytes = Buffer.from('synthetic-video-bytes')
  registerVideoStreamRoute({
    effect(fn) { fn() }, webServer: { register(value) { route = value; return () => {} } },
  }, (url, options, receive) => {
    const request = new EventEmitter()
    calls.push({ url: String(url), options, request })
    request.setTimeout = () => request
    request.destroy = () => { request.destroyed = true }
    request.end = () => queueMicrotask(() => {
      if (fail) { request.emit('error', new Error('reset')); return }
      const response = new PassThrough()
      response.statusCode = status
      response.headers = { 'content-type': 'video/mp4', 'accept-ranges': 'bytes', 'content-length': String(bytes.length), ...(status === 206 ? { 'content-range': `bytes 0-${bytes.length - 1}/100` } : {}) }
      receive(response)
      response.end(bytes)
    })
    return request
  })
  const server = createServer((req, res) => route.handler(req, res))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    await callback(`http://127.0.0.1:${server.address().port}${route.path}`, calls, bytes)
  } finally {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  }
}

const source = 'https://s3.tokensapi.ai/outputs/video.mp4'

test('video playback streams range bytes over TLS 1.2 without forwarding local credentials', async () => {
  await withStreamRoute(async (base, calls, bytes) => {
    const response = await fetch(`${base}?url=${encodeURIComponent(source)}`, { headers: {
      Range: 'bytes=0-20', Cookie: 'local-cookie', Authorization: 'local-only',
    } })
    assert.equal(response.status, 206)
    assert.equal(response.headers.get('content-type'), 'video/mp4')
    assert.equal(response.headers.get('content-range'), 'bytes 0-20/100')
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes)
    assert.equal(calls[0].options.minVersion, 'TLSv1.2')
    assert.equal(calls[0].options.maxVersion, 'TLSv1.2')
    assert.deepEqual(calls[0].options.headers, { Accept: 'video/mp4,video/webm,application/octet-stream', Range: 'bytes=0-20' })
    assert.equal(calls[0].url, source)
  })
})

test('video HEAD and invalid ranges preserve player semantics', async () => {
  await withStreamRoute(async (base, calls) => {
    const response = await fetch(`${base}?url=${encodeURIComponent(source)}`, { method: 'HEAD' })
    assert.equal(response.status, 206)
    assert.equal(await response.text(), '')
    assert.equal(calls[0].options.method, 'HEAD')
    for (const range of ['bytes=0-1,4-5', 'invalid']) {
      assert.equal((await fetch(`${base}?url=${encodeURIComponent(source)}`, { headers: { Range: range } })).status, 416)
    }
    assert.equal(calls.length, 1)
  })
})

test('video stream rejects untrusted URLs and non-read methods before network access', async () => {
  await withStreamRoute(async (base, calls) => {
    for (const url of ['http://s3.tokensapi.ai/v.mp4', 'https://example.com/v.mp4', 'https://s3.tokensapi.ai:8443/v.mp4', 'https://user:password@s3.tokensapi.ai/v.mp4']) {
      assert.equal((await fetch(`${base}?url=${encodeURIComponent(url)}`)).status, 403)
    }
    assert.equal((await fetch(base)).status, 400)
    assert.equal((await fetch(`${base}?url=${encodeURIComponent(source)}`, { method: 'POST' })).status, 405)
    assert.equal(calls.length, 0)
  })
})

test('upstream stream failures and redirects return errors without generating or following another URL', async () => {
  for (const scenario of [{ fail: true }, { status: 302 }, { status: 403 }]) {
    await withStreamRoute(async (base, calls) => {
      const response = await fetch(`${base}?url=${encodeURIComponent(source)}`)
      assert.equal(response.status, scenario.status === 403 ? 403 : 502)
      assert.equal(calls.length, 1)
      await response.arrayBuffer()
    }, scenario)
  }
})
