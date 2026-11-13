import { request as httpsRequest } from 'node:https'
import type { IncomingHttpHeaders } from 'node:http'

export interface ObjectUploadRequest {
  url: string
  method: string
  headers: Record<string, string>
  body: Uint8Array
  signal?: AbortSignal
}

export interface ObjectUploadDependencies {
  fetcher?: typeof fetch
  tls12Uploader?: (request: ObjectUploadRequest) => Promise<Response>
}

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException('The operation was aborted.', 'AbortError')
}

function isConnectionReset(error: unknown): boolean {
  const pending: unknown[] = [error]
  const visited = new Set<unknown>()
  while (pending.length > 0 && visited.size < 16) {
    const current = pending.shift()
    if (!current || visited.has(current)) continue
    visited.add(current)
    if (typeof current === 'string') {
      if (/\bECONNRESET\b/i.test(current)) return true
      continue
    }
    if (typeof current !== 'object') continue
    const value = current as { code?: unknown; message?: unknown; cause?: unknown; errors?: unknown }
    if (typeof value.code === 'string' && value.code.toUpperCase() === 'ECONNRESET') return true
    if (typeof value.message === 'string' && /\bECONNRESET\b/i.test(value.message)) return true
    if (value.cause !== undefined) pending.push(value.cause)
    if (Array.isArray(value.errors)) pending.push(...value.errors)
  }
  return false
}

function nativeHeaders(headers: Record<string, string>, byteLength: number): Record<string, string> {
  const result: Record<string, string> = {}
  let hasContentLength = false
  for (const [name, value] of Object.entries(headers)) {
    const lowerName = name.toLowerCase()
    // The URL owns Host. Forwarding an override can break S3 signatures and routing.
    if (lowerName === 'host') continue
    if (lowerName === 'content-length') hasContentLength = true
    result[name] = value
  }
  if (!hasContentLength) result['Content-Length'] = String(byteLength)
  return result
}

function responseHeaders(headers: IncomingHttpHeaders): Headers {
  const result = new Headers()
  for (const [name, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      for (const item of value) result.append(name, item)
    } else if (value !== undefined) {
      result.set(name, value)
    }
  }
  return result
}

export async function uploadObjectWithTls12(request: ObjectUploadRequest): Promise<Response> {
  if (request.signal?.aborted) throw abortError(request.signal)
  return new Promise<Response>((resolve, reject) => {
    let settled = false
    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      request.signal?.removeEventListener('abort', onAbort)
      callback()
    }
    const fail = (error: unknown) => finish(() => reject(error))
    const clientRequest = httpsRequest(request.url, {
      method: request.method,
      headers: nativeHeaders(request.headers, request.body.byteLength),
      minVersion: 'TLSv1.2',
      maxVersion: 'TLSv1.2',
    }, (incoming) => {
      const chunks: Buffer[] = []
      incoming.on('data', (chunk: Buffer | string) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
      incoming.once('error', fail)
      incoming.once('end', () => finish(() => {
        const bytes = Buffer.concat(chunks)
        resolve(new Response(bytes.length > 0 ? bytes : null, {
          status: incoming.statusCode ?? 500,
          statusText: incoming.statusMessage,
          headers: responseHeaders(incoming.headers),
        }))
      }))
    })
    function onAbort(): void {
      clientRequest.destroy(abortError(request.signal!))
    }
    clientRequest.once('error', fail)
    request.signal?.addEventListener('abort', onAbort, { once: true })
    if (request.signal?.aborted) {
      onAbort()
      return
    }
    clientRequest.end(request.body)
  })
}

export async function uploadObjectWithTlsRecovery(
  request: ObjectUploadRequest,
  dependencies: ObjectUploadDependencies = {},
): Promise<Response> {
  if (request.signal?.aborted) throw abortError(request.signal)
  const fetcher = dependencies.fetcher ?? fetch
  try {
    return await fetcher(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: 'error',
      signal: request.signal,
    })
  } catch (error) {
    if (request.signal?.aborted || !isConnectionReset(error)) throw error
    return (dependencies.tls12Uploader ?? uploadObjectWithTls12)(request)
  }
}
