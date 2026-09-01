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

test('prompt enhancement question shows the complete current prompt and its source', async () => {
  let enhanceQuestion
  const { tools } = await createHarness((questions) => {
    const question = questions.find((item) => item.id === 'enhance')
    if (question) {
      enhanceQuestion = question
      return { answers: [{ id: 'enhance', selected: ['保持原始 Prompt'] }] }
    }
    return { answers: [] }
  })
  const wizard = tools.get('media_wizard')
  const prompt = 'A complete prompt\nwith an intentional second line.'

  await wizard.execute({
    intent: 'video_gen',
    known: { prompt, promptSource: 'user' },
  }, execContext())

  assert.equal(enhanceQuestion.question, '是否增强下面的 Prompt？')
  assert.equal(enhanceQuestion.detail, `当前 Prompt\n来源：本次输入\n\n${prompt}`)
})

test('prompt entered in the wizard is labeled as wizard input before enhancement', async () => {
  let enhanceDetail = ''
  const { tools } = await createHarness((questions) => {
    const promptQuestion = questions.find((question) => question.id === 'prompt')
    if (promptQuestion) return { answers: [{ id: 'prompt', custom: 'Prompt entered inside the wizard' }] }
    const enhanceQuestion = questions.find((question) => question.id === 'enhance')
    if (enhanceQuestion) {
      enhanceDetail = enhanceQuestion.detail
      return { answers: [{ id: 'enhance', selected: ['保持原始 Prompt'] }] }
    }
    return { answers: [] }
  })
  const wizard = tools.get('media_wizard')

  await wizard.execute({ intent: 'image_gen', known: {} }, execContext())

  assert.equal(enhanceDetail, '当前 Prompt\n来源：向导中填写\n\nPrompt entered inside the wizard')
})

test('enhanced prompt comparison preserves the exact original prompt', async () => {
  let comparisonDetail = ''
  const { mod, tools } = await createHarness((questions) => {
    const enhanceQuestion = questions.find((question) => question.id === 'enhance')
    if (enhanceQuestion) return { answers: [{ id: 'enhance', selected: ['增强 Prompt（推荐）'] }] }
    const confirmQuestion = questions.find((question) => question.id === 'prompt_confirm')
    if (confirmQuestion) {
      comparisonDetail = confirmQuestion.detail
      return { answers: [{ id: 'prompt_confirm', selected: ['确认增强后 Prompt（推荐）'] }] }
    }
    return { answers: [] }
  })
  const wizard = tools.get('media_wizard')
  const originalEnhance = mod.TokensApiClient.prototype.enhance
  const originalPrompt = 'Original prompt\nwith preserved formatting.'
  mod.TokensApiClient.prototype.enhance = async function () { return 'Enhanced prompt result.' }

  try {
    await wizard.execute({
      intent: 'image_gen',
      known: { prompt: originalPrompt, promptSource: 'inferred' },
    }, execContext())
  } finally {
    mod.TokensApiClient.prototype.enhance = originalEnhance
  }

  assert.equal(comparisonDetail, `原始 Prompt:\n${originalPrompt}\n\n增强后 Prompt:\nEnhanced prompt result.`)
})

test('ambiguous follow-up asks before reusing prior prompt, references, and settings', async () => {
  const { tools, questionCalls } = await createHarness((questions) => {
    const reuseQuestions = questions.filter((question) => question.id.startsWith('reuse_'))
    if (reuseQuestions.length) {
      return {
        answers: reuseQuestions.map((question) => ({ id: question.id, selected: ['不复用'] })),
      }
    }
    return { answers: [] }
  })
  const wizard = tools.get('media_wizard')

  const result = await wizard.execute({
    intent: 'video_gen',
    known: {},
    previousTask: {
      intent: 'video_gen',
      params: {
        prompt: 'A previous neon city video',
        start_image: 'https://example.com/previous-start.png',
        end_image: 'https://example.com/previous-end.png',
        model: 'ltx_2_5',
        duration: 5,
        resolution: '720p',
        aspect_ratio: '16:9',
        generate_audio: true,
      },
    },
  }, execContext())

  const reuseCall = questionCalls.find((questions) => questions.some((question) => question.id === 'reuse_prompt'))
  assert.ok(reuseCall)
  assert.deepEqual(reuseCall.map((question) => question.id), ['reuse_prompt', 'reuse_references', 'reuse_settings'])
  assert.deepEqual(reuseCall[0].options.map((option) => option.label), ['不复用', '复用'])
  assert.equal(result.reuseDecisions.prompt, false)
  assert.equal(result.reuseDecisions.references, false)
  assert.equal(result.reuseDecisions.settings, false)
  assert.equal(result.params.prompt, undefined)
  assert.equal(result.params.start_image, undefined)
  assert.equal(result.params.model, undefined)
})

test('confirmed reuse merges prior values and marks the prompt source as reused', async () => {
  let finalDetail = ''
  let enhanceDetail = ''
  const { tools, questionCalls } = await createHarness((questions) => {
    const reuseQuestions = questions.filter((question) => question.id.startsWith('reuse_'))
    if (reuseQuestions.length) {
      return {
        answers: reuseQuestions.map((question) => ({ id: question.id, selected: ['复用'] })),
      }
    }
    const enhanceQuestion = questions.find((question) => question.id === 'enhance')
    if (enhanceQuestion) {
      enhanceDetail = enhanceQuestion.detail
      return { answers: [{ id: 'enhance', selected: ['保持原始 Prompt'] }] }
    }
    const finalQuestion = questions.find((question) => question.id === 'final_confirm')
    if (finalQuestion) {
      finalDetail = finalQuestion.detail
      return { answers: [{ id: 'final_confirm', selected: ['确认生成（推荐）'] }] }
    }
    return { answers: [] }
  })
  const wizard = tools.get('media_wizard')

  const result = await wizard.execute({
    intent: 'video_gen',
    known: {},
    previousTask: {
      intent: 'video_gen',
      params: {
        prompt: 'A previous neon city video',
        start_image: 'https://example.com/previous-start.png',
        end_image: 'https://example.com/previous-end.png',
        model: 'ltx_2_5',
        duration: 5,
        resolution: '720p',
        aspect_ratio: '16:9',
        generate_audio: true,
      },
    },
  }, execContext())

  assert.equal(result.confirmed, true)
  assert.equal(result.params.prompt, 'A previous neon city video')
  assert.equal(result.params.promptSource, 'reused')
  assert.equal(result.params.enhanced, false)
  assert.equal(result.params.start_image, 'https://example.com/previous-start.png')
  assert.equal(result.params.end_image, 'https://example.com/previous-end.png')
  assert.equal(result.params.model, 'ltx_2_5')
  assert.equal(result.params.duration, 5)
  assert.equal(result.params.resolution, '720p')
  assert.match(finalDetail, /Prompt 来源: reused/)
  assert.equal(enhanceDetail, '当前 Prompt\n来源：历史任务复用\n\nA previous neon city video')
  assert.equal(questionCalls.flat().filter((question) => question.id.startsWith('reuse_')).length, 3)
  assert.equal(questionCalls.flat().some((question) => question.id === 'enhance'), true)
})

test('current request values win and explicit reuse decisions skip the consent questions', async () => {
  const { tools, questionCalls } = await createHarness()
  const wizard = tools.get('media_wizard')

  const result = await wizard.execute({
    intent: 'video_gen',
    known: {
      prompt: 'A completely new forest scene',
      promptSource: 'user',
      enhanced: false,
      skipFinalConfirmation: true,
    },
    previousTask: {
      intent: 'video_gen',
      params: {
        prompt: 'The old city scene must not return',
        start_image: 'https://example.com/old-start.png',
        model: 'ltx_2_5',
        duration: 5,
        resolution: '720p',
        aspect_ratio: '16:9',
        generate_audio: true,
      },
    },
    reuse: { prompt: true, references: false, settings: true },
  }, execContext())

  assert.equal(result.confirmed, true)
  assert.equal(result.params.prompt, 'A completely new forest scene')
  assert.equal(result.params.promptSource, 'user')
  assert.equal(result.params.start_image, undefined)
  assert.equal(result.params.model, 'ltx_2_5')
  assert.equal(result.params.duration, 5)
  assert.equal(questionCalls.flat().some((question) => question.id.startsWith('reuse_')), false)
})

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
    'ltx_2_5（推荐）',
    'ltx_2_3',
    'seedance_2_5',
    'seedance_2_0',
  ])
  const ltx25 = modelQuestion.options.find((option) => option.label === 'ltx_2_5（推荐）')
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
      return { answers: [{ id: 'final_confirm', selected: ['确认生成（推荐）'] }] }
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
    '开启音频（推荐）',
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
    return { answers: [{ id: 'final_confirm', selected: ['确认生成（推荐）'] }] }
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
