import Schema from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { homedir } from 'node:os'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import {
  ASPECT_RATIOS,
  DURATIONS,
  IMAGE_MODELS,
  IMAGE_EDIT_MODELS,
  IMAGE_ASPECT_RATIOS,
  SEEDANCE_RESOLUTIONS,
  VIDEO_MODELS,
  resolveImageInput,
} from '../shared/media.js'
import { saveImages, saveVideo } from './results.js'
import { TokensApiClient } from './tokensapi.js'
export { TokensApiClient } from './tokensapi.js'
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
  defaultVideoModel: Schema.union([...VIDEO_MODELS]).default('ltx_2_3'),
  enhanceEnabled: Schema.boolean().default(true),
  enhanceApiKeyEnv: Schema.string().role('credential-ref').default('TOKENSAPI_API_KEY'),
  enhanceBaseURL: Schema.string().default('https://tokensapi.ai/v1'),
  enhanceModel: Schema.string().default('deepseek-v4-flash'),
  enhanceMaxChars: Schema.number().default(4000),
  allowLocalImageInput: Schema.boolean().default(true),
  maxInputImageBytes: Schema.number().default(30 * 1024 * 1024),
  imageUploadURL: Schema.string().default('https://tokensapi.ai/api/aigc/presign'),
  uploadAuthMode: Schema.union(['account', 'api_key']).default('account'),
  accountAccessTokenEnv: Schema.string().role('credential-ref').default('TOKENSAPI_ACCOUNT_ACCESS_TOKEN'),
  accountUserId: Schema.string().default(''),
})

type AnyRecord = Record<string, any>

const VIDEO_ROUTE_PREFIX = '/media-gen/videos'

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

function imageOutputSchema(): AnyRecord {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      taskId: { type: 'string', required: true },
      model: { type: 'string', required: true },
      timedOut: { type: 'boolean' },
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

async function prepareInput(config: MediaConfig, api: TokensApiClient, input: string, signal?: AbortSignal): Promise<string> {
  const trimmed = String(input).trim()
  if (!config.allowLocalImageInput && !/^https:\/\//i.test(trimmed)) {
    throw new Error('Local image input is disabled by plugin configuration.')
  }
  const resolved = await resolveImageInput(trimmed, config.maxInputImageBytes)
  if (resolved.source === 'remote') return resolved.value
  return api.uploadImage(resolved.value, signal)
}

export function apply(ctx: AnyRecord, config: MediaConfig): void {
  const api = new TokensApiClient(ctx as any, config)
  registerVideoRoute(ctx, config)
  const attachments = ctx.get('attachments')
  const register = (spec: AnyRecord) => ctx.tools.register(defineTool(spec as any))

  ctx.systemPrompt.section({
    name: 'media-gen:wizard',
    order: 200,
    text: 'Before image generation, image editing, or video generation, call media_wizard and complete its ordered confirmation flow. The wizard must confirm the prompt, model strategy, output parameters, and final summary. If the user chooses the plugin default model, do not pass model to the generation tool; only pass model after an explicit model choice.',
  })

  register({
    name: 'media_wizard',
    description: 'Guided media generation wizard. Run before media_generate_image, media_edit_image, or media_generate_video.',
    parameters: {
      intent: { type: 'string', enum: ['image_gen', 'image_edit', 'video_gen'], required: true },
      known: { type: 'object', additionalProperties: true },
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
          `Parameters:\n${JSON.stringify(value.params, null, 2)}`,
        ].join('\n'),
      }],
    },
    async execute(args: AnyRecord, exec: AnyRecord) {
      const intent = args.intent as 'image_gen' | 'image_edit' | 'video_gen'
      const params: AnyRecord = { ...(args.known ?? {}) }
      delete params.modelExplicit
      let needsImage = false
      let promptConfirmed = false
      let modelChoiceConfirmed = false
      let modelExplicit = false
      let finalConfirmed = false
      const result = () => ({
        intent,
        confirmed: promptConfirmed && modelChoiceConfirmed && finalConfirmed,
        promptConfirmed,
        modelChoiceConfirmed,
        modelExplicit,
        finalConfirmed,
        needsImage,
        params,
      })
      try {
        if (intent === 'image_edit' && !params.image) {
          const answers = await ask(ctx, exec, [{
            id: 'image', header: '参考图', question: '请选择已附加的图片，或输入 HTTPS URL / 本地图片路径',
          }])
          params.image = selected(answers.image)
          if (!params.image) {
            needsImage = true
            return result()
          }
        }
        if (intent === 'video_gen') {
          const hasInput = params.image_url || params.start_image || params.end_image || (Array.isArray(params.reference_images) && params.reference_images.length)
          if (!hasInput) {
            const answers = await ask(ctx, exec, [{
              id: 'video_input', header: '视频类型', question: '选择视频生成方式',
              options: [{ label: '纯文生视频 (Recommended)' }, { label: '使用首帧图片' }, { label: '使用首帧和尾帧图片' }],
            }])
            const choice = stripRecommended(selected(answers.video_input))
            if (!choice) return result()
            if (choice === '使用首帧图片') {
              const imageAnswers = await ask(ctx, exec, [{ id: 'start_image', header: '首帧图片', question: '请选择已附加的首帧图片，或输入 HTTPS URL / 本地图片路径' }])
              params.start_image = selected(imageAnswers.start_image)
              if (!params.start_image) {
                needsImage = true
                return result()
              }
            }
            if (choice === '使用首帧和尾帧图片') {
              const imageAnswers = await ask(ctx, exec, [
                { id: 'start_image', header: '首帧图片', question: '请选择已附加的首帧图片，或输入 HTTPS URL / 本地图片路径' },
                { id: 'end_image', header: '尾帧图片', question: '请选择已附加的尾帧图片，或输入 HTTPS URL / 本地图片路径' },
              ])
              params.start_image = selected(imageAnswers.start_image)
              params.end_image = selected(imageAnswers.end_image)
              if (!params.start_image || !params.end_image) {
                needsImage = true
                return result()
              }
            }
          }
        }

        if (!params.prompt) {
          const answers = await ask(ctx, exec, [{
            id: 'prompt',
            header: '原始 Prompt',
            question: intent === 'image_edit' ? '请描述你想怎么修改图片' : intent === 'video_gen' ? '请描述你想生成的视频' : '请描述你想生成的图片',
          }])
          params.prompt = selected(answers.prompt)
          if (!params.prompt) return result()
        }

        if (params.enhanced === undefined) {
          const enhanceOptions = config.enhanceEnabled
            ? [
                { label: '增强 Prompt (Recommended)', description: '优化视觉、镜头和质量细节' },
                { label: '保持原始 Prompt', description: '不修改内容描述' },
              ]
            : [{ label: '保持原始 Prompt (Recommended)', description: '当前未启用提示词增强服务' }]
          const answers = await ask(ctx, exec, [{ id: 'enhance', header: 'Prompt 增强', question: '是否增强 Prompt？', options: enhanceOptions }])
          const choice = stripRecommended(selected(answers.enhance))
          if (!choice) return result()
          if (choice === '增强 Prompt') {
            const original = params.prompt
            const enhanced = await api.enhance(intent, original, exec.signal)
            params.originalPrompt = original
            params.prompt = enhanced
            params.enhanced = enhanced !== original
          } else {
            params.enhanced = false
          }
        }

        const promptAnswers = await ask(ctx, exec, [{
          id: 'prompt_confirm', header: '确认 Prompt', question: '是否使用这个最终 Prompt？', detail: String(params.prompt),
          options: [{ label: '确认 Prompt (Recommended)' }, { label: '取消' }],
        }])
        promptConfirmed = stripRecommended(selected(promptAnswers.prompt_confirm)) === '确认 Prompt'
        if (!promptConfirmed) return result()

        const selectableModels = intent === 'video_gen'
          ? VIDEO_MODELS
          : intent === 'image_edit'
            ? IMAGE_EDIT_MODELS
            : IMAGE_MODELS
        const defaultModel = intent === 'video_gen'
          ? config.defaultVideoModel
          : intent === 'image_edit'
            ? config.defaultEditModel
            : config.defaultImageModel
        const defaultModelLabel = `${defaultModel}（插件默认，推荐）`
        const modelOptions = [
          { label: defaultModelLabel, description: '使用插件当前配置的默认模型' },
          ...selectableModels.filter((model) => model !== defaultModel).map((model) => ({ label: model })),
        ]
        const modelAnswers = await ask(ctx, exec, [{ id: 'model', header: '模型', question: '选择模型', options: modelOptions }])
        const rawModelChoice = selected(modelAnswers.model)
        if (!rawModelChoice) return result()
        const usesPluginDefault = rawModelChoice === defaultModelLabel
        const modelChoice = usesPluginDefault ? defaultModel : stripRecommended(rawModelChoice)
        modelChoiceConfirmed = true
        if (usesPluginDefault) {
          delete params.model
          modelExplicit = false
        } else {
          params.model = modelChoice
          modelExplicit = true
        }

        const effectiveVideoModel = intent === 'video_gen' ? (params.model ?? config.defaultVideoModel) : undefined
        const outputQuestions: AnyRecord[] = []
        if (intent === 'image_gen' && !params.aspect_ratio) outputQuestions.push({
          id: 'aspect_ratio', header: '画面比例', question: '选择画面比例',
          options: IMAGE_ASPECT_RATIOS.map((ratio) => ({ label: ratio === '1:1' ? `${ratio} (Recommended)` : ratio })),
        })
        if ((intent === 'image_edit' || intent === 'video_gen') && !params.aspect_ratio) outputQuestions.push({
          id: 'aspect_ratio', header: '画面比例', question: '选择画面比例',
          options: ASPECT_RATIOS.map((ratio, index) => ({ label: index === 0 ? `${ratio} (Recommended)` : ratio })),
        })
        if (intent === 'video_gen' && !params.duration) outputQuestions.push({
          id: 'duration', header: '时长', question: '选择视频时长',
          options: effectiveVideoModel === 'seedance_2_0'
            ? [{ label: '5 秒 (Recommended)' }, { label: '8 秒' }, { label: '10 秒' }, { label: '15 秒' }]
            : [{ label: '5 秒 (Recommended)' }, { label: '3 秒' }, { label: '8 秒' }],
        })
        if (intent === 'video_gen' && effectiveVideoModel === 'seedance_2_0' && !params.resolution) outputQuestions.push({
          id: 'resolution', header: '分辨率', question: '选择视频分辨率',
          options: SEEDANCE_RESOLUTIONS.map((resolution) => ({ label: resolution === '720p' ? `${resolution} (Recommended)` : resolution })),
        })
        if ((intent === 'image_gen' || intent === 'image_edit') && !params.n) outputQuestions.push({
          id: 'n', header: '数量', question: '生成几张？',
          options: [{ label: '1 张 (Recommended)' }, { label: '2 张' }, { label: '4 张' }],
        })
        if (outputQuestions.length) {
          const answers = await ask(ctx, exec, outputQuestions)
          if (answers.aspect_ratio) params.aspect_ratio = stripRecommended(selected(answers.aspect_ratio))
          if (answers.duration) params.duration = numberLabel(selected(answers.duration))
          if (answers.resolution) params.resolution = stripRecommended(selected(answers.resolution))
          if (answers.n) params.n = numberLabel(selected(answers.n))
        }
        const requiredParametersPresent = Boolean(params.aspect_ratio)
          && (intent === 'video_gen'
            ? Boolean(params.duration) && (effectiveVideoModel !== 'seedance_2_0' || Boolean(params.resolution))
            : Boolean(params.n))
        if (!requiredParametersPresent) return result()

        const parameterLines = [
          `- 画面比例: ${params.aspect_ratio}`,
          ...(params.duration ? [`- 时长: ${params.duration} 秒`] : []),
          ...(intent === 'video_gen' ? [`- 分辨率: ${params.resolution ?? '模型工作流默认值'}`] : []),
          ...(params.n ? [`- 数量: ${params.n} 张`] : []),
          ...(needsImage ? ['- 图片输入: 需要提供'] : []),
        ]
        const finalLines = [
          `- 内容: ${params.prompt}`,
          `- 模型: ${params.model ?? `${defaultModel}（插件默认）`}`,
          ...parameterLines,
        ]
        const finalAnswers = await ask(ctx, exec, [{
          id: 'final_confirm', header: '最终确认', question: '按以下完整配置创建任务吗？', detail: finalLines.join('\n'),
          options: [{ label: '确认生成 (Recommended)' }, { label: '取消' }],
        }])
        finalConfirmed = stripRecommended(selected(finalAnswers.final_confirm)) === '确认生成'
        return result()
      } catch (error: any) {
        if (error?.code === 'ASK_CANCELLED') return result()
        throw error
      }
    },
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
      render: (_args: unknown, value: AnyRecord) => imageBlocks(value.images, 'Generated images', value.model, value.taskId),
    },
    async execute(args: AnyRecord, exec: AnyRecord) {
      const model = args.model ?? config.defaultImageModel
      const taskId = await api.submit('images', { model, prompt: args.prompt, aspect_ratio: args.aspect_ratio ?? '1:1', n: args.n ?? 1 }, exec.signal)
      const data = await api.poll(taskId, exec.signal)
      const timedOut = data.timedOut === true
      const images = timedOut ? [] : await saveImages(api.urls(data), taskId, attachments, exec.signal)
      return { taskId, model, images, ...(timedOut ? { timedOut: true } : {}) }
    },
  })

  register({
    name: 'media_edit_image',
    description: 'Edit an image with TokensAPI. HTTPS URLs and local/data images are supported; local images use TokensAPI first-party presigned upload without third-party hosting.',
    parameters: {
      prompt: { type: 'string', required: true },
      image: { type: 'string', required: true },
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
      const image = await prepareInput(config, api, args.image, exec.signal)
      const body = {
        model,
        prompt: args.prompt,
        n: args.n ?? 1,
        ...(args.aspect_ratio ? { aspect_ratio: args.aspect_ratio } : {}),
        input_references: [{ type: 'image_url', slot_name: 'reference_1', image_url: { url: image } }],
      }
      const taskId = await api.submit('images', body, exec.signal)
      const data = await api.poll(taskId, exec.signal)
      const timedOut = data.timedOut === true
      const images = timedOut ? [] : await saveImages(api.urls(data), taskId, attachments, exec.signal)
      return { taskId, model, images, ...(timedOut ? { timedOut: true } : {}) }
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
      timedOut: { type: 'boolean' },
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
      ...(value.error ? [`Local save warning: ${value.error}`] : []),
      ...(value.timedOut ? ['Task is still running. Use media_task_status with this task id.'] : []),
    ]
    blocks.push({ type: 'text', text: lines.join('\n') })
    return blocks
  }

  register({
    name: 'media_generate_video',
    description: 'Generate a short TokensAPI video. Supports text and first/last frame images. Local images use TokensAPI first-party presigned upload.',
    parameters: {
      prompt: { type: 'string', required: true },
      model: { type: 'string', enum: [...VIDEO_MODELS] },
      duration: { type: 'integer', enum: [...DURATIONS] },
      resolution: { type: 'string', enum: [...SEEDANCE_RESOLUTIONS] },
      aspect_ratio: { type: 'string', enum: [...ASPECT_RATIOS] },
      image_url: { type: 'string' },
      reference_images: { type: 'array', items: { type: 'string' } },
      start_image: { type: 'string' },
      end_image: { type: 'string' },
    },
    output: { schema: videoSchema, render: renderVideo },
    async execute(args: AnyRecord, exec: AnyRecord) {
      if (args.end_image && !args.start_image) throw new Error('end_image requires start_image')
      const model = args.model ?? config.defaultVideoModel
      if (args.resolution && model !== 'seedance_2_0') throw new Error('resolution is configurable only for seedance_2_0; ltx_2_3 uses its workflow default.')
      if (Array.isArray(args.reference_images) && args.reference_images.length > 0) {
        throw new Error('The current TokensAPI production video contract supports first/last frame_images, not generic reference_images.')
      }
      const firstInput = args.start_image ?? args.image_url
      const startImage = typeof firstInput === 'string' ? await prepareInput(config, api, firstInput, exec.signal) : undefined
      const endImage = typeof args.end_image === 'string' ? await prepareInput(config, api, args.end_image, exec.signal) : undefined
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
        ...(args.aspect_ratio ? { aspect_ratio: args.aspect_ratio } : {}),
        ...(frameImages.length ? { frame_images: frameImages } : {}),
      }
      const taskId = await api.submit('videos', body, exec.signal)
      const data = await api.poll(taskId, exec.signal)
      if (data.timedOut === true) return { taskId, model, timedOut: true }
      const url = api.urls(data)[0]
      const saved = await saveVideo(url, taskId, config, exec.signal)
      const media = data.media && typeof data.media === 'object' ? data.media as AnyRecord : {}
      return {
        taskId,
        model,
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
    description: 'Check and recover a TokensAPI media task. Completed images are saved as DSH attachments; completed videos are saved locally.',
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
        return { taskId: args.task_id, status, progress, kind: 'videos', ...saved }
      }
      const images = await saveImages(urls, args.task_id, attachments, exec.signal)
      return { taskId: args.task_id, status, progress, kind: 'images', images }
    },
  })
}
