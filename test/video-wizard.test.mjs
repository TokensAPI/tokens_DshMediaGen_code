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
  defaultVideoModel: 'minimax_h3',
  enhanceEnabled: true,
  enhanceApiKeyEnv: 'TOKENSAPI_API_KEY',
  enhanceBaseURL: 'https://tokensapi.ai/v1',
  enhanceModel: 'deepseek-v4-flash',
  enhanceMaxChars: 4000,
  allowLocalImageInput: true,
  maxInputImageBytes: 30 * 1024 * 1024,
  imageUploadURL: 'https://tokensapi.ai/v1/assets/images',
  uploadAuthMode: 'api_key',
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
    if (enhanceQuestion) return { answers: [{ id: 'enhance', selected: ['增强 Prompt'] }] }
    const confirmQuestion = questions.find((question) => question.id === 'prompt_confirm')
    if (confirmQuestion) {
      comparisonDetail = confirmQuestion.detail
      return { answers: [{ id: 'prompt_confirm', selected: ['确认增强后 Prompt'] }] }
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
  assert.ok(reuseCall.every((question) => question.initialSelected?.[0] === '复用'))
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
      return { answers: [{ id: 'final_confirm', selected: ['确认生成'] }] }
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
    'minimax_h3（推荐）',
    'ltx_2_5',
    'ltx_2_3',
    'seedance_2_5',
    'seedance_2_0',
  ])
  const ltx25 = modelQuestion.options.find((option) => option.label === 'ltx_2_5')
  assert.match(ltx25.description, /5\/10 秒/)
  assert.match(ltx25.description, /720p\/1080p/)
  assert.doesNotMatch(ltx25.description, /1440p/)
})

test('wizard recommendation marker appears only in model selection', async () => {
  const { tools, questionCalls } = await createHarness((questions) => ({
    answers: questions.map((question) => {
      if (question.id === 'enhance') return { id: question.id, selected: ['保持原始 Prompt'] }
      if (question.id === 'model') return { id: question.id, selected: ['seedance_2_5'] }
      if (question.id === 'generate_audio') return { id: question.id, selected: ['开启音频'] }
      if (question.id === 'final_confirm') return { id: question.id, selected: ['确认生成'] }
      return { id: question.id, selected: [question.options?.[0]?.label].filter(Boolean) }
    }),
  }))
  const wizard = tools.get('media_wizard')

  const result = await wizard.execute({
    intent: 'video_gen',
    known: { prompt: 'A product reveal in a bright studio' },
  }, execContext())

  assert.equal(result.confirmed, true)
  const optionQuestions = questionCalls.flat().filter((question) => Array.isArray(question.options))
  const recommendedOptions = optionQuestions.flatMap((question) => question.options
    .filter((option) => option.label.includes('（推荐）'))
    .map((option) => ({ questionId: question.id, label: option.label })))
  assert.deepEqual(recommendedOptions, [{ questionId: 'model', label: 'minimax_h3（推荐）' }])
  const finalQuestion = optionQuestions.find((question) => question.id === 'final_confirm')
  assert.doesNotMatch(finalQuestion.detail, /推荐/)
})

test('every option question exposes one valid initial selection without adding recommendation markers', async () => {
  const { tools, questionCalls } = await createHarness((questions) => ({
    answers: questions.map((question) => ({
      id: question.id,
      selected: question.initialSelected ?? [],
    })),
  }))
  const wizard = tools.get('media_wizard')

  const result = await wizard.execute({
    intent: 'video_gen',
    known: { prompt: 'A cinematic camera move through a quiet gallery' },
  }, execContext())

  assert.equal(result.confirmed, true)
  const optionQuestions = questionCalls.flat().filter((question) => Array.isArray(question.options))
  assert.ok(optionQuestions.length > 0)
  for (const question of optionQuestions) {
    assert.equal(question.initialSelected?.length, 1, `${question.id} should have exactly one initial selection`)
    assert.ok(
      question.options.some((option) => option.label === question.initialSelected[0]),
      `${question.id} initial selection should name an existing option`,
    )
  }
  assert.deepEqual(
    Object.fromEntries(optionQuestions.map((question) => [question.id, question.initialSelected[0]])),
    {
      enhance: '增强 Prompt',
      model: 'minimax_h3（推荐）',
      aspect_ratio: '16:9',
      duration: '5 秒',
      resolution: '720p',
      final_confirm: '确认生成',
    },
  )
  assert.deepEqual(
    optionQuestions.flatMap((question) => question.options
      .filter((option) => option.label.includes('（推荐）'))
      .map((option) => ({ questionId: question.id, label: option.label }))),
    [{ questionId: 'model', label: 'minimax_h3（推荐）' }],
  )
})

test('seedance 2.5 first-frame wizard enforces adaptive ratio and allows disabling audio', async () => {
  let finalDetail = ''
  const { tools, questionCalls } = await createHarness((questions) => {
    const audioQuestion = questions.find((question) => question.id === 'generate_audio')
    if (audioQuestion) return { answers: [{ id: 'generate_audio', selected: ['关闭音频'] }] }
    const finalQuestion = questions.find((question) => question.id === 'final_confirm')
    if (finalQuestion) {
      finalDetail = finalQuestion.detail
      return { answers: [{ id: 'final_confirm', selected: ['确认生成'] }] }
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
    '开启音频',
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
    return { answers: [{ id: 'final_confirm', selected: ['确认生成'] }] }
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
  assert.equal(result.params.resolution, '720p')
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
  assert.ok(videoTool.parameters.required.includes('duration'))
  assert.ok(videoTool.parameters.required.includes('resolution'))
  assert.ok(videoTool.parameters.required.includes('aspect_ratio'))
  assert.ok(videoTool.parameters.required.includes('generate_audio'))
})

test('image tool schemas require the wizard-confirmed ratio and count', async () => {
  const { tools } = await createHarness()
  for (const name of ['media_generate_image', 'media_edit_image']) {
    const tool = tools.get(name)
    assert.ok(tool.parameters.required.includes('aspect_ratio'))
    assert.ok(tool.parameters.required.includes('n'))
    assert.deepEqual(tool.parameters.properties.n.enum, [1, 2, 4])
  }
})

test('image tools reject missing confirmed output parameters before submission', async () => {
  const { mod, tools } = await createHarness()
  let submissions = 0
  const originalSubmit = mod.TokensApiClient.prototype.submit
  mod.TokensApiClient.prototype.submit = async function () {
    submissions += 1
    return 'unexpected_task'
  }

  try {
    await assert.rejects(() => tools.get('media_generate_image').execute({
      prompt: 'A red fox in snow',
      n: 2,
    }, execContext()), /missing required property "aspect_ratio"/)
    await assert.rejects(() => tools.get('media_generate_image').execute({
      prompt: 'A red fox in snow',
      aspect_ratio: '16:9',
    }, execContext()), /missing required property "n"/)
    await assert.rejects(() => tools.get('media_edit_image').execute({
      prompt: 'Make the sky brighter',
      image: 'https://example.com/input.png',
      n: 2,
    }, execContext()), /missing required property "aspect_ratio"/)
    await assert.rejects(() => tools.get('media_edit_image').execute({
      prompt: 'Make the sky brighter',
      image: 'https://example.com/input.png',
      aspect_ratio: '16:9',
    }, execContext()), /missing required property "n"/)
    assert.equal(submissions, 0)
  } finally {
    mod.TokensApiClient.prototype.submit = originalSubmit
  }
})

test('image tools submit the exact confirmed ratio and count', async () => {
  const { mod, tools } = await createHarness()
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
    await tools.get('media_generate_image').execute({
      prompt: 'A red fox in snow',
      aspect_ratio: '16:9',
      n: 2,
    }, execContext())
    await tools.get('media_edit_image').execute({
      prompt: 'Make the sky brighter',
      image: 'https://example.com/input.png',
      aspect_ratio: '16:9',
      n: 2,
    }, execContext())
  } finally {
    mod.TokensApiClient.prototype.submit = originalSubmit
    mod.TokensApiClient.prototype.poll = originalPoll
  }

  assert.equal(requests.length, 2)
  assert.ok(requests.every((request) => request.kind === 'images'))
  assert.ok(requests.every((request) => request.body.aspect_ratio === '16:9'))
  assert.ok(requests.every((request) => request.body.n === 2))
})

test('video tool rejects missing confirmed output parameters before submission', async () => {
  const { mod, tools } = await createHarness()
  const videoTool = tools.get('media_generate_video')
  let submissions = 0
  const originalSubmit = mod.TokensApiClient.prototype.submit
  mod.TokensApiClient.prototype.submit = async function () {
    submissions += 1
    return 'unexpected_task'
  }
  const complete = {
    prompt: 'A cinematic landscape',
    model: 'seedance_2_5',
    duration: 5,
    resolution: '720p',
    aspect_ratio: '16:9',
    generate_audio: true,
  }

  try {
    for (const field of ['duration', 'resolution', 'aspect_ratio', 'generate_audio']) {
      const args = { ...complete }
      delete args[field]
      await assert.rejects(
        () => videoTool.execute(args, execContext()),
        new RegExp(`missing required property "${field}"`),
      )
    }
    assert.equal(submissions, 0)
  } finally {
    mod.TokensApiClient.prototype.submit = originalSubmit
  }
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
      resolution: '720p',
      aspect_ratio: '16:9',
      generate_audio: true,
    }, execContext())
    assert.equal(ltx23.generateAudio, true)
    assert.equal('generate_audio' in requests.at(-1).body, false)

    const ltx25 = await videoTool.execute({
      prompt: 'A cinematic ocean scene',
      model: 'ltx_2_5',
      duration: 5,
      resolution: '1080p',
      aspect_ratio: '16:9',
      generate_audio: true,
    }, execContext())
    assert.equal(ltx25.generateAudio, true)
    assert.equal(requests.at(-1).body.generate_audio, true)

    const seedance25 = await videoTool.execute({
      prompt: 'Animate the supplied frame',
      model: 'seedance_2_5',
      duration: 5,
      resolution: '720p',
      generate_audio: false,
      aspect_ratio: 'adaptive',
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
      generate_audio: true,
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

test('completed videos stay remote and render inline without automatic downloads', async () => {
  const { mod, tools } = await createHarness()
  const videoTool = tools.get('media_generate_video')
  const statusTool = tools.get('media_task_status')
  const url = 'https://cdn.example.com/generated/video.mp4'
  let downloadAttempts = 0
  const originalSubmit = mod.TokensApiClient.prototype.submit
  const originalPoll = mod.TokensApiClient.prototype.poll
  const originalStatus = mod.TokensApiClient.prototype.status
  const originalFetch = globalThis.fetch
  mod.TokensApiClient.prototype.submit = async function () { return 'task_video_inline' }
  mod.TokensApiClient.prototype.poll = async function () {
    return { status: 'succeeded', progress: 100, results: [{ url }], media: { width: 1280, height: 720 } }
  }
  mod.TokensApiClient.prototype.status = async function () {
    return { status: 'succeeded', progress: 100, results: [{ url }], media: { width: 1280, height: 720 } }
  }
  globalThis.fetch = async function () {
    downloadAttempts += 1
    throw new Error('Completed video URLs must not be downloaded automatically')
  }
  const execution = { ...execContext(), concludeTurn() {} }

  try {
    const generated = await videoTool.execute({
      prompt: 'A paper boat crossing a quiet lake',
      model: 'minimax_h3',
      duration: 5,
      resolution: '720p',
      aspect_ratio: '16:9',
      generate_audio: true,
    }, execution)
    assert.equal(generated.url, url)
    assert.equal('filePath' in generated, false)
    assert.equal('error' in generated, false)
    assert.deepEqual(videoTool.output.render({}, generated)[0], { type: 'video', url })

    const recovered = await statusTool.execute({ task_id: 'task_video_inline', kind: 'videos' }, execution)
    assert.equal(recovered.url, url)
    assert.equal('filePath' in recovered, false)
    assert.equal('error' in recovered, false)
    assert.deepEqual(statusTool.output.render({}, recovered)[0], { type: 'video', url })
    assert.equal(downloadAttempts, 0)
  } finally {
    mod.TokensApiClient.prototype.submit = originalSubmit
    mod.TokensApiClient.prototype.poll = originalPoll
    mod.TokensApiClient.prototype.status = originalStatus
    globalThis.fetch = originalFetch
  }
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
