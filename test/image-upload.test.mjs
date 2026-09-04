import assert from 'node:assert/strict'
import test from 'node:test'

const uploadConfig = {
  storageBackend: 'presign',
  imageUploadURL: 'https://tokensapi.test/v1/assets/images',
  uploadAuthMode: 'api_key',
  apiKeyEnv: 'TOKENSAPI_API_KEY',
  accountAccessTokenEnv: 'TOKENSAPI_ACCOUNT_ACCESS_TOKEN',
  accountUserId: '',
}

const uploadContext = {
  credentials: { async resolve() { return { value: 'test-api-key' } } },
  logger: { warn() {} },
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

test('parses the TokensAPI assets v1 image upload response', async () => {
  const { parseImageUploadGrant } = await import('../dist/index.js')
  const grant = parseImageUploadGrant({
    upload_url: 'https://s3.example.com/object?signature=value',
    access_url: 'https://cdn.example.com/api-assets/object.png',
    upload_method: 'PUT',
    required_headers: {
      'Content-Length': '1234',
      'Content-Type': 'image/png',
      'x-amz-checksum-sha256': 'checksum',
    },
    upload_expires_at: 1788499500,
  })

  assert.deepEqual(grant, {
    uploadUrl: 'https://s3.example.com/object?signature=value',
    accessUrl: 'https://cdn.example.com/api-assets/object.png',
    uploadMethod: 'PUT',
    requiredHeaders: {
      'Content-Length': '1234',
      'Content-Type': 'image/png',
      'x-amz-checksum-sha256': 'checksum',
    },
    uploadExpiresAt: 1788499500,
    protocol: 'assets-v1',
  })
})

test('keeps compatibility with the legacy success data response', async () => {
  const { parseImageUploadGrant } = await import('../dist/index.js')
  assert.deepEqual(parseImageUploadGrant({
    success: true,
    data: {
      upload_url: 'https://s3.example.com/legacy',
      access_url: 'https://cdn.example.com/legacy.png',
    },
  }), {
    uploadUrl: 'https://s3.example.com/legacy',
    accessUrl: 'https://cdn.example.com/legacy.png',
    uploadMethod: 'PUT',
    requiredHeaders: {},
    uploadExpiresAt: undefined,
    protocol: 'legacy-presign',
  })
})

test('surfaces structured TokensAPI upload errors', async () => {
  const { parseImageUploadGrant } = await import('../dist/index.js')
  assert.throws(() => parseImageUploadGrant({
    error: {
      type: 'invalid_request_error',
      code: 'file_too_large',
      message: 'file_size must be between 1 and 31457280 bytes',
    },
  }), /file_too_large: file_size must be between 1 and 31457280 bytes/)
})

test('rejects malformed required headers and expiry values', async () => {
  const { parseImageUploadGrant } = await import('../dist/index.js')
  const base = {
    upload_url: 'https://s3.example.com/object',
    access_url: 'https://cdn.example.com/object.png',
    upload_method: 'PUT',
  }
  assert.throws(() => parseImageUploadGrant({ ...base, required_headers: [] }), /invalid required_headers/)
  assert.throws(() => parseImageUploadGrant({ ...base, required_headers: { 'Content-Length': 1234 } }), /invalid required_headers/)
  assert.throws(() => parseImageUploadGrant({ ...base, required_headers: {}, upload_expires_at: 'tomorrow' }), /invalid upload_expires_at/)
})

test('requires all assets v1 response fields', async () => {
  const { parseImageUploadGrant } = await import('../dist/index.js')
  assert.throws(() => parseImageUploadGrant({
    upload_url: 'https://s3.example.com/object',
    access_url: 'https://cdn.example.com/object.png',
    required_headers: {},
  }), /missing upload_method/)
})

test('validates a complete assets v1 upload grant without changing signed headers', async () => {
  const { parseImageUploadGrant, validateImageUploadGrant } = await import('../dist/index.js')
  const grant = parseImageUploadGrant({
    upload_url: 'https://s3.example.com/object?signature=original',
    access_url: 'https://cdn.example.com/api-assets/object.png',
    upload_method: 'PUT',
    required_headers: {
      'content-length': '4',
      'Content-Type': 'image/png',
      'x-amz-checksum-sha256': 'checksum',
    },
    upload_expires_at: 1_700_000_300,
  })
  assert.deepEqual(validateImageUploadGrant(grant, {
    mimeType: 'image/png',
    byteLength: 4,
    nowSeconds: 1_700_000_000,
  }), grant)
})

test('rejects non-HTTPS URLs and URLs containing credentials', async () => {
  const { parseImageUploadGrant, validateImageUploadGrant } = await import('../dist/index.js')
  const response = {
    upload_url: 'https://s3.example.com/object',
    access_url: 'https://cdn.example.com/object.png',
    upload_method: 'PUT',
    required_headers: { 'Content-Length': '4', 'Content-Type': 'image/png' },
  }
  const options = { mimeType: 'image/png', byteLength: 4 }
  assert.throws(() => validateImageUploadGrant(parseImageUploadGrant({ ...response, upload_url: 'http://s3.example.com/object' }), options), /upload_url must use HTTPS/)
  assert.throws(() => validateImageUploadGrant(parseImageUploadGrant({ ...response, access_url: 'file:\/\/\/tmp\/object.png' }), options), /access_url must use HTTPS/)
  assert.throws(() => validateImageUploadGrant(parseImageUploadGrant({ ...response, upload_url: 'https://user:pass@s3.example.com/object' }), options), /upload_url must not contain credentials/)
})

test('rejects methods other than PUT', async () => {
  const { parseImageUploadGrant, validateImageUploadGrant } = await import('../dist/index.js')
  const grant = parseImageUploadGrant({
    upload_url: 'https://s3.example.com/object',
    access_url: 'https://cdn.example.com/object.png',
    upload_method: 'POST',
    required_headers: { 'Content-Length': '4', 'Content-Type': 'image/png' },
  })
  assert.throws(() => validateImageUploadGrant(grant, { mimeType: 'image/png', byteLength: 4 }), /must be PUT/)
})

test('requires matching Content-Length and Content-Type for assets v1', async () => {
  const { parseImageUploadGrant, validateImageUploadGrant } = await import('../dist/index.js')
  const response = {
    upload_url: 'https://s3.example.com/object',
    access_url: 'https://cdn.example.com/object.png',
    upload_method: 'PUT',
    required_headers: { 'Content-Length': '4', 'Content-Type': 'image/png' },
  }
  const options = { mimeType: 'image/png', byteLength: 4 }
  assert.throws(() => validateImageUploadGrant(parseImageUploadGrant({ ...response, required_headers: { 'Content-Type': 'image/png' } }), options), /missing required Content-Length/)
  assert.throws(() => validateImageUploadGrant(parseImageUploadGrant({ ...response, required_headers: { 'Content-Length': '3', 'Content-Type': 'image/png' } }), options), /does not match the local image size/)
  assert.throws(() => validateImageUploadGrant(parseImageUploadGrant({ ...response, required_headers: { 'Content-Length': '4' } }), options), /missing required Content-Type/)
  assert.throws(() => validateImageUploadGrant(parseImageUploadGrant({ ...response, required_headers: { 'Content-Length': '4', 'Content-Type': 'image/jpeg' } }), options), /does not match the local image type/)
})

test('rejects expired and nearly expired upload grants', async () => {
  const { parseImageUploadGrant, validateImageUploadGrant } = await import('../dist/index.js')
  const response = {
    upload_url: 'https://s3.example.com/object',
    access_url: 'https://cdn.example.com/object.png',
    upload_method: 'PUT',
    required_headers: { 'Content-Length': '4', 'Content-Type': 'image/png' },
  }
  const options = { mimeType: 'image/png', byteLength: 4, nowSeconds: 1000 }
  assert.throws(() => validateImageUploadGrant(parseImageUploadGrant({ ...response, upload_expires_at: 1000 }), options), /has expired/)
  assert.throws(() => validateImageUploadGrant(parseImageUploadGrant({ ...response, upload_expires_at: 1004 }), options), /expires too soon/)
  assert.doesNotThrow(() => validateImageUploadGrant(parseImageUploadGrant({ ...response, upload_expires_at: 1005 }), options))
})

test('rejects sensitive, duplicated, and malformed required headers', async () => {
  const { parseImageUploadGrant, validateImageUploadGrant } = await import('../dist/index.js')
  const response = {
    upload_url: 'https://s3.example.com/object',
    access_url: 'https://cdn.example.com/object.png',
    upload_method: 'PUT',
    required_headers: { 'Content-Length': '4', 'Content-Type': 'image/png' },
  }
  const options = { mimeType: 'image/png', byteLength: 4 }
  for (const name of ['Authorization', 'cookie', 'Proxy-Authorization', 'HOST']) {
    assert.throws(() => validateImageUploadGrant(parseImageUploadGrant({ ...response, required_headers: { ...response.required_headers, [name]: 'secret' } }), options), /must not require sensitive header/)
  }
  assert.throws(() => validateImageUploadGrant(parseImageUploadGrant({ ...response, required_headers: { ...response.required_headers, 'content-type': 'image/png' } }), options), /duplicate required header/)
  assert.throws(() => validateImageUploadGrant(parseImageUploadGrant({ ...response, required_headers: { ...response.required_headers, 'x-amz-meta-test': 'ok\r\ninjected: true' } }), options), /invalid required header/)
})

test('validates local MIME and size before accepting an upload grant', async () => {
  const { parseImageUploadGrant, validateImageUploadGrant } = await import('../dist/index.js')
  const grant = parseImageUploadGrant({
    upload_url: 'https://s3.example.com/object',
    access_url: 'https://cdn.example.com/object.png',
    upload_method: 'PUT',
    required_headers: { 'Content-Length': '4', 'Content-Type': 'image/png' },
  })
  assert.throws(() => validateImageUploadGrant(grant, { mimeType: 'image/svg+xml', byteLength: 4 }), /does not support image\/svg\+xml/)
  assert.throws(() => validateImageUploadGrant(grant, { mimeType: 'image/png', byteLength: 0 }), /size must be between/)
  assert.throws(() => validateImageUploadGrant(grant, { mimeType: 'image/png', byteLength: 30 * 1024 * 1024 + 1 }), /size must be between/)
})

test('legacy grants synthesize Content-Type while preserving compatibility', async () => {
  const { parseImageUploadGrant, validateImageUploadGrant } = await import('../dist/index.js')
  const grant = parseImageUploadGrant({
    success: true,
    data: {
      upload_url: 'https://s3.example.com/legacy',
      access_url: 'https://cdn.example.com/legacy.png',
    },
  })
  assert.deepEqual(validateImageUploadGrant(grant, { mimeType: 'image/png', byteLength: 4 }).requiredHeaders, {
    'Content-Type': 'image/png',
  })
})

test('Host requests an assets v1 grant and uploads raw bytes with only signed headers', async () => {
  const { TokensApiClient } = await import('../dist/index.js')
  const client = new TokensApiClient(uploadContext, uploadConfig)
  const calls = []

  await withFetch(async (url, init) => {
    calls.push({ url, init })
    if (calls.length === 1) {
      return new Response(JSON.stringify({
        upload_url: 'https://s3.example.com/object?signature=unchanged',
        access_url: 'https://cdn.example.com/api-assets/object.png',
        upload_method: 'PUT',
        required_headers: {
          'Content-Length': '4',
          'Content-Type': 'image/png',
          'x-amz-checksum-sha256': 'checksum',
        },
        upload_expires_at: Math.floor(Date.now() / 1000) + 300,
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    return new Response(null, { status: 204 })
  }, async () => {
    const accessUrl = await client.uploadImage('data:image/png;base64,AQIDBA==')
    assert.equal(accessUrl, 'https://cdn.example.com/api-assets/object.png')
  })

  assert.equal(calls.length, 2)
  assert.equal(calls[0].url, 'https://tokensapi.test/v1/assets/images')
  assert.equal(calls[0].init.method, 'POST')
  assert.equal(calls[0].init.headers.Authorization, 'Bearer test-api-key')
  assert.equal(calls[0].init.headers['New-Api-User'], undefined)
  assert.deepEqual(JSON.parse(calls[0].init.body), { mime_type: 'image/png', file_size: 4 })

  assert.equal(calls[1].url, 'https://s3.example.com/object?signature=unchanged')
  assert.equal(calls[1].init.method, 'PUT')
  assert.deepEqual(calls[1].init.headers, {
    'Content-Length': '4',
    'Content-Type': 'image/png',
    'x-amz-checksum-sha256': 'checksum',
  })
  assert.deepEqual(Buffer.from(calls[1].init.body), Buffer.from([1, 2, 3, 4]))
  assert.equal(calls[1].init.redirect, 'error')
  assert.equal(calls[1].init.headers.Authorization, undefined)
})

test('Host accepts any successful S3 2xx response and never calls a complete endpoint', async () => {
  const { TokensApiClient } = await import('../dist/index.js')
  for (const s3Status of [200, 201, 204]) {
    const client = new TokensApiClient(uploadContext, uploadConfig)
    const urls = []
    await withFetch(async (url) => {
      urls.push(url)
      if (urls.length === 1) {
        return new Response(JSON.stringify({
          upload_url: `https://s3.example.com/object-${s3Status}`,
          access_url: `https://cdn.example.com/object-${s3Status}.png`,
          upload_method: 'PUT',
          required_headers: { 'Content-Length': '4', 'Content-Type': 'image/png' },
        }), { status: 200 })
      }
      return new Response(s3Status === 204 ? null : '', { status: s3Status })
    }, async () => {
      assert.equal(await client.uploadImage('data:image/png;base64,AQIDBA=='), `https://cdn.example.com/object-${s3Status}.png`)
    })
    assert.equal(urls.length, 2)
    assert.ok(urls.every((url) => !String(url).includes('complete')))
  }
})

test('Host does not contact S3 when signed headers fail validation', async () => {
  const { TokensApiClient } = await import('../dist/index.js')
  const client = new TokensApiClient(uploadContext, uploadConfig)
  let calls = 0

  await withFetch(async () => {
    calls += 1
    return new Response(JSON.stringify({
      upload_url: 'https://s3.example.com/object',
      access_url: 'https://cdn.example.com/object.png',
      upload_method: 'PUT',
      required_headers: { 'Content-Length': '3', 'Content-Type': 'image/png' },
    }), { status: 200 })
  }, async () => {
    await assert.rejects(client.uploadImage('data:image/png;base64,AQIDBA=='), /does not match the local image size/)
  })

  assert.equal(calls, 1)
})

test('Host keeps the legacy upload response working through the same safe PUT path', async () => {
  const { TokensApiClient } = await import('../dist/index.js')
  const client = new TokensApiClient(uploadContext, { ...uploadConfig, imageUploadURL: 'https://tokensapi.test/api/aigc/presign' })
  const calls = []

  await withFetch(async (url, init) => {
    calls.push({ url, init })
    if (calls.length === 1) {
      return new Response(JSON.stringify({
        success: true,
        data: {
          upload_url: 'https://s3.example.com/legacy',
          access_url: 'https://cdn.example.com/legacy.png',
        },
      }), { status: 200 })
    }
    return new Response(null, { status: 204 })
  }, async () => {
    assert.equal(await client.uploadImage('data:image/png;base64,AQIDBA=='), 'https://cdn.example.com/legacy.png')
  })

  assert.deepEqual(calls[1].init.headers, { 'Content-Type': 'image/png' })
  assert.equal(calls[1].init.redirect, 'error')
})

test('Host stops before media use when S3 rejects the upload', async () => {
  const { TokensApiClient } = await import('../dist/index.js')
  const client = new TokensApiClient(uploadContext, uploadConfig)
  let calls = 0

  await withFetch(async () => {
    calls += 1
    if (calls === 1) {
      return new Response(JSON.stringify({
        upload_url: 'https://s3.example.com/object',
        access_url: 'https://cdn.example.com/object.png',
        upload_method: 'PUT',
        required_headers: { 'Content-Length': '4', 'Content-Type': 'image/png' },
      }), { status: 200 })
    }
    return new Response('signature mismatch', { status: 403, statusText: 'Forbidden' })
  }, async () => {
    await assert.rejects(client.uploadImage('data:image/png;base64,AQIDBA=='), /object upload failed \(403\): Forbidden/)
  })

  assert.equal(calls, 2)
})

test('Host classifies TokensAPI image upload signing errors without contacting S3', async () => {
  const { TokensApiClient } = await import('../dist/index.js')
  const cases = [
    { status: 400, code: 'invalid_request_body', message: 'request body is invalid', expected: /signing request is invalid.*code=invalid_request_body.*request body is invalid/ },
    { status: 401, code: undefined, message: 'unauthorized', expected: /API key is invalid or missing/ },
    { status: 403, code: undefined, message: 'forbidden', expected: /user, organization, or IP/ },
    { status: 413, code: 'file_too_large', message: 'file is too large', expected: /30 MB upload limit.*code=file_too_large/ },
    { status: 429, code: undefined, message: 'rate limit exceeded', expected: /requested too frequently; wait before retrying/ },
    { status: 503, code: 'storage_unavailable', message: 'storage is unavailable', expected: /image storage is unavailable.*code=storage_unavailable/ },
  ]

  for (const item of cases) {
    const client = new TokensApiClient(uploadContext, uploadConfig)
    let calls = 0
    await withFetch(async () => {
      calls += 1
      return new Response(JSON.stringify({
        error: {
          type: 'invalid_request_error',
          ...(item.code ? { code: item.code } : {}),
          message: item.message,
        },
      }), { status: item.status })
    }, async () => {
      await assert.rejects(client.uploadImage('data:image/png;base64,AQIDBA=='), item.expected)
    })
    assert.equal(calls, 1)
  }
})

test('explicit legacy account mode still sends only its account headers to the signing endpoint', async () => {
  const { TokensApiClient } = await import('../dist/index.js')
  const credentials = []
  const context = {
    credentials: {
      async resolve(ref) {
        credentials.push(ref)
        return { value: 'legacy-account-token' }
      },
    },
    logger: { warn() {} },
  }
  const client = new TokensApiClient(context, {
    ...uploadConfig,
    imageUploadURL: 'https://tokensapi.test/api/aigc/presign',
    uploadAuthMode: 'account',
    accountUserId: '12345',
  })
  const calls = []

  await withFetch(async (url, init) => {
    calls.push({ url, init })
    if (calls.length === 1) {
      return new Response(JSON.stringify({
        success: true,
        data: {
          upload_url: 'https://s3.example.com/legacy-account',
          access_url: 'https://cdn.example.com/legacy-account.png',
        },
      }), { status: 200 })
    }
    return new Response(null, { status: 204 })
  }, async () => {
    assert.equal(await client.uploadImage('data:image/png;base64,AQIDBA=='), 'https://cdn.example.com/legacy-account.png')
  })

  assert.equal(credentials.length, 1)
  assert.equal(calls[0].init.headers.Authorization, 'Bearer legacy-account-token')
  assert.equal(calls[0].init.headers['New-Api-User'], '12345')
  assert.equal(calls[1].init.headers.Authorization, undefined)
  assert.equal(calls[1].init.headers['New-Api-User'], undefined)
})
