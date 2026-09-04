import Schema from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { homedir } from 'node:os'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import {
  ASPECT_RATIOS,
  DURATIONS,
  IMAGE_MODELS,
  IMAGE_EDIT_MODELS,
  IMAGE_ASPECT_RATIOS,
  SEEDANCE_RESOLUTIONS,
  VIDEO_ASPECT_RATIOS,
  VIDEO_MODELS,
  resolveImageInput,
  videoModelCapability,
} from '../shared/media.js'
import { saveImages, saveVideo } from './results.js'
import { TokensApiClient } from './tokensapi.js'
export { TokensApiClient } from './tokensapi.js'
export { parseImageUploadGrant, validateImageUploadGrant } from './image-upload.js'
export type { ImageUploadGrant, ImageUploadProtocol, ImageUploadValidationOptions } from './image-upload.js'
export {
  VIDEO_MODEL_CAPABILITIES,
  VIDEO_MODEL_IDS,
  VIDEO_MODELS,
  isVideoModel,
  videoModelCapability,
} from '../shared/media.js'
export type {
  VideoAudioMode,
  VideoGenerateAudioParameter,
  VideoInputMode,
  VideoModel,
  VideoModelCapability,
} from '../shared/media.js'
import type { VideoInputMode, VideoModel } from '../shared/media.js'
import type { GeneratedImage, MediaConfig } from './types.js'

export const name = 'media-gen'
export const inject = ['tools', 'credentials', 'userQuestions', 'systemPrompt', 'attachments', 'webServer']

export const Config = Schema.object({
  baseURL: Schema.string().default('https://tokensapi.ai/v1'),
  apiKeyEnv: Schema.string().role('credential-ref').default('TOKENSAPI_API_KEY'),
  outputDir: Schema.string().default(join(homedir(), 'Downloads', 'dsh-media-gen')),
  pollIntervalMs: Schema.number().default(5000),
  maxPollMs: Schema.number().default(12 * 60 * 1000),
  defaultImageModel: Schema.union([...IMAGE_MODELS]).default('z_image_turbo'),
  defaultEditModel: Schema.union([...IMAGE_EDIT_MODELS]).default('qwen_image'),
  defaultVideoModel: Schema.union([...VIDEO_MODELS]).default('minimax_h3'),
  enhanceEnabled: Schema.boolean().default(true),
  enhanceApiKeyEnv: Schema.string().role('credential-ref').default('TOKENSAPI_API_KEY'),
  enhanceBaseURL: Schema.string().default('https://tokensapi.ai/v1'),
  enhanceModel: Schema.string().default('deepseek-v4-flash'),
  enhanceMaxChars: Schema.number().default(4000),
  allowLocalImageInput: Schema.boolean().default(true),
  maxInputImageBytes: Schema.number().default(30 * 1024 * 1024),
  imageUploadURL: Schema.string().default('https://tokensapi.ai/v1/assets/images'),
  uploadAuthMode: Schema.union(['account', 'api_key']).default('api_key'),
  accountAccessTokenEnv: Schema.string().role('credential-ref').default('TOKENSAPI_ACCOUNT_ACCESS_TOKEN'),
  accountUserId: Schema.string().default(''),
  storageBackend: Schema.union(['presign', 'r2']).default('presign'),
  r2Endpoint: Schema.string().default(''),
  r2Region: Schema.string().default('auto'),
  r2AccessKeyEnv: Schema.string().role('credential-ref').default('R2_ACCESS_KEY_ID'),
  r2SecretKeyEnv: Schema.string().role('credential-ref').default('R2_SECRET_ACCESS_KEY'),
  r2Bucket: Schema.string().default(''),
  r2CdnBase: Schema.string().default(''),
  r2PathPrefix: Schema.string().default('inputs'),
})

type AnyRecord = Record<string, any>
type MediaIntent = 'image_gen' | 'image_edit' | 'video_gen'
type ReuseCategory = 'prompt' | 'references' | 'settings'

const VIDEO_ROUTE_PREFIX = '/media-gen/videos'
const DOWNLOAD_ROUTE = '/media-gen/download'

function safeDownloadName(url: URL, requestedName: string | null): string {
  const fallback = url.pathname.split('/').pop() || 'media-download'
  const value = String(requestedName || fallback).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 160)
  return value || 'media-download'
}

function registerDownloadRoute(ctx: AnyRecord): void {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: DOWNLOAD_ROUTE,
    async handler(req: AnyRecord, res: AnyRecord) {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { Allow: 'GET, HEAD' })
        res.end()
        return
      }
      let source: URL
      let filename: string
      try {
        const requestUrl = new URL(req.url ?? DOWNLOAD_ROUTE, 'http://dsh.local')
        source = new URL(requestUrl.searchParams.get('url') || '')
        filename = safeDownloadName(source, requestUrl.searchParams.get('name'))
      } catch {
        res.writeHead(400)
        res.end()
        return
      }
      if (source.protocol !== 'https:' || source.hostname !== 's3.tokensapi.ai') {
        res.writeHead(403)
        res.end()
        return
      }
      try {
        const response = await fetch(source)
        if (!response.ok || !response.body) {
          res.writeHead(response.status || 502)
          res.end()
          return
        }
        const headers: Record<string, string> = {
          'Content-Type': response.headers.get('content-type') || 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'private, max-age=300',
        }
        const length = response.headers.get('content-length')
        if (length) headers['Content-Length'] = length
        res.writeHead(200, headers)
        if (req.method === 'HEAD') {
          res.end()
          return
        }
        Readable.fromWeb(response.body as any).pipe(res as any)
      } catch {
        res.writeHead(502)
        res.end()
      }
    },
  }), 'media-gen: explicit download route')
}

function parseRange(value: string | undefined, size: number): { start: number; end: number } | null {
  if (!value) return null
  const match = value.match(/^bytes=(\d*)-(\d*)$/)
  if (!match) return null
  let start: number
  let end: number
  if (match[1]) {
    start = Number(match[1])
    end = match[2] ? Number(match[2]) : size - 1
  } else if (match[2]) {
    const suffix = Number(match[2])
    start = Math.max(0, size - suffix)
    end = size - 1
  } else return null
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= size) return null
  return { start, end: Math.min(end, size - 1) }
}

function registerVideoRoute(ctx: AnyRecord, config: MediaConfig): void {
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: VIDEO_ROUTE_PREFIX,
    async handler(req: AnyRecord, res: AnyRecord) {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { Allow: 'GET, HEAD' })
        res.end()
        return
      }
      const pathname = new URL(req.url ?? '/', 'http://dsh.local').pathname
      const encodedName = pathname.slice(VIDEO_ROUTE_PREFIX.length + 1)
      let filename: string
      try { filename = decodeURIComponent(encodedName) } catch { res.writeHead(400); res.end(); return }
      if (!/^media_gen_[A-Za-z0-9_-]+\.mp4$/.test(filename)) {
        res.writeHead(404)
        res.end()
        return
      }
      const filePath = join(config.outputDir, filename)
      let info
      try { info = await stat(filePath) } catch { res.writeHead(404); res.end(); return }
      if (!info.isFile()) { res.writeHead(404); res.end(); return }
      const range = parseRange(typeof req.headers.range === 'string' ? req.headers.range : undefined, info.size)
      const headers: Record<string, string | number> = {
        'Content-Type': 'video/mp4',
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, max-age=3600',
      }
      if (req.headers.range && !range) {
        res.writeHead(416, { ...headers, 'Content-Range': `bytes */${info.size}` })
        res.end()
        return
      }
      if (range) {
        headers['Content-Range'] = `bytes ${range.start}-${range.end}/${info.size}`
        headers['Content-Length'] = range.end - range.start + 1
        res.writeHead(206, headers)
      } else {
        headers['Content-Length'] = info.size
        res.writeHead(200, headers)
      }
      if (req.method === 'HEAD') { res.end(); return }
      const stream = createReadStream(filePath, range ?? undefined)
      stream.on('error', () => res.destroy())
      stream.pipe(res as any)
    },
  }), 'media-gen: local video route')
}

function stripRecommended(value: unknown): string {
  return String(value ?? '').replace(/\s*(?:\((?:recommended|推荐)\)|（(?:recommended|推荐)）)\s*$/i, '').trim()
}

function selected(answer: AnyRecord | undefined): string | null {
  if (answer?.custom !== undefined && String(answer.custom).trim()) return String(answer.custom).trim()
  return answer?.selected?.[0] ?? null
}

function numberLabel(value: unknown): number | undefined {
  const match = String(value ?? '').match(/^\s*(\d+)/)
  return match ? Number(match[1]) : undefined
}

async function ask(ctx: AnyRecord, exec: AnyRecord, questions: AnyRecord[]): Promise<Record<string, AnyRecord>> {
  const response = await ctx.userQuestions.ask({ questions, ...(exec.agent ? { agent: exec.agent } : {}), signal: exec.signal })
  return Object.fromEntries((response.answers ?? []).map((answer: AnyRecord) => [answer.id, answer]))
}

function sessionUserImageRefs(exec: AnyRecord): AnyRecord[] {
  const messages = exec.agent?.session?.deriveMessages?.() ?? []
  const refs: AnyRecord[] = []
  for (const message of messages) {
    if (message?.role !== 'user' || !Array.isArray(message.content)) continue
    for (const block of message.content) {
      if (block?.type !== 'image' || !block.attachment || typeof block.attachment !== 'object') continue
      if (typeof block.attachment.attachmentId !== 'string') continue
      refs.push(block.attachment)
    }
  }
  return refs
}

function resolveSessionImageRef(exec: AnyRecord, selector: string): AnyRecord | null {
  const refs = sessionUserImageRefs(exec)
  if (refs.length === 0) return null
  if (!selector || selector === 'latest') return refs.at(-1) ?? null
  if (selector === 'first') return refs[0] ?? null
  if (selector === 'last') return refs.at(-1) ?? null
  const ordinal = /^(?:index:)?(\d+)$/.exec(selector)
  if (ordinal) {
    const position = Number(ordinal[1])
    if (!Number.isSafeInteger(position) || position < 1) return null
    return refs[position - 1] ?? null
  }
  const attachmentId = selector.startsWith('sha256:') ? selector : `sha256:${selector}`
  for (let index = refs.length - 1; index >= 0; index -= 1) {
    if (refs[index]?.attachmentId === attachmentId) return refs[index] ?? null
  }
  return null
}

function describeSessionImageSelector(selector: string): string {
  if (!selector || selector === 'latest' || selector === 'last') return '当前对话最近一张用户上传图片'
  if (selector === 'first') return '当前对话第 1 张用户上传图片'
  const ordinal = /^(?:index:)?(\d+)$/.exec(selector)
  if (ordinal) return `当前对话第 ${Number(ordinal[1])} 张用户上传图片`
  return `当前对话附件 ${selector}`
}

function describeImageInput(input: unknown): string {
  const value = String(input ?? '')
  if (!value.startsWith('dsh-attachment:')) return value
  return describeSessionImageSelector(value.slice('dsh-attachment:'.length).trim() || 'latest')
}

function supportedModelsForIntent(intent: 'image_gen' | 'image_edit' | 'video_gen'): readonly string[] {
  return intent === 'video_gen' ? VIDEO_MODELS : intent === 'image_edit' ? IMAGE_EDIT_MODELS : IMAGE_MODELS
}

function defaultModelForIntent(intent: 'image_gen' | 'image_edit' | 'video_gen', config: MediaConfig): string {
  return intent === 'video_gen' ? config.defaultVideoModel : intent === 'image_edit' ? config.defaultEditModel : config.defaultImageModel
}

function resolveEffectiveVideoModel(params: AnyRecord, config: MediaConfig): VideoModel {
  const model = params.model ?? config.defaultVideoModel
  if (!(VIDEO_MODELS as readonly string[]).includes(model)) throw new Error(`Unsupported video model: ${model}`)
  return model as VideoModel
}

function videoInputMode(params: AnyRecord): VideoInputMode {
  if (params.end_image) return 'first_last_frame'
  if (params.start_image || params.image_url) return 'first_frame'
  return 'text'
}

function videoAudioDescription(model: VideoModel, generateAudio: unknown): string {
  const capability = videoModelCapability(model)
  if (capability.audioMode === 'required') return '自动生成音频（模型固定开启）'
  if (capability.audioMode === 'not_configurable') return '由模型工作流决定'
  return generateAudio === false ? '关闭' : '开启'
}

function videoModelDescription(model: VideoModel): string {
  const capability = videoModelCapability(model)
  const audio = capability.audioMode === 'required' ? '固定音频' : capability.audioMode === 'optional' ? '音频可选' : '音频不可配置'
  return `${capability.durations.join('/')} 秒 · ${capability.resolutions.join('/')} · ${audio}`
}

function videoAspectRatioLabel(ratio: string, inputMode: VideoInputMode): string {
  if (ratio !== 'adaptive') return ratio
  return inputMode === 'text'
    ? 'adaptive（模型自动选择画面比例）'
    : 'adaptive（自动匹配输入图片比例）'
}

function parseVideoAspectRatioLabel(value: unknown): string {
  return stripRecommended(value).replace(/^adaptive（[^）]+）$/, 'adaptive')
}

const REFERENCE_REUSE_KEYS: Record<MediaIntent, readonly string[]> = {
  image_gen: [],
  image_edit: ['image'],
  video_gen: ['image_url', 'start_image', 'end_image'],
}

const SETTINGS_REUSE_KEYS: Record<MediaIntent, readonly string[]> = {
  image_gen: ['model', 'useDefaultModel', 'aspect_ratio', 'n'],
  image_edit: ['model', 'useDefaultModel', 'aspect_ratio', 'n'],
  video_gen: ['model', 'useDefaultModel', 'aspect_ratio', 'duration', 'resolution', 'generate_audio'],
}

function normalizeReuseDecisions(value: unknown): Partial<Record<ReuseCategory, boolean>> {
  if (value === undefined) return {}
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('reuse must be an object.')
  const decisions: Partial<Record<ReuseCategory, boolean>> = {}
  for (const category of ['prompt', 'references', 'settings'] as const) {
    const decision = (value as AnyRecord)[category]
    if (decision !== undefined && typeof decision !== 'boolean') throw new Error(`reuse.${category} must be a boolean.`)
    if (typeof decision === 'boolean') decisions[category] = decision
  }
  return decisions
}

function normalizeContextCandidates(intent: MediaIntent, value: unknown): AnyRecord {
  if (value === undefined) return {}
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('previousTask must be an object.')
  const previous = value as AnyRecord
  if (previous.intent !== intent) return {}
  if (previous.params === null || typeof previous.params !== 'object' || Array.isArray(previous.params)) {
    throw new Error('previousTask.params must be an object.')
  }
  const source = previous.params as AnyRecord
  const keys = ['prompt', ...REFERENCE_REUSE_KEYS[intent], ...SETTINGS_REUSE_KEYS[intent]]
  const candidates: AnyRecord = {}
  for (const key of keys) {
    if (source[key] !== undefined) candidates[key] = source[key]
  }
  for (const key of ['prompt', 'model', 'image', 'aspect_ratio', 'resolution', 'image_url', 'start_image', 'end_image']) {
    trimOptionalString(candidates, key)
  }
  for (const key of ['useDefaultModel', 'generate_audio']) {
    if (candidates[key] !== undefined && typeof candidates[key] !== 'boolean') delete candidates[key]
  }
  for (const key of ['n', 'duration']) {
    if (candidates[key] !== undefined && (!Number.isInteger(candidates[key]) || candidates[key] <= 0)) delete candidates[key]
  }
  if (candidates.model && candidates.useDefaultModel === true) delete candidates.useDefaultModel
  return candidates
}

function missingReusableValues(params: AnyRecord, candidates: AnyRecord, keys: readonly string[]): AnyRecord {
  return Object.fromEntries(keys
    .filter((key) => params[key] === undefined && candidates[key] !== undefined)
    .map((key) => [key, candidates[key]]))
}

function truncatedPrompt(value: unknown): string {
  const prompt = String(value ?? '').replace(/\s+/g, ' ').trim()
  return prompt.length > 180 ? `${prompt.slice(0, 177)}...` : prompt
}

function promptSourceDescription(value: unknown): string {
  if (value === 'inferred') return '根据当前请求推断'
  if (value === 'wizard') return '向导中填写'
  if (value === 'reused') return '历史任务复用'
  return '本次输入'
}

function reusableReferenceDetail(intent: MediaIntent, values: AnyRecord): string {
  if (intent === 'image_edit') return `参考图：${describeImageInput(values.image)}`
  return [
    ...(values.start_image || values.image_url ? [`首帧：${describeImageInput(values.start_image ?? values.image_url)}`] : []),
    ...(values.end_image ? [`尾帧：${describeImageInput(values.end_image)}`] : []),
  ].join('\n')
}

function reusableSettingsDetail(values: AnyRecord): string {
  return [
    ...(values.model ? [`模型：${values.model}`] : values.useDefaultModel === true ? ['模型：推荐模型'] : []),
    ...(values.aspect_ratio ? [`画面比例：${values.aspect_ratio}`] : []),
    ...(values.n ? [`数量：${values.n} 张`] : []),
    ...(values.duration ? [`时长：${values.duration} 秒`] : []),
    ...(values.resolution ? [`分辨率：${values.resolution}`] : []),
    ...(typeof values.generate_audio === 'boolean' ? [`音频：${values.generate_audio ? '开启' : '关闭'}`] : []),
  ].join('\n')
}

function mergeReusableValues(params: AnyRecord, values: AnyRecord): void {
  for (const [key, value] of Object.entries(values)) {
    if (params[key] === undefined) params[key] = value
  }
}

function pruneIncompatibleReusedSettings(intent: MediaIntent, params: AnyRecord, reusedKeys: Set<string>, config: MediaConfig): void {
  const supportedModels = supportedModelsForIntent(intent)
  if (reusedKeys.has('model') && params.model && !supportedModels.includes(params.model)) delete params.model
  if (intent === 'video_gen') {
    const model = resolveEffectiveVideoModel(params, config)
    const capability = videoModelCapability(model)
    if (reusedKeys.has('duration') && params.duration !== undefined && !capability.durations.includes(params.duration as never)) delete params.duration
    if (reusedKeys.has('resolution') && params.resolution && !capability.resolutions.includes(params.resolution as never)) delete params.resolution
    if (reusedKeys.has('aspect_ratio') && params.aspect_ratio && !capability.aspectRatios.includes(params.aspect_ratio as never)) delete params.aspect_ratio
    if (reusedKeys.has('generate_audio') && capability.audioMode === 'required' && params.generate_audio === false) delete params.generate_audio
    const requiredAspectRatio = capability.requiredAspectRatioByInputMode?.[videoInputMode(params)]
    if (reusedKeys.has('aspect_ratio') && requiredAspectRatio && params.aspect_ratio !== requiredAspectRatio) delete params.aspect_ratio
  }
}

function trimOptionalString(params: AnyRecord, key: string): void {
  if (params[key] === undefined) return
  if (typeof params[key] !== 'string') throw new Error(`${key} must be a string.`)
  const value = params[key].trim()
  if (value) params[key] = value
  else delete params[key]
}

function normalizeWizardKnown(intent: MediaIntent, known: unknown, _exec: AnyRecord): AnyRecord {
  if (known !== undefined && (known === null || typeof known !== 'object' || Array.isArray(known))) {
    throw new Error('known must be an object.')
  }
  const params: AnyRecord = { ...((known as AnyRecord | undefined) ?? {}) }
  delete params.modelExplicit
  for (const key of ['prompt', 'originalPrompt', 'promptSource', 'model', 'image', 'aspect_ratio', 'resolution', 'image_url', 'start_image', 'end_image']) {
    trimOptionalString(params, key)
  }
  if (params.promptSource !== undefined && !['user', 'inferred', 'wizard', 'reused'].includes(params.promptSource)) {
    throw new Error('promptSource must be user, inferred, wizard, or reused.')
  }
  for (const key of ['enhanced', 'useDefaultModel', 'skipFinalConfirmation', 'generate_audio']) {
    if (params[key] !== undefined && typeof params[key] !== 'boolean') throw new Error(`${key} must be a boolean.`)
  }
  for (const key of ['n', 'duration']) {
    if (params[key] !== undefined && (!Number.isInteger(params[key]) || params[key] <= 0)) throw new Error(`${key} must be a positive integer.`)
  }
  if (params.reference_images !== undefined) {
    if (!Array.isArray(params.reference_images) || params.reference_images.some((value: unknown) => typeof value !== 'string' || !value.trim())) {
      throw new Error('reference_images must be an array of non-empty strings.')
    }
    params.reference_images = params.reference_images.map((value: string) => value.trim())
  }
  if (params.model && params.useDefaultModel === true) throw new Error('model and useDefaultModel cannot both be set.')
  return params
}

function validateWizardKnown(intent: MediaIntent, params: AnyRecord, config: MediaConfig): void {
  const supportedModels = supportedModelsForIntent(intent)
  if (params.model && !supportedModels.includes(params.model)) {
    throw new Error(`Model ${params.model} is not supported for ${intent}. Choose one of: ${supportedModels.join(', ')}.`)
  }
  if (intent !== 'video_gen') {
    const ratios: readonly string[] = intent === 'image_gen' ? IMAGE_ASPECT_RATIOS : ASPECT_RATIOS
    if (params.aspect_ratio && !ratios.includes(params.aspect_ratio)) {
      throw new Error(`Aspect ratio ${params.aspect_ratio} is not supported for ${intent}. Choose one of: ${ratios.join(', ')}.`)
    }
  }
  if ((intent === 'image_gen' || intent === 'image_edit') && params.n !== undefined && ![1, 2, 4].includes(params.n)) {
    throw new Error('Image count n must be 1, 2, or 4.')
  }
  if (intent === 'video_gen') {
    const model = resolveEffectiveVideoModel(params, config)
    const capability = videoModelCapability(model)
    const inputMode = videoInputMode(params)
    if (params.aspect_ratio && !capability.aspectRatios.includes(params.aspect_ratio as never)) {
      throw new Error(`Aspect ratio ${params.aspect_ratio} is not supported by ${model}. Choose one of: ${capability.aspectRatios.join(', ')}.`)
    }
    const requiredAspectRatio = capability.requiredAspectRatioByInputMode?.[inputMode]
    if (requiredAspectRatio && params.aspect_ratio && params.aspect_ratio !== requiredAspectRatio) {
      throw new Error(`${model} ${inputMode} requires aspect_ratio=${requiredAspectRatio}.`)
    }
    if (params.duration !== undefined && !capability.durations.includes(params.duration as never)) {
      throw new Error(`Duration ${params.duration} is not supported by ${model}. Choose one of: ${capability.durations.join(', ')}.`)
    }
    if (params.resolution && !capability.resolutions.includes(params.resolution as never)) {
      throw new Error(`Resolution ${params.resolution} is not supported by ${model}. Choose one of: ${capability.resolutions.join(', ')}.`)
    }
    if (capability.audioMode === 'required' && params.generate_audio === false) {
      throw new Error(`${model} requires generated audio to remain enabled.`)
    }
    if (capability.audioMode === 'not_configurable' && params.generate_audio !== undefined) {
      throw new Error(`${model} does not expose a configurable audio parameter.`)
    }
  }
}

function imageBlocks(images: GeneratedImage[], label: string, model: string, taskId: string): AnyRecord[] {
  const blocks: AnyRecord[] = []
  for (const image of images) {
    if (image.attachmentId && image.mediaType && image.bytes !== undefined && image.width !== undefined && image.height !== undefined) {
      blocks.push({
        type: 'image',
        attachment: {
          attachmentId: image.attachmentId,
          mediaType: image.mediaType,
          bytes: image.bytes,
          width: image.width,
          height: image.height,
          ...(image.name ? { name: image.name } : {}),
        },
      })
    }
  }
  const lines = [`${label} (${model}, task ${taskId})`]
  images.forEach((image, index) => {
    if (image.url) lines.push(`Image ${index + 1}: ${image.url}`)
    if (image.error) lines.push(`Image ${index + 1} attachment warning: ${image.error}`)
  })
  blocks.push({ type: 'text', text: lines.join('\n') })
  return blocks
}

function pendingTaskFields(data: AnyRecord): AnyRecord {
  return {
    timedOut: true,
    recoverable: true,
    status: typeof data.status === 'string' ? data.status : 'running',
    progress: typeof data.progress === 'number' ? data.progress : 0,
  }
}

function pendingTaskBlock(value: AnyRecord): AnyRecord | undefined {
  if (value.timedOut !== true) return undefined
  return {
    type: 'text',
    text: [
      `Task ${value.taskId} is still running (${value.progress ?? 0}%).`,
      'The task id has been retained. Use media_task_status to continue checking; do not submit the generation again.',
    ].join('\n'),
  }
}

function imageOutputSchema(): AnyRecord {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      taskId: { type: 'string', required: true },
      model: { type: 'string', required: true },
      timedOut: { type: 'boolean' },
      recoverable: { type: 'boolean' },
      status: { type: 'string' },
      progress: { type: 'integer' },
      images: {
        type: 'array',
        required: true,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            url: { type: 'string' },
            attachmentId: { type: 'string' },
            mediaType: { type: 'string' },
            bytes: { type: 'integer' },
            width: { type: 'integer' },
            height: { type: 'integer' },
            name: { type: 'string' },
            error: { type: 'string' },
          },
        },
      },
    },
  }
}

async function prepareInput(config: MediaConfig, api: TokensApiClient, input: unknown, exec: AnyRecord, attachments: AnyRecord): Promise<string> {
  const trimmed = String(input ?? 'dsh-attachment:latest').trim()
  if (trimmed.startsWith('dsh-attachment:')) {
    if (!exec.agent) throw new Error('Chat attachment input requires a session-scoped tool call.')
    if (!attachments?.readImage) throw new Error('DSH attachment storage is unavailable.')
    const selector = trimmed.slice('dsh-attachment:'.length).trim() || 'latest'
    const ref = resolveSessionImageRef(exec, selector)
    if (!ref) {
      const count = sessionUserImageRefs(exec).length
      throw new Error(selector === 'latest'
        ? 'No user-uploaded image was found in the current conversation.'
        : `Image selector ${selector} did not match the current conversation's ${count} user-uploaded image(s). Use latest, first, last, a 1-based number, index:N, or a current-conversation attachment id.`)
    }
    const stored = await attachments.readImage(ref, exec.signal)
    if (!stored?.data) throw new Error('DSH attachment storage returned no image bytes.')
    if (stored.data.byteLength > config.maxInputImageBytes) throw new Error(`Image input exceeds the ${config.maxInputImageBytes} byte limit.`)
    const mediaType = stored.ref?.mediaType ?? ref.mediaType
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mediaType)) {
      throw new Error(`Unsupported chat attachment image type: ${mediaType ?? 'unknown'}`)
    }
    const dataUrl = `data:${mediaType};base64,${Buffer.from(stored.data).toString('base64')}`
    return api.uploadImage(dataUrl, exec.signal)
  }
  if (!config.allowLocalImageInput && !/^https:\/\//i.test(trimmed)) {
    throw new Error('Local image input is disabled by plugin configuration.')
  }
  const resolved = await resolveImageInput(trimmed, config.maxInputImageBytes)
  if (resolved.source === 'remote') return resolved.value
  return api.uploadImage(resolved.value, exec.signal)
}

export function apply(ctx: AnyRecord, config: MediaConfig): void {
  const api = new TokensApiClient(ctx as any, config)
  registerDownloadRoute(ctx)
  registerVideoRoute(ctx, config)
  const attachments = ctx.get('attachments')
  const register = (spec: AnyRecord) => ctx.tools.register(defineTool(spec as any))

  ctx.systemPrompt.section({
    name: 'media-gen:wizard',
    order: 200,
    text: `Before calling media_wizard, infer the user's media intent and separate current-request parameters from reusable historical context. media_wizard is a missing-parameter completer and reuse-consent gate, not a fixed questionnaire.

Infer intent from the requested outcome; the user does not need to say "generate an image" or "edit an image". Put only values supplied by the current user request, its newly attached media, or an explicit reuse instruction into known. Do not silently copy a previous task's prompt, reference images, model, aspect ratio, count, duration, resolution, or audio choice into known. When the most recent completed task of the same intent contains potentially reusable values that the current request did not explicitly supply, put its intent and final params into previousTask instead. The wizard will ask for consent before merging them.

For image editing, when the current request itself contains one unambiguous target image, pass image: "dsh-attachment:latest" and use the current requested change as prompt. When the user refers to an ordered image, use dsh-attachment:1, dsh-attachment:2, first, last, index:N, or a current-conversation attachment id. If multiple images exist and the target or role is ambiguous, leave image absent. Never invent a local path or URL for a chat attachment.

Known-field contract: prompt is the current requested content or edit; promptSource is user or inferred when supplied before the wizard; enhanced is a boolean only when explicitly chosen; model is present only for an explicit supported model choice; useDefaultModel is true only after an explicit default-model choice; aspect_ratio, n, duration, resolution, generate_audio, image_url, start_image, end_image, and reference_images are supplied only when stated or unambiguously derived from the current request. Set skipFinalConfirmation only when explicitly requested.

Reuse contract: previousTask contains only the most recent completed same-intent task and its final params. reuse contains explicit per-category decisions only when the user already said whether to reuse prompt, references, or settings. Use true for explicit reuse and false for explicit reset. Leave a category absent when the request is ambiguous, such as "generate another video", so the wizard asks. Phrases such as "another identical one" can set all available categories true; "do not reuse anything" can set them false; "change the content but keep other settings" should set prompt false and settings true. Current known values always win over reused values.

The wizard must complete any remaining confirmation flow before media_generate_image, media_edit_image, or media_generate_video. If the user chooses the plugin default model, do not pass model to the final generation tool; only pass model after an explicit model choice. For video generation, pass the wizard's generate_audio value to media_generate_video when present.

Submission safety contract: a network error, HTTP 429, unchanged progress, or a timed-out foreground wait does not authorize another generation submission. If a generation result includes a taskId, timedOut, recoverable, or says the submission status is uncertain, do not call a media_generate_* tool again for that request. Continue with media_task_status when a taskId is known. The plugin reuses the same in-process idempotency operation for an uncertain identical request; never change parameters merely to force a retry.`,
  })

  register({
    name: 'media_wizard',
    description: 'Context-aware media task wizard. Pass current-request values in known, prior same-intent task values in previousTask, and explicit reuse decisions in reuse. Historical values are never merged without consent.',
    parameters: {
      intent: { type: 'string', enum: ['image_gen', 'image_edit', 'video_gen'], required: true },
      known: {
        type: 'object',
        additionalProperties: true,
        description: 'Parameters already supplied or unambiguously derived from the user request. Supported fields include prompt, promptSource, enhanced, model, useDefaultModel, skipFinalConfirmation, image, aspect_ratio, n, duration, resolution, generate_audio, image_url, start_image, end_image, and reference_images. Do not invent missing values.',
      },
      previousTask: {
        type: 'object',
        additionalProperties: false,
        description: 'Most recent completed task of the same media intent, supplied only as reusable context candidates.',
        properties: {
          intent: { type: 'string', enum: ['image_gen', 'image_edit', 'video_gen'], required: true },
          params: { type: 'object', additionalProperties: true, required: true },
        },
      },
      reuse: {
        type: 'object',
        additionalProperties: false,
        description: 'Explicit reuse decisions already stated by the user. Omit ambiguous categories so the wizard asks.',
        properties: {
          prompt: { type: 'boolean' },
          references: { type: 'boolean' },
          settings: { type: 'boolean' },
        },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          intent: { type: 'string', required: true },
          confirmed: { type: 'boolean', required: true },
          promptConfirmed: { type: 'boolean', required: true },
          modelChoiceConfirmed: { type: 'boolean', required: true },
          modelExplicit: { type: 'boolean', required: true },
          finalConfirmed: { type: 'boolean', required: true },
          needsImage: { type: 'boolean' },
          reuseDecisions: { type: 'object', additionalProperties: true },
          params: { type: 'object', additionalProperties: true, required: true },
        },
      },
      render: (_args: unknown, value: AnyRecord) => [{
        type: 'text',
        text: [
          value.confirmed ? `Wizard complete (${value.intent})` : `Wizard cancelled (${value.intent})`,
          `Prompt confirmed: ${value.promptConfirmed ? 'yes' : 'no'}`,
          `Model choice confirmed: ${value.modelChoiceConfirmed ? 'yes' : 'no'}`,
          `Model strategy: ${value.modelExplicit ? 'explicit model' : 'plugin default'}`,
          `Final confirmation: ${value.finalConfirmed ? 'yes' : 'no'}`,
          `Reuse decisions: ${JSON.stringify(value.reuseDecisions ?? {})}`,
          `Parameters:\n${JSON.stringify(value.params, null, 2)}`,
        ].join('\n'),
      }],
    },
    async execute(args: AnyRecord, exec: AnyRecord) {
      const intent = args.intent as MediaIntent
      const params = normalizeWizardKnown(intent, args.known, exec)
      validateWizardKnown(intent, params, config)
      const contextCandidates = normalizeContextCandidates(intent, args.previousTask)
      const reuseDecisions = normalizeReuseDecisions(args.reuse)
      const reusablePrompt = missingReusableValues(params, contextCandidates, ['prompt'])
      const reusableReferences = missingReusableValues(params, contextCandidates, REFERENCE_REUSE_KEYS[intent])
      const reusableSettings = missingReusableValues(params, contextCandidates, SETTINGS_REUSE_KEYS[intent])
      const reuseQuestions: AnyRecord[] = []
      if (Object.keys(reusablePrompt).length && reuseDecisions.prompt === undefined) {
        reuseQuestions.push({
          id: 'reuse_prompt', header: '历史 Prompt', question: '是否复用上一次任务的 Prompt？',
          detail: `上次 Prompt：${truncatedPrompt(reusablePrompt.prompt)}`,
          options: [{ label: '不复用', description: '按本次新任务重新填写 Prompt' }, { label: '复用', description: '沿用上一次任务的 Prompt' }],
        })
      }
      if (Object.keys(reusableReferences).length && reuseDecisions.references === undefined) {
        reuseQuestions.push({
          id: 'reuse_references', header: '历史参考素材', question: '是否复用上一次任务的参考图或首尾帧？',
          detail: reusableReferenceDetail(intent, reusableReferences),
          options: [{ label: '不复用', description: '本次不使用历史参考素材' }, { label: '复用', description: '沿用上一次任务的参考素材' }],
        })
      }
      if (Object.keys(reusableSettings).length && reuseDecisions.settings === undefined) {
        reuseQuestions.push({
          id: 'reuse_settings', header: '历史生成参数', question: '是否复用上一次任务的生成参数？',
          detail: reusableSettingsDetail(reusableSettings),
          options: [{ label: '不复用', description: '重新选择模型和输出参数' }, { label: '复用', description: '沿用可兼容的模型和输出参数' }],
        })
      }
      if (reuseQuestions.length) {
        const answers = await ask(ctx, exec, reuseQuestions)
        if (answers.reuse_prompt) reuseDecisions.prompt = stripRecommended(selected(answers.reuse_prompt)) === '复用'
        if (answers.reuse_references) reuseDecisions.references = stripRecommended(selected(answers.reuse_references)) === '复用'
        if (answers.reuse_settings) reuseDecisions.settings = stripRecommended(selected(answers.reuse_settings)) === '复用'
      }
      if (reuseDecisions.prompt === true) {
        mergeReusableValues(params, reusablePrompt)
        if (reusablePrompt.prompt && !params.promptSource) params.promptSource = 'reused'
      }
      if (reuseDecisions.references === true) mergeReusableValues(params, reusableReferences)
      const reusedSettingKeys = new Set<string>()
      if (reuseDecisions.settings === true) {
        mergeReusableValues(params, reusableSettings)
        for (const key of Object.keys(reusableSettings)) reusedSettingKeys.add(key)
        pruneIncompatibleReusedSettings(intent, params, reusedSettingKeys, config)
      }
      validateWizardKnown(intent, params, config)
      const promptProvidedBeforeWizard = Boolean(params.prompt)
      if (promptProvidedBeforeWizard && !params.promptSource) params.promptSource = 'user'
      let needsImage = false
      let promptConfirmed = false
      let modelChoiceConfirmed = false
      let modelExplicit = false
      let finalConfirmed = false
      const result = () => ({ intent, confirmed: promptConfirmed && modelChoiceConfirmed && finalConfirmed, promptConfirmed, modelChoiceConfirmed, modelExplicit, finalConfirmed, needsImage, reuseDecisions, params })
      try {
        if (intent === 'image_edit' && !params.image) {
          const imageCount = sessionUserImageRefs(exec).length
          const answers = await ask(ctx, exec, [{
            id: 'image', header: '参考图',
            question: imageCount > 0
              ? `历史图片不会自动复用。请明确输入 dsh-attachment:1 至 dsh-attachment:${imageCount}，或提供 HTTPS URL / 本地图片路径`
              : '当前对话中没有用户上传的图片。请输入 HTTPS URL / 本地图片路径',
          }])
          params.image = selected(answers.image)
          if (!params.image) { needsImage = true; return result() }
        }
        if (intent === 'video_gen') {
          const hasInput = params.image_url || params.start_image || params.end_image || (Array.isArray(params.reference_images) && params.reference_images.length)
          if (!hasInput && !params.prompt) {
            const answers = await ask(ctx, exec, [{ id: 'video_input', header: '视频类型', question: '选择视频生成方式', options: [{ label: '纯文生视频' }, { label: '使用首帧图片' }, { label: '使用首帧和尾帧图片' }] }])
            const choice = stripRecommended(selected(answers.video_input))
            if (!choice) return result()
            if (choice === '使用首帧图片') {
              const imageAnswers = await ask(ctx, exec, [{ id: 'start_image', header: '首帧图片', question: '请选择已附加的首帧图片，或输入 dsh-attachment 选择器 / HTTPS URL / 本地图片路径' }])
              params.start_image = selected(imageAnswers.start_image)
              if (!params.start_image) { needsImage = true; return result() }
            }
            if (choice === '使用首帧和尾帧图片') {
              const imageAnswers = await ask(ctx, exec, [
                { id: 'start_image', header: '首帧图片', question: '请选择首帧图片，或输入 dsh-attachment 选择器 / HTTPS URL / 本地图片路径' },
                { id: 'end_image', header: '尾帧图片', question: '请选择尾帧图片，或输入 dsh-attachment 选择器 / HTTPS URL / 本地图片路径' },
              ])
              params.start_image = selected(imageAnswers.start_image)
              params.end_image = selected(imageAnswers.end_image)
              if (!params.start_image || !params.end_image) { needsImage = true; return result() }
            }
          }
        }
        if (!params.prompt) {
          const answers = await ask(ctx, exec, [{ id: 'prompt', header: '原始 Prompt', question: intent === 'image_edit' ? '请描述你想怎么修改图片' : intent === 'video_gen' ? '请描述你想生成的视频' : '请描述你想生成的图片' }])
          params.prompt = selected(answers.prompt)
          if (!params.prompt) return result()
          params.prompt = String(params.prompt).trim()
          params.promptSource = 'wizard'
        }
        if (params.enhanced === true && !config.enhanceEnabled) throw new Error('Prompt enhancement was requested, but enhancement is disabled by plugin configuration.')
        if (params.enhanced === true && !params.originalPrompt) {
          const original = params.prompt
          const enhanced = await api.enhance(intent, original, exec.signal)
          params.originalPrompt = original
          params.prompt = enhanced
          params.enhanced = enhanced !== original
        }
        if (params.enhanced === undefined) {
          const enhanceOptions = config.enhanceEnabled
            ? [{ label: '增强 Prompt', description: '优化视觉、镜头和质量细节' }, { label: '保持原始 Prompt', description: '不修改内容描述' }]
            : [{ label: '保持原始 Prompt', description: '当前未启用提示词增强服务' }]
          const answers = await ask(ctx, exec, [{
            id: 'enhance',
            header: 'Prompt 增强',
            question: '是否增强下面的 Prompt？',
            detail: `当前 Prompt\n来源：${promptSourceDescription(params.promptSource)}\n\n${params.prompt}`,
            options: enhanceOptions,
          }])
          const choice = stripRecommended(selected(answers.enhance))
          if (!choice) return result()
          if (choice === '增强 Prompt') {
            const original = params.prompt
            const enhanced = await api.enhance(intent, original, exec.signal)
            params.originalPrompt = original
            params.prompt = enhanced
            params.enhanced = enhanced !== original
          } else params.enhanced = false
        }
        const promptWasEnhanced = Boolean(params.originalPrompt && params.prompt !== params.originalPrompt)
        if (promptWasEnhanced) {
          const promptAnswers = await ask(ctx, exec, [{ id: 'prompt_confirm', header: '确认增强后 Prompt', question: 'Prompt 已被增强，是否使用增强后的内容？', detail: `原始 Prompt:\n${params.originalPrompt}\n\n增强后 Prompt:\n${params.prompt}`, options: [{ label: '确认增强后 Prompt' }, { label: '取消' }] }])
          promptConfirmed = stripRecommended(selected(promptAnswers.prompt_confirm)) === '确认增强后 Prompt'
        } else promptConfirmed = Boolean(params.prompt)
        if (!promptConfirmed) return result()
        const selectableModels = supportedModelsForIntent(intent)
        const defaultModel = defaultModelForIntent(intent, config)
        if (params.model) {
          modelChoiceConfirmed = true; modelExplicit = true; delete params.useDefaultModel
        } else if (params.useDefaultModel === true) {
          modelChoiceConfirmed = true; modelExplicit = false; delete params.model
        } else {
          const defaultModelLabel = `${defaultModel}（推荐）`
          const modelOptions = selectableModels.map((model) => ({
            label: model === defaultModel ? defaultModelLabel : model,
            ...(intent === 'video_gen'
              ? { description: `${model === defaultModel ? '使用插件当前配置的默认模型；' : ''}${videoModelDescription(model as VideoModel)}` }
              : model === defaultModel ? { description: '使用插件当前配置的默认模型' } : {}),
          }))
          const modelAnswers = await ask(ctx, exec, [{ id: 'model', header: '模型', question: '选择模型', options: modelOptions }])
          const rawModelChoice = selected(modelAnswers.model)
          if (!rawModelChoice) return result()
          const usesPluginDefault = rawModelChoice === defaultModelLabel
          modelChoiceConfirmed = true
          if (usesPluginDefault) { params.useDefaultModel = true; delete params.model; modelExplicit = false }
          else { params.model = stripRecommended(rawModelChoice); delete params.useDefaultModel; modelExplicit = true }
        }
        const effectiveVideoModel = intent === 'video_gen' ? resolveEffectiveVideoModel(params, config) : undefined
        const videoCapability = effectiveVideoModel ? videoModelCapability(effectiveVideoModel) : undefined
        const selectedVideoInputMode = intent === 'video_gen' ? videoInputMode(params) : undefined
        if (videoCapability && selectedVideoInputMode) {
          const requiredAspectRatio = videoCapability.requiredAspectRatioByInputMode?.[selectedVideoInputMode]
          if (requiredAspectRatio && !params.aspect_ratio) params.aspect_ratio = requiredAspectRatio
          if (videoCapability.audioMode === 'required' && params.generate_audio === undefined) params.generate_audio = true
        }
        const outputQuestions: AnyRecord[] = []
        if (intent === 'image_gen' && !params.aspect_ratio) outputQuestions.push({ id: 'aspect_ratio', header: '画面比例', question: '选择画面比例', options: IMAGE_ASPECT_RATIOS.map((ratio) => ({ label: ratio })) })
        if (intent === 'image_edit' && !params.aspect_ratio) outputQuestions.push({ id: 'aspect_ratio', header: '画面比例', question: '选择画面比例', options: ASPECT_RATIOS.map((ratio) => ({ label: ratio })) })
        if (intent === 'video_gen' && videoCapability && selectedVideoInputMode && !params.aspect_ratio) outputQuestions.push({ id: 'aspect_ratio', header: '画面比例', question: '选择画面比例', options: videoCapability.aspectRatios.map((ratio) => {
          const label = videoAspectRatioLabel(ratio, selectedVideoInputMode)
          return { label }
        }) })
        if (intent === 'video_gen' && videoCapability && !params.duration) outputQuestions.push({ id: 'duration', header: '时长', question: '选择视频时长', options: videoCapability.durations.map((duration) => ({ label: `${duration} 秒` })) })
        if (intent === 'video_gen' && videoCapability && videoCapability.resolutions.length > 1 && !params.resolution) outputQuestions.push({ id: 'resolution', header: '分辨率', question: '选择视频分辨率', options: videoCapability.resolutions.map((resolution) => ({ label: resolution })) })
        if (intent === 'video_gen' && videoCapability?.audioMode === 'optional' && params.generate_audio === undefined) outputQuestions.push({ id: 'generate_audio', header: '生成音频', question: '是否生成视频音频？', options: [{ label: '开启音频', description: '视频将包含模型生成的音频' }, { label: '关闭音频', description: '生成无音频视频' }] })
        if ((intent === 'image_gen' || intent === 'image_edit') && !params.n) outputQuestions.push({ id: 'n', header: '数量', question: '生成几张？', options: [{ label: '1 张' }, { label: '2 张' }, { label: '4 张' }] })
        if (outputQuestions.length) {
          const answers = await ask(ctx, exec, outputQuestions)
          if (answers.aspect_ratio) params.aspect_ratio = intent === 'video_gen'
            ? parseVideoAspectRatioLabel(selected(answers.aspect_ratio))
            : stripRecommended(selected(answers.aspect_ratio))
          if (answers.duration) params.duration = numberLabel(selected(answers.duration))
          if (answers.resolution) params.resolution = stripRecommended(selected(answers.resolution))
          if (answers.generate_audio) params.generate_audio = stripRecommended(selected(answers.generate_audio)) === '开启音频'
          if (answers.n) params.n = numberLabel(selected(answers.n))
        }
        validateWizardKnown(intent, params, config)
        const videoParametersPresent = videoCapability
          ? Boolean(params.duration)
            && (videoCapability.resolutions.length === 1 || Boolean(params.resolution))
            && (videoCapability.audioMode !== 'optional' || typeof params.generate_audio === 'boolean')
          : false
        const requiredParametersPresent = Boolean(params.aspect_ratio) && (intent === 'video_gen' ? videoParametersPresent : Boolean(params.n))
        if (!requiredParametersPresent) return result()
        const taskLabel = intent === 'image_edit' ? '图片编辑' : intent === 'video_gen' ? '视频生成' : '图片生成'
        const inputLines = intent === 'image_edit'
          ? [`- 参考图: ${describeImageInput(params.image)}`]
          : intent === 'video_gen'
            ? [
                ...(params.start_image || params.image_url ? [`- 首帧图片: ${describeImageInput(params.start_image ?? params.image_url)}`] : []),
                ...(params.end_image ? [`- 尾帧图片: ${describeImageInput(params.end_image)}`] : []),
                ...(Array.isArray(params.reference_images) && params.reference_images.length ? [`- 参考图片: ${params.reference_images.map(describeImageInput).join(', ')}`] : []),
              ]
            : []
        const parameterLines = [
          `- 任务: ${taskLabel}`, ...inputLines, `- 内容: ${params.prompt}`,
          `- Prompt 来源: ${params.promptSource ?? (promptProvidedBeforeWizard ? 'user' : 'wizard')}`,
          `- Prompt 增强: ${promptWasEnhanced ? '已增强' : '未增强'}`,
          `- 模型: ${params.model ?? defaultModel}`,
          `- 画面比例: ${intent === 'video_gen' && selectedVideoInputMode ? videoAspectRatioLabel(params.aspect_ratio, selectedVideoInputMode) : params.aspect_ratio}`,
          ...(params.duration ? [`- 时长: ${params.duration} 秒`] : []),
          ...(intent === 'video_gen' && videoCapability ? [`- 分辨率: ${params.resolution ?? videoCapability.defaultResolution}`] : []),
          ...(intent === 'video_gen' && effectiveVideoModel ? [`- 音频: ${videoAudioDescription(effectiveVideoModel, params.generate_audio)}`] : []),
          ...(params.n ? [`- 数量: ${params.n} 张`] : []),
        ]
        if (params.skipFinalConfirmation === true) finalConfirmed = true
        else {
          const finalAnswers = await ask(ctx, exec, [{ id: 'final_confirm', header: '最终确认', question: '按以下完整配置创建任务吗？', detail: parameterLines.join('\n'), options: [{ label: '确认生成' }, { label: '取消' }] }])
          finalConfirmed = stripRecommended(selected(finalAnswers.final_confirm)) === '确认生成'
        }
        return result()
      } catch (error: any) {
        if (error?.code === 'ASK_CANCELLED') return result()
        throw error
      }
    }
  })

  register({
    name: 'media_generate_image',
    description: 'Generate one or more images with TokensAPI and return DSH image attachments plus remote fallback URLs.',
    parameters: {
      prompt: { type: 'string', required: true },
      model: { type: 'string', enum: [...IMAGE_MODELS] },
      aspect_ratio: { type: 'string', enum: [...IMAGE_ASPECT_RATIOS] },
      n: { type: 'integer' },
    },
    output: {
      schema: imageOutputSchema(),
      render: (_args: unknown, value: AnyRecord) => {
        const blocks = imageBlocks(value.images, 'Generated images', value.model, value.taskId)
        const pending = pendingTaskBlock(value)
        if (pending) blocks.push(pending)
        return blocks
      },
    },
    async execute(args: AnyRecord, exec: AnyRecord) {
      const model = args.model ?? config.defaultImageModel
      const body = { model, prompt: args.prompt, aspect_ratio: args.aspect_ratio ?? '1:1', n: args.n ?? 1 }
      const taskId = await api.submit('images', body, exec.signal, body)
      const data = await api.poll(taskId, exec.signal)
      const timedOut = data.timedOut === true
      const images = timedOut ? [] : await saveImages(api.urls(data), taskId, attachments, exec.signal)
      if (!timedOut && images.length > 0) exec.concludeTurn()
      return { taskId, model, images, ...(timedOut ? pendingTaskFields(data) : {}) }
    },
  })

  register({
    name: 'media_edit_image',
    description: 'Edit an image with TokensAPI. Omit image to use the latest user-uploaded image in the current conversation; HTTPS URLs and local/data images are also supported.',
    parameters: {
      prompt: { type: 'string', required: true },
      image: { type: 'string', description: 'Optional image source: dsh-attachment:latest, first, last, a 1-based selector such as dsh-attachment:2, index:N, a current-conversation attachment id, HTTPS URL, local path, or data URL. Defaults to the latest user-uploaded conversation image.' },
      model: { type: 'string', enum: [...IMAGE_EDIT_MODELS] },
      aspect_ratio: { type: 'string', enum: [...ASPECT_RATIOS] },
      n: { type: 'integer' },
    },
    output: {
      schema: imageOutputSchema(),
      render: (_args: unknown, value: AnyRecord) => imageBlocks(value.images, 'Edited images', value.model, value.taskId),
    },
    async execute(args: AnyRecord, exec: AnyRecord) {
      const model = args.model ?? config.defaultEditModel
      if (!(IMAGE_EDIT_MODELS as readonly string[]).includes(model)) {
        throw new Error(`Model ${model} does not support image editing. Choose image2 or qwen_image.`)
      }
      const image = await prepareInput(config, api, args.image, exec, attachments)
      const body = {
        model,
        prompt: args.prompt,
        n: args.n ?? 1,
        ...(args.aspect_ratio ? { aspect_ratio: args.aspect_ratio } : {}),
        input_references: [{ type: 'image_url', slot_name: 'reference_1', image_url: { url: image } }],
      }
      const deduplicationInput = { ...args, model, image: args.image ?? 'dsh-attachment:latest' }
      const taskId = await api.submit('images', body, exec.signal, deduplicationInput)
      const data = await api.poll(taskId, exec.signal)
      const timedOut = data.timedOut === true
      const images = timedOut ? [] : await saveImages(api.urls(data), taskId, attachments, exec.signal)
      if (!timedOut && images.length > 0) exec.concludeTurn()
      return { taskId, model, images, ...(timedOut ? pendingTaskFields(data) : {}) }
    },
  })

  const videoSchema = {
    type: 'object', additionalProperties: false,
    properties: {
      taskId: { type: 'string', required: true },
      model: { type: 'string', required: true },
      url: { type: 'string' },
      filePath: { type: 'string' },
      durationSeconds: { type: 'number' },
      width: { type: 'integer' },
      height: { type: 'integer' },
      fps: { type: 'integer' },
      generateAudio: { type: 'boolean' },
      timedOut: { type: 'boolean' },
      recoverable: { type: 'boolean' },
      status: { type: 'string' },
      progress: { type: 'integer' },
      error: { type: 'string' },
    },
  }

  const renderVideo = (_args: unknown, value: AnyRecord) => {
    const blocks: AnyRecord[] = []
    if (value.url) blocks.push({ type: 'video', url: value.url })
    const lines = [
      `Generated video (${value.model}, task ${value.taskId})`,
      ...(value.filePath ? [`Saved to: ${value.filePath}`] : []),
      ...(value.url ? [`URL: ${value.url}`] : []),
      ...(typeof value.generateAudio === 'boolean' ? [`Audio: ${value.generateAudio ? 'enabled' : 'disabled'}`] : []),
      ...(value.error ? [`Local save warning: ${value.error}`] : []),
      ...(value.timedOut ? [`Task is still running (${value.progress ?? 0}%). Use media_task_status with this task id; do not submit the generation again.`] : []),
    ]
    blocks.push({ type: 'text', text: lines.join('\n') })
    return blocks
  }

  register({
    name: 'media_generate_video',
    description: 'Generate a short TokensAPI video with model-aware duration, resolution, aspect-ratio, frame-image, and audio validation. Image inputs accept dsh-attachment selectors, HTTPS URLs, local paths, and data URLs.',
    parameters: {
      prompt: { type: 'string', required: true },
      model: { type: 'string', enum: [...VIDEO_MODELS] },
      duration: { type: 'integer', enum: [...DURATIONS] },
      resolution: { type: 'string', enum: [...SEEDANCE_RESOLUTIONS] },
      aspect_ratio: { type: 'string', enum: [...VIDEO_ASPECT_RATIOS] },
      generate_audio: { type: 'boolean', description: 'Seedance audio switch. LTX 2.3, LTX 2.5, and MiniMax H3 audio remains enabled.' },
      image_url: { type: 'string', description: 'Legacy first-frame input; supports dsh-attachment selectors, HTTPS URL, local path, or data URL.' },
      reference_images: { type: 'array', items: { type: 'string' }, description: 'Reference image inputs support dsh-attachment selectors, although the current production video contract may reject generic references.' },
      start_image: { type: 'string', description: 'First-frame input; supports dsh-attachment selectors, HTTPS URL, local path, or data URL.' },
      end_image: { type: 'string', description: 'Last-frame input; supports dsh-attachment selectors, HTTPS URL, local path, or data URL.' },
    },
    output: { schema: videoSchema, render: renderVideo },
    async execute(args: AnyRecord, exec: AnyRecord) {
      const model = args.model ?? config.defaultVideoModel
      const capability = videoModelCapability(model)
      const firstInput = args.start_image ?? args.image_url
      if (args.end_image && !firstInput) throw new Error('end_image requires start_image or image_url')
      if (Array.isArray(args.reference_images) && args.reference_images.length > 0) {
        throw new Error('Version 0.3.3 supports first/last frame_images, not generic reference_images.')
      }
      const inputMode = videoInputMode({ ...args, ...(firstInput ? { start_image: firstInput } : {}) })
      if (!capability.inputModes.includes(inputMode)) throw new Error(`${model} does not support video input mode ${inputMode}.`)
      const requiredAspectRatio = capability.requiredAspectRatioByInputMode?.[inputMode]
      const aspectRatio = args.aspect_ratio ?? requiredAspectRatio
      if (capability.audioMode === 'required' && args.generate_audio === false) {
        throw new Error(`${model} requires generated audio to remain enabled.`)
      }
      const generateAudio = capability.audioMode === 'required'
        ? true
        : args.generate_audio ?? capability.defaultAudioEnabled
      validateWizardKnown('video_gen', {
        ...args,
        model,
        ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
        generate_audio: generateAudio,
      }, config)
      const startImage = typeof firstInput === 'string' ? await prepareInput(config, api, firstInput, exec, attachments) : undefined
      const endImage = typeof args.end_image === 'string' ? await prepareInput(config, api, args.end_image, exec, attachments) : undefined
      const frameImages = [
        ...(startImage ? [{ type: 'image_url', frame_type: 'first_frame', image_url: { url: startImage } }] : []),
        ...(endImage ? [{ type: 'image_url', frame_type: 'last_frame', image_url: { url: endImage } }] : []),
      ]
      const body = {
        model,
        prompt: args.prompt,
        n: 1,
        ...(args.duration ? { duration: args.duration } : {}),
        ...(args.resolution ? { resolution: args.resolution } : {}),
        ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
        ...(capability.generateAudioParameter === 'required_true' ? { generate_audio: true } : {}),
        ...(capability.generateAudioParameter === 'optional' ? { generate_audio: generateAudio } : {}),
        ...(frameImages.length ? { frame_images: frameImages } : {}),
      }
      const deduplicationInput = {
        ...args,
        model,
        ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
        generate_audio: generateAudio,
        ...(firstInput ? { start_image: firstInput } : {}),
      }
      const taskId = await api.submit('videos', body, exec.signal, deduplicationInput)
      const data = await api.poll(taskId, exec.signal)
      if (data.timedOut === true) return { taskId, model, generateAudio, ...pendingTaskFields(data) }
      const url = api.urls(data)[0]
      const saved = await saveVideo(url, taskId, config, exec.signal)
      const media = data.media && typeof data.media === 'object' ? data.media as AnyRecord : {}
      if (url) exec.concludeTurn()
      return {
        taskId,
        model,
        generateAudio,
        ...saved,
        ...(typeof media.duration_seconds === 'number' ? { durationSeconds: media.duration_seconds } : {}),
        ...(typeof media.width === 'number' ? { width: media.width } : {}),
        ...(typeof media.height === 'number' ? { height: media.height } : {}),
        ...(typeof media.fps === 'number' ? { fps: media.fps } : {}),
      }
    },
  })

  register({
    name: 'media_list_models',
    description: 'List media models supported by this plugin.',
    parameters: {},
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          images: { type: 'array', items: { type: 'string' }, required: true },
          videos: { type: 'array', items: { type: 'string' }, required: true },
        },
      },
      render: (_args: unknown, value: AnyRecord) => [{ type: 'text', text: `Image models: ${value.images.join(', ')}\nVideo models: ${value.videos.join(', ')}` }],
    },
    async execute() { return { images: [...IMAGE_MODELS], videos: [...VIDEO_MODELS] } },
  })

  register({
    name: 'media_task_status',
    description: 'Check and recover a TokensAPI media task. Completed images are saved as DSH attachments; completed videos remain available by remote URL and explicit download.',
    parameters: {
      task_id: { type: 'string', required: true },
      kind: { type: 'string', enum: ['auto', 'images', 'videos'] },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: true,
        properties: {
          taskId: { type: 'string', required: true },
          status: { type: 'string', required: true },
          progress: { type: 'integer' },
          kind: { type: 'string' },
          images: { type: 'array', items: imageOutputSchema().properties.images.items },
          url: { type: 'string' },
          filePath: { type: 'string' },
          error: { type: 'string' },
        },
      },
      render: (_args: unknown, value: AnyRecord) => {
        if (Array.isArray(value.images) && value.images.length) return imageBlocks(value.images, 'Recovered images', 'task result', value.taskId)
        const blocks: AnyRecord[] = []
        if (value.url) blocks.push({ type: 'video', url: value.url })
        blocks.push({ type: 'text', text: [
          `Task ${value.taskId}: ${value.status} (progress ${value.progress ?? 0}%)`,
          ...(value.filePath ? [`Saved to: ${value.filePath}`] : []),
          ...(value.url ? [`URL: ${value.url}`] : []),
          ...(value.error ? [`Warning: ${value.error}`] : []),
        ].join('\n') })
        return blocks
      },
    },
    async execute(args: AnyRecord, exec: AnyRecord) {
      const data = await api.status(args.task_id, exec.signal)
      const status = typeof data.status === 'string' ? data.status : 'unknown'
      const progress = typeof data.progress === 'number' ? data.progress : 0
      if (status !== 'succeeded') return { taskId: args.task_id, status, progress }
      const urls = api.urls(data)
      const detectedKind = args.kind && args.kind !== 'auto'
        ? args.kind
        : data.media && typeof data.media === 'object' ? 'videos' : urls.some((url) => /\.(?:mp4|webm)(?:\?|$)/i.test(url)) ? 'videos' : 'images'
      if (detectedKind === 'videos') {
        const saved = await saveVideo(urls[0], args.task_id, config, exec.signal)
        if (urls[0]) exec.concludeTurn()
        return { taskId: args.task_id, status, progress, kind: 'videos', ...saved }
      }
      const images = await saveImages(urls, args.task_id, attachments, exec.signal)
      if (images.length > 0) exec.concludeTurn()
      return { taskId: args.task_id, status, progress, kind: 'images', images }
    },
  })
}
