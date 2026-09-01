import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { createHash, createHmac } from 'node:crypto'
import type { MediaConfig } from './types.js'
import { extensionForMediaType, resultUrls } from '../shared/media.js'

type MediaTaskKind = 'images' | 'videos'

interface PendingSubmission {
  idempotencyKey: string
  taskId?: string
  updatedAt: number
}

class TokensApiHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterMs?: number,
  ) {
    super(message)
    this.name = 'TokensApiHttpError'
  }
}

export interface TokensContext {
  credentials: { resolve(ref: unknown): Promise<{ value?: string } | undefined> }
  logger: { warn(format: string, ...args: unknown[]): void }
}

function sha256Hex(data: Uint8Array | string): string {
  return createHash('sha256').update(data).digest('hex')
}

function hmacSha256(key: Uint8Array | string, data: string): Buffer {
  return createHmac('sha256', key).update(data).digest()
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

function responseTaskId(data: Record<string, unknown>): string | undefined {
  const nested = [data, data.data, data.error].filter((value): value is Record<string, unknown> => Boolean(value && typeof value === 'object'))
  for (const value of nested) {
    for (const key of ['task_id', 'taskId', 'active_task_id', 'activeTaskId', 'existing_task_id', 'existingTaskId']) {
      if (typeof value[key] === 'string' && value[key].trim()) return value[key].trim()
    }
  }
  return undefined
}

function responseErrorMessage(data: Record<string, unknown>, fallback: string): string {
  if (typeof data.message === 'string' && data.message.trim()) return data.message
  const error = data.error
  if (typeof error === 'string' && error.trim()) return error
  if (error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string') {
    return String((error as { message: string }).message)
  }
  return fallback
}

function responseRetryAfterMs(response: Response): number | undefined {
  const value = response.headers.get('retry-after')?.trim()
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000
  const date = Date.parse(value)
  if (Number.isFinite(date)) return Math.max(0, date - Date.now())
  return undefined
}

function transientStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500
}

function signS3V4(options: {
  method: string
  path: string
  host: string
  contentType: string
  payload: Uint8Array
  accessKeyId: string
  secretAccessKey: string
  region: string
  acl?: string
}): { amzDate: string; payloadHash: string; authorization: string } {
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)
  const payloadHash = sha256Hex(options.payload)
  const headerEntries: Array<[string, string]> = [
    ['content-type', options.contentType],
    ['host', options.host],
    ['x-amz-content-sha256', payloadHash],
    ['x-amz-date', amzDate],
  ]
  if (options.acl) headerEntries.push(['x-amz-acl', options.acl])
  const canonicalHeaders = headerEntries.map(([key, value]) => `${key}:${value}\n`).join('')
  const signedHeaders = headerEntries.map(([key]) => key).join(';')
  const canonicalRequest = [options.method, options.path, '', canonicalHeaders, signedHeaders, payloadHash].join('\n')
  const scope = `${dateStamp}/${options.region}/s3/aws4_request`
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n')
  const kDate = hmacSha256(`AWS4${options.secretAccessKey}`, dateStamp)
  const kRegion = hmacSha256(kDate, options.region)
  const kService = hmacSha256(kRegion, 's3')
  const kSigning = hmacSha256(kService, 'aws4_request')
  const signature = hmacSha256(kSigning, stringToSign).toString('hex')
  return {
    amzDate,
    payloadHash,
    authorization: `AWS4-HMAC-SHA256 Credential=${options.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  }
}

export class TokensApiClient {
  private readonly pendingSubmissions = new Map<string, PendingSubmission>()

  constructor(private readonly ctx: TokensContext, private readonly config: MediaConfig) {}

  private async key(refName = this.config.apiKeyEnv): Promise<string> {
    const resolved = await this.ctx.credentials.resolve(credentialRef(refName))
    if (!resolved?.value) throw new Error(`${refName} is not configured in DSH credentials`)
    return resolved.value
  }

  private idempotencyKey(): string {
    return `dsh-media-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  }

  private submissionFingerprint(kind: MediaTaskKind, body: Record<string, unknown>): string {
    return sha256Hex(`${kind}\n${canonicalJson(body)}`)
  }

  private prunePendingSubmissions(): void {
    const expiry = Date.now() - Math.max(this.config.maxPollMs * 2, 30 * 60 * 1000)
    for (const [fingerprint, record] of this.pendingSubmissions) {
      if (record.updatedAt < expiry) this.pendingSubmissions.delete(fingerprint)
    }
  }

  private forgetTask(taskId: string): void {
    for (const [fingerprint, record] of this.pendingSubmissions) {
      if (record.taskId === taskId) this.pendingSubmissions.delete(fingerprint)
    }
  }

  private retryDelay(attempt: number, retryAfterMs?: number): number {
    if (retryAfterMs !== undefined) return Math.min(retryAfterMs, 30_000)
    const factors = [1, 1.6, 2.6, 4, 6]
    const factor = factors[Math.min(attempt, factors.length - 1)] ?? 6
    return Math.min(30_000, Math.max(1, Math.round(this.config.pollIntervalMs * factor)))
  }

  private async wait(ms: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw new Error('Generation cancelled')
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timer)
        reject(new Error('Generation cancelled'))
      }
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort)
        resolve()
      }, ms)
      signal?.addEventListener('abort', onAbort, { once: true })
    })
  }

  private isTransientError(error: unknown): boolean {
    if (error instanceof TokensApiHttpError) return transientStatus(error.status)
    return error instanceof TypeError || (error instanceof Error && /fetch failed|network|socket|ECONNRESET|ETIMEDOUT/i.test(error.message))
  }

  async uploadImage(dataUrl: string, signal?: AbortSignal): Promise<string> {
    if (this.config.storageBackend === 'r2') return this.uploadImageR2(dataUrl, signal)
    if (!this.config.imageUploadURL) throw new Error('TokensAPI presign URL is not configured.')
    if (this.config.uploadAuthMode === 'account' && !this.config.accountUserId.trim()) {
      throw new Error('accountUserId is required for account-authenticated TokensAPI image upload.')
    }
    const match = dataUrl.match(/^data:([^;,]+);base64,(.*)$/s)
    if (!match) throw new Error('First-party image upload requires a base64 Data URL.')
    const mediaType = match[1] ?? 'image/png'
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mediaType)) {
      throw new Error(`TokensAPI presign does not support ${mediaType}.`)
    }
    const bytes = Buffer.from(match[2] ?? '', 'base64')
    if (bytes.length === 0 || bytes.length > 30 * 1024 * 1024) throw new Error('TokensAPI image upload size must be between 1 byte and 30 MB.')
    const uploadCredentialRef = this.config.uploadAuthMode === 'api_key'
      ? this.config.apiKeyEnv
      : this.config.accountAccessTokenEnv
    const presignHeaders: Record<string, string> = {
      Authorization: `Bearer ${await this.key(uploadCredentialRef)}`,
      'Content-Type': 'application/json',
    }
    if (this.config.uploadAuthMode === 'account') presignHeaders['New-Api-User'] = this.config.accountUserId.trim()
    const presignResponse = await fetch(this.config.imageUploadURL, {
      method: 'POST',
      headers: presignHeaders,
      body: JSON.stringify({ mime_type: mediaType, file_size: bytes.length }),
      signal,
    })
    const presign = await presignResponse.json().catch(() => ({})) as {
      success?: boolean
      message?: string
      data?: { upload_url?: string; access_url?: string }
    }
    if (!presignResponse.ok || presign.success !== true) {
      const detail = presign.message ?? presignResponse.statusText
      if (this.config.uploadAuthMode === 'api_key' && /unauthorized|invalid access token/i.test(detail)) {
        throw new Error('TokensAPI presign rejected the configured API key. Production /api/aigc/presign currently requires an account access token and New-Api-User, or the server must enable TokenOrUserAuth for this route.')
      }
      throw new Error(`TokensAPI presign failed (${presignResponse.status}): ${detail}`)
    }
    const uploadUrl = presign.data?.upload_url
    const accessUrl = presign.data?.access_url
    if (!uploadUrl || !/^https:\/\//i.test(uploadUrl) || !accessUrl || !/^https:\/\//i.test(accessUrl)) {
      throw new Error('TokensAPI presign returned invalid upload_url or access_url.')
    }
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': mediaType },
      body: bytes,
      signal,
    })
    if (!uploadResponse.ok) throw new Error(`TokensAPI object upload failed (${uploadResponse.status}): ${uploadResponse.statusText}`)
    return accessUrl
  }

  private async uploadImageR2(dataUrl: string, signal?: AbortSignal): Promise<string> {
    const requiredFields: Array<keyof MediaConfig> = ['r2Endpoint', 'r2Bucket', 'r2CdnBase']
    for (const field of requiredFields) {
      if (!String(this.config[field] ?? '').trim()) throw new Error(`${field} is required for R2/S3 image upload.`)
    }
    const match = dataUrl.match(/^data:([^;,]+);base64,(.*)$/s)
    if (!match) throw new Error('R2/S3 image upload requires a base64 Data URL.')
    const mediaType = match[1] ?? 'image/png'
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mediaType)) {
      throw new Error(`R2/S3 upload does not support ${mediaType}.`)
    }
    const bytes = Buffer.from(match[2] ?? '', 'base64')
    if (bytes.length === 0 || bytes.length > 30 * 1024 * 1024) throw new Error('R2/S3 image upload size must be between 1 byte and 30 MB.')
    const endpoint = new URL(this.config.r2Endpoint.trim())
    const bucket = this.config.r2Bucket.trim().replace(/^\/+|\/+$/g, '')
    const prefix = this.config.r2PathPrefix.trim().replace(/^\/+|\/+$/g, '')
    const extension = extensionForMediaType(mediaType)
    const objectKey = `${prefix ? `${prefix}/` : ''}dsh-media-${Date.now()}-${Math.random().toString(36).slice(2, 10)}${extension}`
    const encodedKey = objectKey.split('/').map((segment) => encodeURIComponent(segment)).join('/')
    const path = `/${bucket}/${encodedKey}`
    const accessKeyId = await this.key(this.config.r2AccessKeyEnv)
    const secretAccessKey = await this.key(this.config.r2SecretKeyEnv)
    const signed = signS3V4({
      method: 'PUT',
      path,
      host: endpoint.host,
      contentType: mediaType,
      payload: bytes,
      accessKeyId,
      secretAccessKey,
      region: this.config.r2Region.trim() || 'auto',
    })
    const uploadResponse = await fetch(`https://${endpoint.host}${path}`, {
      method: 'PUT',
      headers: {
        'Content-Type': mediaType,
        'x-amz-content-sha256': signed.payloadHash,
        'x-amz-date': signed.amzDate,
        Authorization: signed.authorization,
      },
      body: bytes,
      signal,
    })
    if (!uploadResponse.ok) {
      const detail = await uploadResponse.text().catch(() => '')
      throw new Error(`R2/S3 object upload failed (${uploadResponse.status}): ${detail || uploadResponse.statusText}`)
    }
    const cdnBase = this.config.r2CdnBase.trim().replace(/\/+$/, '')
    return `${cdnBase}/${objectKey}`
  }

  async submit(
    kind: MediaTaskKind,
    body: Record<string, unknown>,
    signal?: AbortSignal,
    deduplicationInput: Record<string, unknown> = body,
  ): Promise<string> {
    this.prunePendingSubmissions()
    const fingerprint = this.submissionFingerprint(kind, deduplicationInput)
    const existing = this.pendingSubmissions.get(fingerprint)
    if (existing?.taskId) {
      existing.updatedAt = Date.now()
      return existing.taskId
    }
    const record = existing ?? { idempotencyKey: this.idempotencyKey(), updatedAt: Date.now() }
    this.pendingSubmissions.set(fingerprint, record)
    let lastProblem = 'network interruption'
    const maxAttempts = 3
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (signal?.aborted) throw new Error('Generation cancelled')
      let response: Response
      try {
        response = await fetch(`${this.config.baseURL}/tasks/${kind}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${await this.key()}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': record.idempotencyKey,
          },
          body: JSON.stringify(body),
          signal,
        })
      } catch (error) {
        if (signal?.aborted) throw new Error('Generation cancelled')
        if (!this.isTransientError(error)) {
          this.pendingSubmissions.delete(fingerprint)
          throw error
        }
        lastProblem = error instanceof Error ? error.message : String(error)
        record.updatedAt = Date.now()
        if (attempt + 1 < maxAttempts) {
          await this.wait(this.retryDelay(attempt), signal)
          continue
        }
        break
      }
      const data = await response.json().catch(() => ({})) as Record<string, unknown>
      const taskId = responseTaskId(data)
      if (taskId && (response.ok || response.status === 409 || response.status === 429)) {
        record.taskId = taskId
        record.updatedAt = Date.now()
        return taskId
      }
      if (response.ok && !taskId) {
        lastProblem = 'TokensAPI returned no task_id'
      } else if (!response.ok) {
        const detail = responseErrorMessage(data, response.statusText)
        lastProblem = `TokensAPI submit failed (${response.status}): ${detail}`
        if (!transientStatus(response.status)) {
          this.pendingSubmissions.delete(fingerprint)
          throw new TokensApiHttpError(lastProblem, response.status, responseRetryAfterMs(response))
        }
      }
      record.updatedAt = Date.now()
      if (attempt + 1 < maxAttempts) {
        await this.wait(this.retryDelay(attempt, responseRetryAfterMs(response)), signal)
      }
    }
    throw new Error(`TokensAPI submission status is uncertain after ${lastProblem}. Do not create a new task; retrying the same request will reuse idempotency key ${record.idempotencyKey}.`)
  }

  async status(taskId: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
    const response = await fetch(`${this.config.baseURL}/tasks/${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${await this.key()}` },
      signal,
    })
    const data = await response.json().catch(() => ({})) as Record<string, unknown>
    if (!response.ok) {
      throw new TokensApiHttpError(
        `TokensAPI status failed (${response.status}): ${responseErrorMessage(data, response.statusText)}`,
        response.status,
        responseRetryAfterMs(response),
      )
    }
    return data
  }

  async poll(taskId: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
    const deadline = Date.now() + this.config.maxPollMs
    let lastData: Record<string, unknown> = { task_id: taskId, status: 'running', progress: 0 }
    let transientAttempts = 0
    for (;;) {
      if (signal?.aborted) throw new Error('Generation cancelled')
      let data: Record<string, unknown>
      try {
        data = await this.status(taskId, signal)
        lastData = data
        transientAttempts = 0
      } catch (error) {
        if (signal?.aborted) throw new Error('Generation cancelled')
        if (!this.isTransientError(error)) throw new Error(`Generation task ${taskId} status check failed: ${error instanceof Error ? error.message : String(error)}`)
        if (Date.now() > deadline) return { ...lastData, task_id: taskId, timedOut: true, recoverable: true }
        const retryAfterMs = error instanceof TokensApiHttpError ? error.retryAfterMs : undefined
        await this.wait(this.retryDelay(transientAttempts, retryAfterMs), signal)
        transientAttempts += 1
        continue
      }
      const status = typeof data.status === 'string' ? data.status : 'unknown'
      if (status === 'succeeded') {
        this.forgetTask(taskId)
        return data
      }
      if (status === 'failed' || status === 'error' || status === 'cancelled') {
        this.forgetTask(taskId)
        const errorValue = data.error
        const error = errorValue && typeof errorValue === 'object'
          ? ((errorValue as { message?: string; code?: string }).message ?? JSON.stringify(errorValue))
          : typeof errorValue === 'string' ? errorValue : status
        throw new Error(`Generation task ${taskId} failed: ${error}`)
      }
      if (Date.now() > deadline) return { ...data, task_id: taskId, timedOut: true, recoverable: true }
      await this.wait(this.config.pollIntervalMs, signal)
    }
  }

  urls(data: unknown): string[] {
    return resultUrls(data)
  }

  async enhance(intent: 'image_gen' | 'image_edit' | 'video_gen', prompt: string, signal?: AbortSignal): Promise<string> {
    if (!this.config.enhanceEnabled) return prompt
    try {
      const prompts = {
        image_gen: 'Enhance this AI image prompt. Preserve intent and add visual details, style, lighting, composition and atmosphere. Respond only with the enhanced prompt.',
        image_edit: 'Enhance this AI image editing instruction. Preserve intent and add precise desired changes and quality details. Respond only with the enhanced instruction.',
        video_gen: 'Enhance this AI video prompt. Preserve intent and add motion, camera movement, lighting and atmosphere. Respond only with the enhanced prompt.',
      }
      const response = await fetch(`${this.config.enhanceBaseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${await this.key(this.config.enhanceApiKeyEnv)}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.enhanceModel,
          messages: [
            { role: 'system', content: prompts[intent] },
            { role: 'user', content: prompt },
          ],
          temperature: 0.7,
        }),
        signal,
      })
      const data = await response.json().catch(() => ({})) as { choices?: Array<{ message?: { content?: string } }> }
      if (!response.ok) throw new Error(`Prompt enhancement failed (${response.status})`)
      return data.choices?.[0]?.message?.content?.trim().slice(0, this.config.enhanceMaxChars) || prompt
    } catch (error) {
      this.ctx.logger.warn('media-gen: prompt enhancement failed, using original prompt: %s', error instanceof Error ? error.message : String(error))
      return prompt
    }
  }
}
