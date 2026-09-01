import assert from 'node:assert/strict'
import test from 'node:test'

const config = {
  baseURL: 'https://tokensapi.test/v1',
  apiKeyEnv: 'TOKENSAPI_API_KEY',
  pollIntervalMs: 1,
  maxPollMs: 100,
}

const ctx = {
  credentials: { async resolve() { return { value: 'test-api-key' } } },
  logger: { warn() {} },
}

function jsonResponse(data, init = {}) {
  return new Response(JSON.stringify(data), {
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    ...init,
  })
}

async function withFetch(mock, callback) {
  const original = globalThis.fetch
  globalThis.fetch = mock
  try {
    return await callback()
  } finally {
    globalThis.fetch = original
  }
}

test('submit retries fetch failures with one stable idempotency key', async () => {
  const { TokensApiClient } = await import('../dist/index.js')
  const client = new TokensApiClient(ctx, config)
  const keys = []
  let calls = 0

  await withFetch(async (_url, init) => {
    calls += 1
    keys.push(init.headers['Idempotency-Key'])
    if (calls === 1) throw new TypeError('fetch failed')
    return jsonResponse({ task_id: 'task_after_retry' })
  }, async () => {
    const taskId = await client.submit('videos', { prompt: 'ocean' })
    assert.equal(taskId, 'task_after_retry')
  })

  assert.equal(calls, 2)
  assert.equal(new Set(keys).size, 1)
})

test('an uncertain repeated tool call reuses the original key even when uploaded URLs change', async () => {
  const { TokensApiClient } = await import('../dist/index.js')
  const client = new TokensApiClient(ctx, config)
  const keys = []
  let calls = 0

  await withFetch(async (_url, init) => {
    calls += 1
    keys.push(init.headers['Idempotency-Key'])
    if (calls <= 3) throw new TypeError('fetch failed')
    return jsonResponse({ task_id: 'task_recovered' })
  }, async () => {
    const logicalInput = { prompt: 'animate this', start_image: '/tmp/reference.png' }
    await assert.rejects(
      client.submit('videos', { prompt: 'animate this', frame_images: [{ image_url: { url: 'https://upload.test/first' } }] }, undefined, logicalInput),
      /submission status is uncertain/,
    )
    const taskId = await client.submit(
      'videos',
      { prompt: 'animate this', frame_images: [{ image_url: { url: 'https://upload.test/second' } }] },
      undefined,
      logicalInput,
    )
    assert.equal(taskId, 'task_recovered')
  })

  assert.equal(calls, 4)
  assert.equal(new Set(keys).size, 1)
})

test('a repeated pending request with a known task id does not submit again', async () => {
  const { TokensApiClient } = await import('../dist/index.js')
  const client = new TokensApiClient(ctx, config)
  let calls = 0

  await withFetch(async () => {
    calls += 1
    return jsonResponse({ task_id: 'task_in_progress' })
  }, async () => {
    const logicalInput = { prompt: 'same request', image: '/tmp/reference.png' }
    assert.equal(await client.submit('images', { prompt: 'same request', image: 'https://upload.test/one' }, undefined, logicalInput), 'task_in_progress')
    assert.equal(await client.submit('images', { prompt: 'same request', image: 'https://upload.test/two' }, undefined, logicalInput), 'task_in_progress')
  })

  assert.equal(calls, 1)
})

test('submit adopts an active task id from a 429 response', async () => {
  const { TokensApiClient } = await import('../dist/index.js')
  const client = new TokensApiClient(ctx, config)
  let calls = 0

  await withFetch(async () => {
    calls += 1
    return jsonResponse({ error: { message: 'task is running' }, active_task_id: 'task_from_429' }, { status: 429 })
  }, async () => {
    assert.equal(await client.submit('videos', { prompt: 'city' }), 'task_from_429')
  })

  assert.equal(calls, 1)
})

test('a 429 without a task id waits and retries with the same key', async () => {
  const { TokensApiClient } = await import('../dist/index.js')
  const client = new TokensApiClient(ctx, config)
  const keys = []
  let calls = 0

  await withFetch(async (_url, init) => {
    calls += 1
    keys.push(init.headers['Idempotency-Key'])
    if (calls === 1) return jsonResponse({ error: { message: 'busy' } }, { status: 429, headers: { 'retry-after': '0' } })
    return jsonResponse({ task_id: 'task_after_429' })
  }, async () => {
    assert.equal(await client.submit('images', { prompt: 'forest' }), 'task_after_429')
  })

  assert.equal(calls, 2)
  assert.equal(new Set(keys).size, 1)
})

test('poll tolerates fetch failures, 429, and unchanged progress until success', async () => {
  const { TokensApiClient } = await import('../dist/index.js')
  const client = new TokensApiClient(ctx, config)
  const responses = [
    new TypeError('fetch failed'),
    jsonResponse({ error: { message: 'slow down' } }, { status: 429, headers: { 'retry-after': '0' } }),
    jsonResponse({ status: 'running', progress: 30 }),
    jsonResponse({ status: 'running', progress: 30 }),
    jsonResponse({ status: 'succeeded', progress: 100, results: ['https://result.test/video.mp4'] }),
  ]
  let calls = 0

  await withFetch(async () => {
    const response = responses[calls]
    calls += 1
    if (response instanceof Error) throw response
    return response
  }, async () => {
    const result = await client.poll('task_stalled_at_30')
    assert.equal(result.status, 'succeeded')
    assert.equal(result.progress, 100)
  })

  assert.equal(calls, 5)
})

test('poll timeout retains task id, progress, and recoverable state', async () => {
  const { TokensApiClient } = await import('../dist/index.js')
  const client = new TokensApiClient(ctx, { ...config, maxPollMs: 3 })

  await withFetch(async () => jsonResponse({ status: 'running', progress: 30 }), async () => {
    const result = await client.poll('task_slow_but_running')
    assert.equal(result.task_id, 'task_slow_but_running')
    assert.equal(result.status, 'running')
    assert.equal(result.progress, 30)
    assert.equal(result.timedOut, true)
    assert.equal(result.recoverable, true)
  })
})

test('a definite client error is not retried', async () => {
  const { TokensApiClient } = await import('../dist/index.js')
  const client = new TokensApiClient(ctx, config)
  let calls = 0

  await withFetch(async () => {
    calls += 1
    return jsonResponse({ error: { message: 'invalid parameter' } }, { status: 400 })
  }, async () => {
    await assert.rejects(client.submit('images', { prompt: '' }), /invalid parameter/)
  })

  assert.equal(calls, 1)
})
