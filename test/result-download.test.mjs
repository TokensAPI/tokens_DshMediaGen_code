import assert from 'node:assert/strict'
import test from 'node:test'

async function withFetch(mock, callback) {
  const original = globalThis.fetch
  globalThis.fetch = mock
  try {
    return await callback()
  } finally {
    globalThis.fetch = original
  }
}

const pngBytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])

test('generated image download retries transient network failures without resubmitting a task', async () => {
  const { saveImages } = await import('../dist/index.js')
  const requestedUrls = []
  let saveCalls = 0

  await withFetch(async (url, init) => {
    requestedUrls.push({ url: String(url), method: init?.method ?? 'GET' })
    if (requestedUrls.length < 3) throw new TypeError('fetch failed')
    return new Response(pngBytes, { headers: { 'content-type': 'image/png' } })
  }, async () => {
    const images = await saveImages(['https://s3.tokensapi.test/outputs/result.png'], 'task_retry_result', {
      async saveImage(input) {
        saveCalls += 1
        assert.deepEqual(input.data, Buffer.from(pngBytes))
        assert.equal(input.name, 'media_gen_task_retry_result_1.png')
        return {
          attachmentId: 'attachment-after-retry',
          mediaType: input.mediaType,
          bytes: input.data.byteLength,
          width: 1,
          height: 1,
          name: input.name,
        }
      },
    })

    assert.equal(images[0].attachmentId, 'attachment-after-retry')
    assert.equal(images[0].error, undefined)
  })

  assert.equal(requestedUrls.length, 3)
  assert.deepEqual(new Set(requestedUrls.map(({ method }) => method)), new Set(['GET']))
  assert.equal(saveCalls, 1)
})

test('generated image download honors retryable HTTP responses', async () => {
  const { downloadGeneratedImage } = await import('../dist/index.js')
  let calls = 0
  await withFetch(async () => {
    calls += 1
    if (calls === 1) return new Response('', { status: 503, headers: { 'retry-after': '0' } })
    return new Response(pngBytes, { headers: { 'content-type': 'image/png' } })
  }, async () => {
    const downloaded = await downloadGeneratedImage('https://s3.tokensapi.test/result.png', undefined, {
      maxAttempts: 2,
      baseDelayMs: 0,
    })
    assert.deepEqual(downloaded.bytes, Buffer.from(pngBytes))
  })
  assert.equal(calls, 2)
})

test('generated image download falls back to TLS 1.2 after a TLS connection reset', async () => {
  const { downloadGeneratedImage } = await import('../dist/index.js')
  let fetchCalls = 0
  let fallbackCalls = 0
  const reset = new TypeError('fetch failed', {
    cause: Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }),
  })

  await withFetch(async () => {
    fetchCalls += 1
    throw reset
  }, async () => {
    const downloaded = await downloadGeneratedImage('https://s3.tokensapi.test/result.png', undefined, {
      maxAttempts: 2,
      baseDelayMs: 0,
      async tls12Downloader(url) {
        fallbackCalls += 1
        assert.equal(url, 'https://s3.tokensapi.test/result.png')
        return { bytes: Buffer.from(pngBytes), mediaType: 'image/png' }
      },
    })
    assert.deepEqual(downloaded.bytes, Buffer.from(pngBytes))
  })

  assert.equal(fetchCalls, 1)
  assert.equal(fallbackCalls, 1)
})

test('generated image download does not retry permanent errors forever', async () => {
  const { downloadGeneratedImage } = await import('../dist/index.js')
  let calls = 0
  await withFetch(async () => {
    calls += 1
    return new Response('', { status: 403 })
  }, async () => {
    await assert.rejects(
      downloadGeneratedImage('https://s3.tokensapi.test/forbidden.png', undefined, { maxAttempts: 4, baseDelayMs: 0 }),
      /Download failed \(403\)/,
    )
  })
  assert.equal(calls, 1)
})
