import { test } from 'node:test'
import assert from 'node:assert/strict'

const request = {
  url: 'https://3674924b5376e9c23bb108f3a654025f.r2.cloudflarestorage.com/object?signature=unchanged',
  method: 'PUT',
  headers: {
    'Content-Type': 'image/jpeg',
    'Content-Length': '4',
    'x-amz-checksum-sha256': 'signed-checksum',
  },
  body: Buffer.from([1, 2, 3, 4]),
}

function connectionReset() {
  return new TypeError('fetch failed', {
    cause: Object.assign(new Error('socket closed'), { code: 'ECONNRESET' }),
  })
}

test('object upload retries one ECONNRESET through TLS 1.2 with the exact signed request', async () => {
  const { uploadObjectWithTlsRecovery } = await import('../dist/index.js')
  let fetchCalls = 0
  let fallbackCalls = 0
  const response = await uploadObjectWithTlsRecovery(request, {
    async fetcher(url, init) {
      fetchCalls += 1
      assert.equal(url, request.url)
      assert.equal(init.method, request.method)
      assert.strictEqual(init.headers, request.headers)
      assert.strictEqual(init.body, request.body)
      assert.equal(init.redirect, 'error')
      throw connectionReset()
    },
    async tls12Uploader(retryRequest) {
      fallbackCalls += 1
      assert.strictEqual(retryRequest, request)
      return new Response(null, { status: 204 })
    },
  })

  assert.equal(response.status, 204)
  assert.equal(fetchCalls, 1)
  assert.equal(fallbackCalls, 1)
})

test('object upload does not retry HTTP failures or non-reset network errors', async () => {
  const { uploadObjectWithTlsRecovery } = await import('../dist/index.js')
  let fallbackCalls = 0
  const tls12Uploader = async () => {
    fallbackCalls += 1
    return new Response(null, { status: 204 })
  }

  const httpResponse = await uploadObjectWithTlsRecovery(request, {
    async fetcher() { return new Response('unavailable', { status: 503 }) },
    tls12Uploader,
  })
  assert.equal(httpResponse.status, 503)

  const timeout = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ETIMEDOUT' } })
  await assert.rejects(
    uploadObjectWithTlsRecovery(request, {
      async fetcher() { throw timeout },
      tls12Uploader,
    }),
    (error) => error === timeout,
  )
  assert.equal(fallbackCalls, 0)
})

test('object upload never starts TLS recovery after user cancellation', async () => {
  const { uploadObjectWithTlsRecovery } = await import('../dist/index.js')
  const controller = new AbortController()
  let fallbackCalls = 0
  const reset = connectionReset()

  await assert.rejects(uploadObjectWithTlsRecovery({ ...request, signal: controller.signal }, {
    async fetcher() {
      controller.abort(new DOMException('cancelled by user', 'AbortError'))
      throw reset
    },
    async tls12Uploader() {
      fallbackCalls += 1
      return new Response(null, { status: 204 })
    },
  }), (error) => error === reset)

  assert.equal(fallbackCalls, 0)
})

test('native object upload fallback is pinned to TLS 1.2 and supplies Content-Length', async () => {
  const { readFile } = await import('node:fs/promises')
  const source = await readFile(new URL('../src/host/object-upload.ts', import.meta.url), 'utf8')
  assert.match(source, /minVersion: 'TLSv1\.2'/)
  assert.match(source, /maxVersion: 'TLSv1\.2'/)
  assert.match(source, /result\['Content-Length'\] = String\(byteLength\)/)
  assert.match(source, /if \(lowerName === 'host'\) continue/)
})
