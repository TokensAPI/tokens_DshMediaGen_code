import { test } from 'node:test'
import assert from 'node:assert/strict'

const config = {
  baseURL: 'https://tokensapi.ai/v1',
  apiKeyEnv: 'TOKENSAPI_API_KEY',
  outputDir: '/tmp/dsh-media-gen-test',
  pollIntervalMs: 5000,
  maxPollMs: 720000,
  defaultImageModel: 'z_image_turbo',
  defaultEditModel: 'qwen_image',
  defaultVideoModel: 'ltx_2_5',
  enhanceEnabled: true,
  enhanceApiKeyEnv: 'TOKENSAPI_API_KEY',
  enhanceBaseURL: 'https://tokensapi.ai/v1',
  enhanceModel: 'deepseek-v4-flash',
  enhanceMaxChars: 4000,
  allowLocalImageInput: true,
  maxInputImageBytes: 30 * 1024 * 1024,
  imageUploadURL: 'https://tokensapi.ai/api/aigc/presign',
  uploadAuthMode: 'account',
  accountAccessTokenEnv: 'TOKENSAPI_ACCOUNT_ACCESS_TOKEN',
  accountUserId: '',
  storageBackend: 'presign',
  r2Endpoint: '',
  r2Region: 'auto',
  r2AccessKeyEnv: 'R2_ACCESS_KEY_ID',
  r2SecretKeyEnv: 'R2_SECRET_ACCESS_KEY',
  r2Bucket: '',
  r2CdnBase: '',
  r2PathPrefix: 'inputs',
}

async function createHarness(answer) {
  const mod = await import('../dist/index.js')
  const tools = new Map()
  const questionCalls = []
  const ctx = {
    effect(register) { return register() },
    webServer: { register() { return () => {} } },
    get() { return undefined },
    tools: { register(tool) { tools.set(tool.name, tool); return () => {} } },
    systemPrompt: { section() {} },
    userQuestions: {
      async ask(payload) {
        questionCalls.push(payload.questions)
        return answer ? answer(payload.questions, questionCalls.length) : { answers: [] }
      },
    },
    credentials: { async resolve() { return undefined } },
    logger: { warn() {} },
  }
  mod.apply(ctx, config)
  return { mod, tools, questionCalls }
}

function execContext() {
  return { signal: new AbortController().signal }
}

test('video wizard model selection exposes all 0.3.3 models with capability descriptions', async () => {
  const { tools, questionCalls } = await createHarness()
  const wizard = tools.get('media_wizard')

  const result = await wizard.execute({
    intent: 'video_gen',
    known: { prompt: 'A cinematic product shot', enhanced: false },
  }, execContext())

  assert.equal(result.confirmed, false)
  const modelQuestion = questionCalls.flat().find((question) => question.id === 'model')
  assert.ok(modelQuestion)
  assert.deepEqual(modelQuestion.options.map((option) => option.label), [
    'minimax_h3',
    'ltx_2_5（插件默认）',
    'ltx_2_3',
    'seedance_2_5',
    'seedance_2_0',
  ])
  const ltx25 = modelQuestion.options.find((option) => option.label === 'ltx_2_5（插件默认）')
  assert.match(ltx25.description, /5\/10 秒/)
  assert.match(ltx25.description, /720p\/1080p/)
  assert.doesNotMatch(ltx25.description, /1440p/)
})

test('seedance 2.5 first-frame wizard enforces adaptive ratio and allows disabling audio', async () => {
  let finalDetail = ''
  const { tools, questionCalls } = await createHarness((questions) => {
    const audioQuestion = questions.find((question) => question.id === 'generate_audio')
    if (audioQuestion) return { answers: [{ id: 'generate_audio', selected: ['关闭音频'] }] }
    const finalQuestion = questions.find((question) => question.id === 'final_confirm')
    if (finalQuestion) {
      finalDetail = finalQuestion.detail
      return { answers: [{ id: 'final_confirm', selected: ['确认生成 (Recommended)'] }] }
    }
    return { answers: [] }
  })
  const wizard = tools.get('media_wizard')

  const result = await wizard.execute({
    intent: 'video_gen',
    known: {
      prompt: 'Animate the supplied first frame',
      enhanced: false,
      model: 'seedance_2_5',
      duration: 5,
      resolution: '720p',
      start_image: 'https://example.com/start.png',
    },
  }, execContext())

  assert.equal(result.confirmed, true)
  assert.equal(result.params.aspect_ratio, 'adaptive')
  assert.equal(result.params.generate_audio, false)
  const audioQuestion = questionCalls.flat().find((question) => question.id === 'generate_audio')
  assert.deepEqual(audioQuestion.options.map((option) => option.label), [
    '开启音频 (Recommended)',
    '关闭音频',
  ])
  assert.match(finalDetail, /- 画面比例: adaptive（自动匹配输入图片比例）/)
})

test('seedance 2.5 text wizard explains the adaptive aspect-ratio option', async () => {
  const { tools, questionCalls } = await createHarness()
  const wizard = tools.get('media_wizard')

  const result = await wizard.execute({
    intent: 'video_gen',
    known: {
      prompt: 'A cinematic landscape',
      enhanced: false,
      model: 'seedance_2_5',
      duration: 5,
      resolution: '720p',
      generate_audio: true,
    },
  }, execContext())

  assert.equal(result.confirmed, false)
  const aspectQuestion = questionCalls.flat().find((question) => question.id === 'aspect_ratio')
  assert.ok(aspectQuestion.options.some((option) => option.label === 'adaptive（模型自动选择画面比例）'))
})

test('required-audio video models reject attempts to disable generated audio', async () => {
  const { tools } = await createHarness()
  const wizard = tools.get('media_wizard')

  await assert.rejects(() => wizard.execute({
    intent: 'video_gen',
    known: {
      prompt: 'A cinematic landscape',
      enhanced: false,
      model: 'ltx_2_5',
      duration: 5,
      resolution: '720p',
      aspect_ratio: '16:9',
      generate_audio: false,
      skipFinalConfirmation: true,
    },
  }, execContext()), /requires generated audio to remain enabled/)
})

test('video wizard final confirmation summarizes fixed generated audio', async () => {
  let finalDetail = ''
  const { tools } = await createHarness((questions) => {
    const finalQuestion = questions.find((question) => question.id === 'final_confirm')
    if (!finalQuestion) return { answers: [] }
    finalDetail = finalQuestion.detail
    return { answers: [{ id: 'final_confirm', selected: ['确认生成 (Recommended)'] }] }
  })
  const wizard = tools.get('media_wizard')

  const result = await wizard.execute({
    intent: 'video_gen',
    known: {
      prompt: 'A cinematic city timelapse',
      enhanced: false,
      model: 'ltx_2_3',
      duration: 5,
      aspect_ratio: '16:9',
    },
  }, execContext())

  assert.equal(result.confirmed, true)
  assert.equal(result.params.generate_audio, true)
  assert.match(finalDetail, /- 分辨率: 720p/)
  assert.match(finalDetail, /- 音频: 自动生成音频（模型固定开启）/)
})

test('video generation tool schema accepts the five models and combined video ratios', async () => {
  const { tools } = await createHarness()
  const videoTool = tools.get('media_generate_video')

  assert.deepEqual(videoTool.parameters.properties.model.enum, [
    'minimax_h3',
    'ltx_2_5',
    'ltx_2_3',
    'seedance_2_5',
    'seedance_2_0',
  ])
  assert.ok(videoTool.parameters.properties.aspect_ratio.enum.includes('adaptive'))
  assert.ok(videoTool.parameters.properties.aspect_ratio.enum.includes('3:2'))
  assert.ok(videoTool.parameters.properties.aspect_ratio.enum.includes('2:3'))
  assert.equal(videoTool.parameters.properties.generate_audio.type, 'boolean')
})

test('video request body applies each model audio strategy without network access', async () => {
  const { mod, tools } = await createHarness()
  const videoTool = tools.get('media_generate_video')
  const requests = []
  const originalSubmit = mod.TokensApiClient.prototype.submit
  const originalPoll = mod.TokensApiClient.prototype.poll
  mod.TokensApiClient.prototype.submit = async function (kind, body) {
    requests.push({ kind, body })
    return `task_${requests.length}`
  }
  mod.TokensApiClient.prototype.poll = async function () {
    return { results: [] }
  }

  try {
    const ltx23 = await videoTool.execute({
      prompt: 'A city at sunrise',
      model: 'ltx_2_3',
      duration: 5,
      aspect_ratio: '16:9',
    }, execContext())
    assert.equal(ltx23.generateAudio, true)
    assert.equal('generate_audio' in requests.at(-1).body, false)

    const ltx25 = await videoTool.execute({
      prompt: 'A cinematic ocean scene',
      model: 'ltx_2_5',
      duration: 5,
      resolution: '1080p',
      aspect_ratio: '16:9',
    }, execContext())
    assert.equal(ltx25.generateAudio, true)
    assert.equal(requests.at(-1).body.generate_audio, true)

    const seedance25 = await videoTool.execute({
      prompt: 'Animate the supplied frame',
      model: 'seedance_2_5',
      duration: 5,
      resolution: '720p',
      generate_audio: false,
      start_image: 'https://example.com/start.png',
    }, execContext())
    assert.equal(seedance25.generateAudio, false)
    assert.equal(requests.at(-1).body.generate_audio, false)
    assert.equal(requests.at(-1).body.aspect_ratio, 'adaptive')
    assert.equal(requests.at(-1).body.frame_images[0].frame_type, 'first_frame')

    const h3 = await videoTool.execute({
      prompt: 'A product reveal',
      model: 'minimax_h3',
      duration: 10,
      resolution: '480p',
      aspect_ratio: '3:2',
    }, execContext())
    assert.equal(h3.generateAudio, true)
    assert.equal(requests.at(-1).body.generate_audio, true)
  } finally {
    mod.TokensApiClient.prototype.submit = originalSubmit
    mod.TokensApiClient.prototype.poll = originalPoll
  }

  assert.equal(requests.length, 4)
  assert.ok(requests.every((request) => request.kind === 'videos'))
})

test('video request validation rejects invalid model parameters before submission', async () => {
  const { mod, tools } = await createHarness()
  const videoTool = tools.get('media_generate_video')
  let submitted = false
  const originalSubmit = mod.TokensApiClient.prototype.submit
  mod.TokensApiClient.prototype.submit = async function () {
    submitted = true
    return 'unexpected_task'
  }

  try {
    await assert.rejects(() => videoTool.execute({
      prompt: 'A cinematic landscape',
      model: 'ltx_2_5',
      duration: 5,
      resolution: '720p',
      aspect_ratio: '16:9',
      generate_audio: false,
    }, execContext()), /requires generated audio to remain enabled/)
    assert.equal(submitted, false)
  } finally {
    mod.TokensApiClient.prototype.submit = originalSubmit
  }
})
