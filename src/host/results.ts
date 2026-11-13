import { get as httpsGet } from 'node:https'
import { detectImageMediaType, extensionForMediaType, sanitizeTaskId } from '../shared/media.js'
import type { GeneratedImage } from './types.js'

interface AttachmentService {
  saveImage(input: { data: Buffer; mediaType: string; name: string }): Promise<{
    attachmentId: string
    mediaType: string
    bytes: number
    width: number
    height: number
    name?: string
  }>
}

type DownloadedResult = { bytes: Buffer; mediaType?: string }

interface DownloadOptions {
  maxAttempts?: number
  baseDelayMs?: number
  tls12Downloader?: (url: string, signal?: AbortSignal) => Promise<DownloadedResult>
}

class DownloadHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterMs?: number,
  ) {
    super(message)
    this.name = 'DownloadHttpError'
  }
}

const RETRYABLE_DOWNLOAD_STATUSES = new Set([404, 408, 409, 425, 429, 500, 502, 503, 504])

function retryAfterMs(response: Response): number | undefined {
  return retryAfterValueMs(response.headers.get('retry-after') ?? undefined)
}

function retryAfterValueMs(input: string | undefined): number | undefined {
  const value = input?.trim()
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000
  const date = Date.parse(value)
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined
}

function retryableDownloadError(error: unknown): boolean {
  if (error instanceof DownloadHttpError) return RETRYABLE_DOWNLOAD_STATUSES.has(error.status)
  return error instanceof TypeError
    || (error instanceof Error && /fetch failed|network|socket|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND/i.test(error.message))
}

function tlsConnectionReset(error: unknown): boolean {
  let current: unknown = error
  for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth += 1) {
    const value = current as { code?: unknown; message?: unknown; cause?: unknown }
    if (value.code === 'ECONNRESET' || (typeof value.message === 'string' && /ECONNRESET/i.test(value.message))) return true
    current = value.cause
  }
  return false
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

async function tls12Request(url: URL, signal?: AbortSignal): Promise<DownloadedResult | { redirect: string }> {
  return new Promise((resolve, reject) => {
    let settled = false
    let request: ReturnType<typeof httpsGet> | undefined
    const cleanup = () => signal?.removeEventListener('abort', onAbort)
    const succeed = (value: DownloadedResult | { redirect: string }) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(value)
    }
    const fail = (error: unknown) => {
      if (settled) return
      settled = true
      cleanup()
      reject(error)
    }
    const onAbort = () => request?.destroy(new Error('Generated image download cancelled'))

    request = httpsGet(url, {
      minVersion: 'TLSv1.2',
      maxVersion: 'TLSv1.2',
      headers: {
        Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*,*/*;q=0.8',
        'User-Agent': 'TokensCowork-media-gen',
      },
    }, (response) => {
      const status = response.statusCode ?? 0
      const location = headerValue(response.headers.location)
      if (status >= 300 && status < 400 && location) {
        response.resume()
        try {
          succeed({ redirect: new URL(location, url).toString() })
        } catch (error) {
          fail(error)
        }
        return
      }
      if (status < 200 || status >= 300) {
        response.resume()
        fail(new DownloadHttpError(
          `Download failed (${status}) for ${url.toString()}`,
          status,
          retryAfterValueMs(headerValue(response.headers['retry-after'])),
        ))
        return
      }
      const chunks: Buffer[] = []
      response.on('data', (chunk: Buffer | Uint8Array) => chunks.push(Buffer.from(chunk)))
      response.on('end', () => succeed({
        bytes: Buffer.concat(chunks),
        mediaType: headerValue(response.headers['content-type'])?.split(';', 1)[0]?.trim().toLowerCase(),
      }))
      response.on('aborted', () => fail(new Error(`Generated image download was interrupted for ${url.toString()}`)))
      response.on('error', fail)
    })
    request.on('error', (error) => {
      if (signal?.aborted) fail(new Error('Generated image download cancelled'))
      else fail(error)
    })
    signal?.addEventListener('abort', onAbort, { once: true })
    if (signal?.aborted) onAbort()
  })
}

export async function downloadWithTls12(url: string, signal?: AbortSignal): Promise<DownloadedResult> {
  let current = new URL(url)
  for (let redirect = 0; redirect <= 5; redirect += 1) {
    if (current.protocol !== 'https:') throw new Error(`Generated media redirect must use HTTPS: ${current.toString()}`)
    const result = await tls12Request(current, signal)
    if (!('redirect' in result)) return result
    current = new URL(result.redirect)
  }
  throw new Error(`Too many redirects while downloading generated media from ${url}`)
}

async function waitForRetry(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw new Error('Generated image download cancelled')
  if (ms <= 0) return
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => signal?.removeEventListener('abort', onAbort)
    const timer = setTimeout(() => {
      cleanup()
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      cleanup()
      reject(new Error('Generated image download cancelled'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    if (signal?.aborted) onAbort()
  })
}

export async function download(
  url: string,
  signal?: AbortSignal,
  options: DownloadOptions = {},
): Promise<DownloadedResult> {
  const maxAttempts = Math.max(1, Math.floor(options.maxAttempts ?? 4))
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? 750)
  const tls12Downloader = options.tls12Downloader ?? downloadWithTls12
  let forceTls12 = false
  let lastError: unknown
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (signal?.aborted) throw new Error('Generated image download cancelled')
    try {
      if (forceTls12) return await tls12Downloader(url, signal)
      const response = await fetch(url, { signal })
      if (!response.ok) {
        throw new DownloadHttpError(
          `Download failed (${response.status}) for ${url}`,
          response.status,
          retryAfterMs(response),
        )
      }
      return {
        bytes: Buffer.from(await response.arrayBuffer()),
        mediaType: response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase(),
      }
    } catch (error) {
      if (signal?.aborted) throw new Error('Generated image download cancelled')
      let retryError = error
      if (!forceTls12 && tlsConnectionReset(error) && new URL(url).protocol === 'https:') {
        forceTls12 = true
        try {
          return await tls12Downloader(url, signal)
        } catch (fallbackError) {
          if (signal?.aborted) throw new Error('Generated image download cancelled')
          retryError = fallbackError
        }
      }
      lastError = retryError
      if (!retryableDownloadError(retryError) || attempt + 1 >= maxAttempts) throw retryError
      const serverDelay = retryError instanceof DownloadHttpError ? retryError.retryAfterMs : undefined
      const delay = serverDelay ?? Math.min(baseDelayMs * (2 ** attempt), 4000)
      await waitForRetry(delay, signal)
    }
  }
  throw lastError
}

export async function saveImages(
  urls: string[],
  taskId: string,
  attachments: AttachmentService | undefined,
  signal?: AbortSignal,
): Promise<GeneratedImage[]> {
  return Promise.all(urls.map(async (url, index) => {
    const result: GeneratedImage = { url }
    if (!attachments) return result
    try {
      const downloaded = await download(url, signal)
      const mediaType = detectImageMediaType(downloaded.bytes, downloaded.mediaType)
      if (!mediaType) throw new Error(`Unsupported generated image type from ${url}`)
      const name = `media_gen_${sanitizeTaskId(taskId)}_${index + 1}${extensionForMediaType(mediaType)}`
      const ref = await attachments.saveImage({ data: downloaded.bytes, mediaType, name })
      return {
        ...result,
        attachmentId: ref.attachmentId,
        mediaType: ref.mediaType,
        bytes: ref.bytes,
        width: ref.width,
        height: ref.height,
        name: ref.name,
      }
    } catch (error) {
      return { ...result, error: error instanceof Error ? error.message : String(error) }
    }
  }))
}
