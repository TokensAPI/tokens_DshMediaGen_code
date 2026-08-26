import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type { MediaConfig } from './types.js'
import { resultUrls } from '../shared/media.js'

export interface TokensContext {
  credentials: { resolve(ref: unknown): Promise<{ value?: string } | undefined> }
  logger: { warn(format: string, ...args: unknown[]): void }
}

export class TokensApiClient {
  constructor(private readonly ctx: TokensContext, private readonly config: MediaConfig) {}

  private async key(refName = this.config.apiKeyEnv): Promise<string> {
    const resolved = await this.ctx.credentials.resolve(credentialRef(refName))
    if (!resolved?.value) throw new Error(`${refName} is not configured in DSH credentials`)
    return resolved.value
  }

  private idempotencyKey(): string {
    return `dsh-media-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  }

  async uploadImage(dataUrl: string, signal?: AbortSignal): Promise<string> {
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

  async submit(kind: 'images' | 'videos', body: Record<string, unknown>, signal?: AbortSignal): Promise<string> {
    const response = await fetch(`${this.config.baseURL}/tasks/${kind}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await this.key()}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': this.idempotencyKey(),
      },
      body: JSON.stringify(body),
      signal,
    })
    const data = await response.json().catch(() => ({})) as { task_id?: string; error?: { message?: string } }
    if (!response.ok) throw new Error(`TokensAPI submit failed (${response.status}): ${data.error?.message ?? response.statusText}`)
    if (!data.task_id) throw new Error('TokensAPI returned no task_id')
    return data.task_id
  }

  async status(taskId: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
    const response = await fetch(`${this.config.baseURL}/tasks/${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${await this.key()}` },
      signal,
    })
    const data = await response.json().catch(() => ({})) as Record<string, unknown>
    if (!response.ok) throw new Error(`TokensAPI status failed (${response.status})`)
    return data
  }

  async poll(taskId: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
    const deadline = Date.now() + this.config.maxPollMs
    for (;;) {
      if (signal?.aborted) throw new Error('Generation cancelled')
      const data = await this.status(taskId, signal)
      const status = typeof data.status === 'string' ? data.status : 'unknown'
      if (status === 'succeeded') return data
      if (status === 'failed' || status === 'error' || status === 'cancelled') {
        const errorValue = data.error
        const error = errorValue && typeof errorValue === 'object'
          ? ((errorValue as { message?: string; code?: string }).message ?? JSON.stringify(errorValue))
          : typeof errorValue === 'string' ? errorValue : status
        throw new Error(`Generation task ${taskId} failed: ${error}`)
      }
      if (Date.now() > deadline) return { ...data, timedOut: true }
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, this.config.pollIntervalMs)
        signal?.addEventListener('abort', () => {
          clearTimeout(timer)
          reject(new Error('Generation cancelled'))
        }, { once: true })
      })
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
