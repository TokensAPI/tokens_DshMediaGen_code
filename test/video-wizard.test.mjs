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

async function createHarness(answer, configOverrides = {}) {
  const mod = await import('../dist/index.js')
  const tools = new Map()
  const questionCalls = []
  const wireQuestionCalls = []
  const ctx = {
    effect(register) { return register() },
    webServer: { register() { return () => {} } },
    get() { return undefined },
    tools: { register(tool) { tools.set(tool.name, tool); return () => {} } },
    systemPrompt: { section() {} },
    userQuestions: {
      async ask(payload) {
        const wireQuestions = payload.questions
        const logicalQuestions = wireQuestions.map((question) => ({
          ...question,
          id: String(question.id).replace(/^tokensapi_media__q\d+__d-?\d+__/, ''),
        }))
        wireQuestionCalls.push(wireQuestions)
        questionCalls.push(logicalQuestions)
        const response = answer ? await answer(logicalQuestions, questionCalls.length) : { answers: [] }
        // Older scenarios focus on later steps. Accept the newly mandatory
        // current-prompt card unless the scenario explicitly answers it.
        for (const question of logicalQuestions) {
          if (question.id === 'prompt' && question.initialSelected?.length && !response.answers?.some((item) => item.id === 'prompt')) {
            response.answers ??= []
            response.answers.push({ id: 'prompt', selected: question.initialSelected })
          }
        }
        return {
          ...response,
          answers: (response.answers ?? []).map((item) => {
            const wireQuestion = wireQuestions.find((question) => (
              String(question.id).replace(/^tokensapi_media__q\d+__d-?\d+__/, '') === item.id
            ))
            return { ...item, id: wireQuestion?.id ?? item.id }
          }),
        }
      },
    },
    credentials: { async resolve() { return undefined } },
    logger: { warn() {} },
  }
  mod.apply(ctx, { ...config, ...configOverrides })
  return { mod, tools, questionCalls, wireQuestionCalls }
}

function execContext() {
  return conversationExecution().execution
}

let sessionSequence = 0

function conversationExecution() {
  const sequence = ++sessionSequence
  const messages = [{ role: 'user', source: { kind: 'user' }, id: `user-${sequence}-1`, content: [] }]
  const session = {
    id: `test-session-${sequence}`,
    deriveMessages() { return messages },
  }
  let userMessageSequence = 1
  return {
    execution: { signal: new AbortController().signal, agent: { session } },
    addToolResult() { messages.push({ role: 'user', source: { kind: 'tool' }, content: [] }) },
    addRuntimeSnapshot() { messages.push({ role: 'user', source: { kind: 'plugin' }, content: [] }) },
    nextUserMessage() {
      userMessageSequence += 1
      messages.push({ role: 'user', source: { kind: 'user' }, id: `user-${sequence}-${userMessageSequence}`, content: [] })
    },
  }
}

async function confirmedToolArgs(tools, intent, args, execution = execContext()) {
  const result = await tools.get('media_wizard').execute({
    intent,
    known: {
      ...args,
      enhanced: false,
      skipFinalConfirmation: true,
      ...(args.model ? {} : { useDefaultModel: true }),
    },
  }, execution)
  assert.equal(result.confirmed, true)
  assert.equal(result.cancelled, false)
  assert.equal(result.confirmationId, undefined)
  assert.equal(result.params.confirmation_id, undefined)
  return { ...args }
}

test('closing any wizard stage marks the flow cancelled and issues no confirmation', async () => {
  const scenarios = [
    { questionId: 'prompt', input: { intent: 'image_gen', known: { prompt: 'Current prompt' } } },
    {
      questionId: 'reuse_prompt',
      input: {
        intent: 'image_gen',
        known: {},
        previousTask: { intent: 'image_gen', params: { prompt: 'Previous prompt' } },
      },
    },
    { questionId: 'enhance', input: { intent: 'image_gen', known: { prompt: 'Current prompt' } } },
    { questionId: 'model', input: { intent: 'image_gen', known: { prompt: 'Current prompt', enhanced: false } } },
    { questionId: 'aspect_ratio', input: { intent: 'image_gen', known: { prompt: 'Current prompt', enhanced: false, model: 'z_image_turbo' } } },
    { questionId: 'n', input: { intent: 'image_gen', known: { prompt: 'Current prompt', enhanced: false, model: 'z_image_turbo', aspect_ratio: '16:9' } } },
  ]

  for (const scenario of scenarios) {
    const { tools } = await createHarness((questions) => {
      if (questions.some((question) => question.id === scenario.questionId)) {
        throw Object.assign(new Error('closed by user'), { code: 'ASK_CANCELLED' })
      }
      return {
        answers: questions.map((question) => ({
          id: question.id,
          selected: [question.initialSelected?.[0] ?? question.options?.[0]?.label].filter(Boolean),
        })),
      }
    })
    const { execution } = conversationExecution()
    const result = await tools.get('media_wizard').execute(scenario.input, execution)
    assert.equal(result.confirmed, false, scenario.questionId)
    assert.equal(result.cancelled, true, scenario.questionId)
    assert.equal(result.confirmationId, undefined, scenario.questionId)
    assert.equal(result.params.confirmation_id, undefined, scenario.questionId)
  }
})

test('closing the wizard blocks generation and reopening until the next user request', async () => {
  let shouldCancel = true
  const { mod, tools, questionCalls } = await createHarness((questions) => {
    if (shouldCancel) {
      shouldCancel = false
      throw Object.assign(new Error('closed by user'), { code: 'ASK_CANCELLED' })
    }
    return {
      answers: questions.map((question) => ({
        id: question.id,
        selected: [question.initialSelected?.[0] ?? question.options?.[0]?.label].filter(Boolean),
      })),
    }
  })
  const conversation = conversationExecution()
  const wizardInput = {
    intent: 'image_gen',
    known: { prompt: 'A quiet mountain lake', model: 'z_image_turbo', aspect_ratio: '16:9', n: 1 },
  }
  let submissions = 0
  const originalSubmit = mod.TokensApiClient.prototype.submit
  const originalPoll = mod.TokensApiClient.prototype.poll
  mod.TokensApiClient.prototype.submit = async function () {
    submissions += 1
    return 'task_after_new_request'
  }
  mod.TokensApiClient.prototype.poll = async function () { return { results: [] } }

  try {
    const cancelled = await tools.get('media_wizard').execute(wizardInput, conversation.execution)
    assert.equal(cancelled.cancelled, true)
    const questionCountAfterClose = questionCalls.length
    conversation.addToolResult()
    conversation.addRuntimeSnapshot()

    await assert.rejects(() => tools.get('media_generate_image').execute({
      prompt: 'A quiet mountain lake',
      model: 'z_image_turbo',
      aspect_ratio: '16:9',
      n: 1,
    }, conversation.execution), /flow was cancelled/)
    assert.equal(submissions, 0)

    const blockedRestart = await tools.get('media_wizard').execute(wizardInput, conversation.execution)
    assert.equal(blockedRestart.cancelled, true)
    assert.equal(questionCalls.length, questionCountAfterClose)

    conversation.nextUserMessage()
    const confirmed = await tools.get('media_wizard').execute({
      ...wizardInput,
      known: { ...wizardInput.known, enhanced: false, skipFinalConfirmation: true },
    }, conversation.execution)
    assert.equal(confirmed.confirmed, true)
    assert.equal(confirmed.cancelled, false)
    conversation.addToolResult()
    await tools.get('media_generate_image').execute({
      prompt: 'A quiet mountain lake',
      model: 'z_image_turbo',
      aspect_ratio: '16:9',
      n: 1,
    }, conversation.execution)
    assert.equal(submissions, 1)
  } finally {
    mod.TokensApiClient.prototype.submit = originalSubmit
    mod.TokensApiClient.prototype.poll = originalPoll
  }
})

test('generation confirmation is bound to the exact confirmed parameters', async () => {
  const { mod, tools } = await createHarness()
  const execution = execContext()
  const args = await confirmedToolArgs(tools, 'image_gen', {
    prompt: 'A red fox in snow',
    model: 'z_image_turbo',
    aspect_ratio: '16:9',
    n: 2,
  }, execution)
  let submissions = 0
  const originalSubmit = mod.TokensApiClient.prototype.submit
  mod.TokensApiClient.prototype.submit = async function () {
    submissions += 1
    return 'unexpected_task'
  }

  try {
    await assert.rejects(() => tools.get('media_generate_image').execute({ ...args, n: 4 }, execution), /parameters changed after confirmation/)
    assert.equal(submissions, 0)
  } finally {
    mod.TokensApiClient.prototype.submit = originalSubmit
  }
})

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

test('every media intent starts with the current prompt card even when all parameters are known', async () => {
  for (const intent of ['image_gen', 'image_edit', 'video_gen']) {
    const { tools, questionCalls, wireQuestionCalls } = await createHarness((questions) => {
      assert.equal(questions[0].id, 'prompt')
      assert.equal(questions[0].detail, '当前 Prompt\n来源：本次输入\n\nA scene\nwith two lines')
      assert.deepEqual(questions[0].initialSelected, ['使用当前提示词'])
      return { answers: [{ id: 'prompt', selected: ['使用当前提示词'] }] }
    })
    const result = await tools.get('media_wizard').execute({ intent, known: {
      prompt: 'A scene\nwith two lines', enhanced: false,
      model: intent === 'video_gen' ? 'minimax_h3' : 'qwen_image',
      aspect_ratio: '16:9', n: 1, ...(intent === 'video_gen' ? { duration: 5, resolution: '720p' } : {}),
      ...(intent === 'image_edit' ? { image: 'https://example.com/input.png' } : {}),
    } }, execContext())
    assert.equal(result.confirmed, true)
    assert.equal(result.params.prompt, 'A scene\nwith two lines')
    assert.equal(questionCalls.length, 1)
    assert.match(wireQuestionCalls[0][0].id, /__d0__prompt$/)
  }
})

test('editing the initial prompt clears stale enhancement and binds generation to the edited text', async () => {
  const { tools, questionCalls } = await createHarness((questions) => ({
    answers: questions.map((q) => q.id === 'prompt'
      ? { id: q.id, custom: 'An entirely new prompt\nwith a new line' }
      : { id: q.id, selected: q.id === 'enhance' ? ['保持原始 Prompt'] : q.initialSelected ?? [] }),
  }))
  const result = await tools.get('media_wizard').execute({ intent: 'image_gen', known: {
    prompt: 'Old enhanced prompt', originalPrompt: 'Old original prompt', enhanced: true,
    model: 'qwen_image', aspect_ratio: '16:9', n: 1,
  } }, execContext())
  assert.equal(result.confirmed, true)
  assert.equal(result.params.prompt, 'An entirely new prompt\nwith a new line')
  assert.equal(result.params.originalPrompt, undefined)
  assert.equal(result.params.promptSource, 'wizard')
  assert.match(questionCalls.flat().find((q) => q.id === 'enhance').detail, /An entirely new prompt\nwith a new line$/)
})

test('empty initial prompt answers never grant permission or silently bypass the card', async () => {
  for (const prompt of [undefined, 'A current prompt']) {
    const { tools, questionCalls } = await createHarness((questions) => ({
      answers: questions.map((q) => ({ id: q.id, selected: [], custom: '   ' })),
    }))
    const result = await tools.get('media_wizard').execute({ intent: 'image_gen', known: prompt ? { prompt } : {} }, execContext())
    assert.equal(result.confirmed, false)
    assert.deepEqual(questionCalls.flat().map((q) => q.id), ['prompt'])
    if (!prompt) assert.equal(questionCalls[0][0].initialSelected, undefined)
  }
})

test('modern card cancellation answers stop every wizard stage and block generation', async () => {
  for (const questionId of ['prompt', 'enhance', 'model', 'aspect_ratio', 'n']) {
    const { tools } = await createHarness((questions) => ({ answers: questions.map((q) => ({
      id: q.id, selected: q.id === questionId ? [] : q.id === 'enhance' ? ['保持原始 Prompt'] : q.initialSelected ?? [],
      ...(q.id === questionId ? { custom: 'tokensapi_media__cancelled_by_user__' } : {}),
    })) }))
    const execution = execContext()
    const result = await tools.get('media_wizard').execute({ intent: 'image_gen', known: { prompt: 'A scene' } }, execution)
    assert.equal(result.cancelled, true, questionId)
    assert.equal(result.confirmed, false, questionId)
    await assert.rejects(() => tools.get('media_generate_image').execute({ prompt: 'A scene', aspect_ratio: '1:1', n: 1 }, execution), /flow was cancelled/)
  }
})

test('friendly model wire labels map to unchanged API IDs for image, edit and video', async () => {
  for (const [intent, label, model] of [
    ['image_gen', 'Image 2.6 Flare', 'gpt-image-2.6-flare'],
    ['image_gen', 'H3 Image', 'minimax_h3_image'],
    ['image_edit', 'Qwen Image', 'qwen_image'],
    ['video_gen', 'MiniMax H3', 'minimax_h3'],
    ['video_gen', 'LTX 2.5', 'ltx_2_5'],
  ]) {
    const { tools, wireQuestionCalls } = await createHarness((questions) => ({ answers: questions.map((q) => ({
      id: q.id,
      selected: q.id === 'model' ? [q.options.find((o) => o.label.replace(/（推荐）$/, '') === label).label] : q.initialSelected ?? [],
    })) }), { enhanceEnabled: false })
    const result = await tools.get('media_wizard').execute({ intent, known: { prompt: 'A scene', ...(intent === 'image_edit' ? { image: 'https://example.com/input.png' } : {}) } }, execContext())
    assert.equal(result.confirmed, true)
    assert.equal(result.params.model ?? (intent === 'image_gen' ? config.defaultImageModel : intent === 'image_edit' ? config.defaultEditModel : config.defaultVideoModel), model)
    const modelQuestion = wireQuestionCalls.flat().find((q) => q.id.endsWith('__model'))
    assert.ok(modelQuestion.options.every((o) => !/minimax_|qwen_|z_image_|gpt-image-|ltx_/.test(o.label)))
  }
})

test('image references and video frame cards offer explicit attachment choices with defaults', async () => {
  for (const intent of ['image_edit', 'video_gen']) {
    const { execution } = conversationExecution()
    execution.agent.session.deriveMessages()[0].content = [1, 2].map((n) => ({ type: 'image', attachment: { attachmentId: `image-${n}` } }))
    const { tools, questionCalls } = await createHarness((questions) => ({ answers: questions.map((q) => (
      q.id === 'prompt' ? { id: q.id, custom: 'Animate this scene' } :
      q.id === 'video_input' ? { id: q.id, selected: ['使用首帧和尾帧图片'] } :
      q.id === 'enhance' ? { id: q.id, selected: ['保持原始 Prompt'] } :
      { id: q.id, selected: q.initialSelected ?? [] }
    )) }))
    const result = await tools.get('media_wizard').execute({ intent, known: {} }, execution)
    assert.equal(result.confirmed, true)
    assert.equal(questionCalls[0][0].id, 'prompt')
    const refs = questionCalls.flat().filter((q) => ['image', 'start_image', 'end_image'].includes(q.id))
    assert.equal(refs.length, intent === 'image_edit' ? 1 : 2)
    for (const ref of refs) {
      assert.deepEqual(ref.options.map((o) => o.label), ['dsh-attachment:1', 'dsh-attachment:2'])
      assert.deepEqual(ref.initialSelected, ['dsh-attachment:2'])
      assert.equal(result.params[ref.id], 'dsh-attachment:2')
    }
  }
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
  assert.equal(questionCalls.flat().some((question) => question.id === 'final_confirm'), false)
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

test('video wizard model selection exposes only H3 and LTX 2.5 with capability descriptions', async () => {
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
    'MiniMax H3（推荐）',
    'LTX 2.5',
  ])
  const ltx25 = modelQuestion.options.find((option) => option.label === 'LTX 2.5')
  assert.match(ltx25.description, /5\/10 秒/)
  assert.match(ltx25.description, /720p\/1080p/)
  assert.doesNotMatch(ltx25.description, /1440p/)
})

test('wizard recommendation marker appears only in model selection', async () => {
  const { tools, questionCalls } = await createHarness((questions) => ({
    answers: questions.map((question) => {
      if (question.id === 'enhance') return { id: question.id, selected: ['保持原始 Prompt'] }
      if (question.id === 'model') return { id: question.id, selected: ['ltx_2_5'] }
      if (question.id === 'generate_audio') return { id: question.id, selected: ['开启音频'] }
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
  assert.deepEqual(recommendedOptions, [{ questionId: 'model', label: 'MiniMax H3（推荐）' }])
  assert.equal(optionQuestions.some((question) => question.id === 'final_confirm'), false)
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
      prompt: '使用当前提示词',
      enhance: '增强 Prompt',
      model: 'MiniMax H3（推荐）',
      aspect_ratio: '16:9',
      duration: '5 秒',
      resolution: '720p',
    },
  )
  assert.deepEqual(
    optionQuestions.flatMap((question) => question.options
      .filter((option) => option.label.includes('（推荐）'))
      .map((option) => ({ questionId: question.id, label: option.label }))),
    [{ questionId: 'model', label: 'MiniMax H3（推荐）' }],
  )
})

test('media questions carry a private wire id with an encoded default and answers restore logical ids', async () => {
  const { tools, wireQuestionCalls } = await createHarness((questions) => ({
    answers: questions.map((question) => ({
      id: question.id,
      selected: question.initialSelected ?? [],
    })),
  }))
  const wizard = tools.get('media_wizard')

  const result = await wizard.execute({
    intent: 'image_gen',
    known: { prompt: 'A quiet lake at sunrise' },
  }, execContext())

  assert.equal(result.confirmed, true)
  const wireQuestions = wireQuestionCalls.flat()
  assert.ok(wireQuestions.length > 0)
  for (const question of wireQuestions) {
    const match = /^tokensapi_media__q\d+__d(-?\d+)__(.+)$/.exec(question.id)
    assert.ok(match, `${question.id} should be namespaced for the media composer`)
    if (!Array.isArray(question.options)) {
      assert.equal(Number(match[1]), -1)
      continue
    }
    const defaultIndex = Number(match[1])
    assert.equal(question.options[defaultIndex]?.label, question.initialSelected?.[0])
  }
})

test('removed video models are rejected before questions, uploads, or task submission', async () => {
  const { mod, tools, questionCalls } = await createHarness()
  const originalSubmit = mod.TokensApiClient.prototype.submit
  const originalUpload = mod.TokensApiClient.prototype.uploadImage
  let effects = 0
  mod.TokensApiClient.prototype.submit = async () => { effects++; throw new Error('Unexpected submit') }
  mod.TokensApiClient.prototype.uploadImage = async () => { effects++; throw new Error('Unexpected upload') }
  try {
    for (const model of ['ltx_2_3', 'seedance_2_0', 'seedance_2_5']) {
      const known = { prompt: 'Animate the frame', model, enhanced: false, duration: 5, resolution: '720p', aspect_ratio: '16:9', generate_audio: true, start_image: 'data:image/png;base64,unused' }
      await assert.rejects(() => tools.get('media_wizard').execute({ intent: 'video_gen', known }, execContext()), /is not supported/)
      await assert.rejects(() => tools.get('media_generate_video').execute(known, execContext()), /invalid arguments/)
    }
    assert.equal(questionCalls.length, 0)
    assert.equal(effects, 0)
  } finally {
    mod.TokensApiClient.prototype.submit = originalSubmit
    mod.TokensApiClient.prototype.uploadImage = originalUpload
  }
})

test('removed historical video settings are discarded and the model is selected again', async () => {
  for (const model of ['ltx_2_3', 'seedance_2_0', 'seedance_2_5']) {
    const { tools, questionCalls } = await createHarness((questions) => ({
      answers: questions.map((question) => ({ id: question.id, selected: question.initialSelected ?? [] })),
    }))
    const result = await tools.get('media_wizard').execute({
      intent: 'video_gen',
      known: { prompt: 'A new scene', enhanced: false },
      previousTask: { intent: 'video_gen', params: { model, duration: 8, aspect_ratio: 'adaptive', resolution: '1080p', generate_audio: false } },
      reuse: { settings: true },
    }, execContext())
    assert.equal(result.confirmed, true)
    assert.equal(result.params.model, undefined)
    assert.equal(result.params.useDefaultModel, true)
    assert.equal(result.params.duration, 5)
    assert.equal(result.params.resolution, '720p')
    assert.equal(result.params.aspect_ratio, '16:9')
    assert.equal(result.params.generate_audio, true)
    assert.ok(questionCalls.flat().some((question) => question.id === 'model'))
  }
})

test('stored removed video defaults normalize to H3 without accepting arbitrary models', async () => {
  const { Config } = await import('../dist/index.js')
  for (const model of ['ltx_2_3', 'seedance_2_0', 'seedance_2_5']) {
    const normalized = Config({ ...config, defaultVideoModel: model })
    assert.equal(normalized.defaultVideoModel, 'minimax_h3')
    const { tools } = await createHarness((questions) => ({
      answers: questions.map((question) => ({ id: question.id, selected: question.initialSelected ?? [] })),
    }), normalized)
    const result = await tools.get('media_wizard').execute({ intent: 'video_gen', known: { prompt: 'A new scene', enhanced: false } }, execContext())
    assert.equal(result.confirmed, true)
    assert.equal(result.params.useDefaultModel, true)
  }
  assert.throws(() => Config({ ...config, defaultVideoModel: 'unknown_model' }))
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

test('complete video parameters retain fixed audio without another review question', async () => {
  const { tools, questionCalls } = await createHarness()
  const wizard = tools.get('media_wizard')

  const result = await wizard.execute({
    intent: 'video_gen',
    known: {
      prompt: 'A cinematic city timelapse',
      enhanced: false,
      model: 'ltx_2_5',
      duration: 5,
      resolution: '720p',
      aspect_ratio: '16:9',
    },
  }, execContext())

  assert.equal(result.confirmed, true)
  assert.equal(result.params.generate_audio, true)
  assert.equal(result.params.resolution, '720p')
  assert.equal(result.finalConfirmed, true)
  assert.deepEqual(questionCalls.flat().map((question) => question.id), ['prompt'])
})

test('video generation tool schema accepts only remaining models and combined video ratios', async () => {
  const { tools } = await createHarness()
  const videoTool = tools.get('media_generate_video')

  assert.deepEqual(videoTool.parameters.properties.model.enum, [
    'minimax_h3',
    'ltx_2_5',
  ])
  assert.equal(videoTool.parameters.properties.aspect_ratio.enum.includes('adaptive'), false)
  assert.deepEqual(videoTool.parameters.properties.duration.enum, [5, 10])
  assert.ok(videoTool.parameters.properties.aspect_ratio.enum.includes('3:2'))
  assert.ok(videoTool.parameters.properties.aspect_ratio.enum.includes('2:3'))
  assert.equal(videoTool.parameters.properties.generate_audio.type, 'boolean')
  assert.ok(videoTool.parameters.required.includes('duration'))
  assert.ok(videoTool.parameters.required.includes('resolution'))
  assert.ok(videoTool.parameters.required.includes('aspect_ratio'))
  assert.ok(videoTool.parameters.required.includes('generate_audio'))
  assert.equal(videoTool.parameters.required.includes('confirmation_id'), false)
})

test('image tool schemas require the wizard-confirmed ratio and count', async () => {
  const { tools } = await createHarness()
  for (const name of ['media_generate_image', 'media_edit_image']) {
    const tool = tools.get(name)
    assert.ok(tool.parameters.required.includes('aspect_ratio'))
    assert.ok(tool.parameters.required.includes('n'))
    assert.equal(tool.parameters.required.includes('confirmation_id'), false)
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
    const imageExecution = execContext()
    const imageArgs = await confirmedToolArgs(tools, 'image_gen', {
      prompt: 'A red fox in snow',
      aspect_ratio: '16:9',
      n: 2,
    }, imageExecution)
    await tools.get('media_generate_image').execute(imageArgs, imageExecution)
    const editExecution = execContext()
    const editArgs = await confirmedToolArgs(tools, 'image_edit', {
      prompt: 'Make the sky brighter',
      image: 'https://example.com/input.png',
      aspect_ratio: '16:9',
      n: 2,
    }, editExecution)
    await tools.get('media_edit_image').execute(editArgs, editExecution)
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
    model: 'minimax_h3',
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

test('remaining video models preserve fixed audio and first/last frame requests without network access', async () => {
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
    const ltx25Execution = execContext()
    const ltx25Args = await confirmedToolArgs(tools, 'video_gen', {
      prompt: 'A cinematic ocean scene',
      model: 'ltx_2_5',
      duration: 5,
      resolution: '1080p',
      aspect_ratio: '16:9',
      generate_audio: true,
      start_image: 'https://example.com/start.png',
      end_image: 'https://example.com/end.png',
    }, ltx25Execution)
    const ltx25 = await videoTool.execute(ltx25Args, ltx25Execution)
    assert.equal(ltx25.generateAudio, true)
    assert.equal(requests.at(-1).body.generate_audio, true)
    assert.deepEqual(requests.at(-1).body.frame_images, [
      { type: 'image_url', frame_type: 'first_frame', image_url: { url: 'https://example.com/start.png' } },
      { type: 'image_url', frame_type: 'last_frame', image_url: { url: 'https://example.com/end.png' } },
    ])

    const h3Execution = execContext()
    const h3Args = await confirmedToolArgs(tools, 'video_gen', {
      prompt: 'A product reveal',
      model: 'minimax_h3',
      duration: 10,
      resolution: '480p',
      aspect_ratio: '3:2',
      generate_audio: true,
    }, h3Execution)
    const h3 = await videoTool.execute(h3Args, h3Execution)
    assert.equal(h3.generateAudio, true)
    assert.equal(requests.at(-1).body.generate_audio, true)
  } finally {
    mod.TokensApiClient.prototype.submit = originalSubmit
    mod.TokensApiClient.prototype.poll = originalPoll
  }

  assert.equal(requests.length, 2)
  assert.ok(requests.every((request) => request.kind === 'videos'))
})

test('completed videos stay remote and render inline without automatic downloads', async () => {
  const { mod, tools } = await createHarness()
  const videoTool = tools.get('media_generate_video')
  const statusTool = tools.get('media_task_status')
  const url = 'https://cdn.example.com/generated/video.mp4'
  let downloadAttempts = 0
  let pollCalls = 0
  let statusCalls = 0
  const originalSubmit = mod.TokensApiClient.prototype.submit
  const originalPoll = mod.TokensApiClient.prototype.poll
  const originalStatus = mod.TokensApiClient.prototype.status
  const originalFetch = globalThis.fetch
  mod.TokensApiClient.prototype.submit = async function () { return 'task_video_inline' }
  mod.TokensApiClient.prototype.poll = async function () {
    pollCalls += 1
    return { status: 'succeeded', progress: 100, results: [{ url }], media: { width: 1280, height: 720 } }
  }
  mod.TokensApiClient.prototype.status = async function () {
    statusCalls += 1
    return { status: 'succeeded', progress: 100, results: [{ url }], media: { width: 1280, height: 720 } }
  }
  globalThis.fetch = async function () {
    downloadAttempts += 1
    throw new Error('Completed video URLs must not be downloaded automatically')
  }
  const execution = { ...execContext(), concludeTurn() {} }

  try {
    const generatedArgs = await confirmedToolArgs(tools, 'video_gen', {
      prompt: 'A paper boat crossing a quiet lake',
      model: 'minimax_h3',
      duration: 5,
      resolution: '720p',
      aspect_ratio: '16:9',
      generate_audio: true,
    }, execution)
    const generated = await videoTool.execute(generatedArgs, execution)
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
    assert.equal(pollCalls, 2)
    assert.equal(statusCalls, 0)
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

const newImageModels = ['minimax_h3_image', 'gpt-image-2.6-sunburst', 'gpt-image-2.6-flare']
const chooseDefaults = (questions) => ({
  answers: questions.map((question) => ({ id: question.id, selected: question.initialSelected ?? [] })),
})

test('new image models appear in generation, editing, and discovery with H3 Image / Qwen / H3 defaults', async () => {
  const { mod, tools } = await createHarness()
  for (const name of ['media_generate_image', 'media_edit_image']) {
    for (const model of newImageModels) assert.ok(tools.get(name).parameters.properties.model.enum.includes(model))
    assert.equal(tools.get(name).parameters.properties.model.enum.includes('image2'), false)
  }
  const listed = await tools.get('media_list_models').execute({}, execContext())
  for (const model of newImageModels) assert.ok(listed.images.includes(model))
  assert.equal(listed.images.includes('image2'), false)
  assert.deepEqual(listed.videos, ['minimax_h3', 'ltx_2_5'])
  assert.equal(mod.Config({}).defaultImageModel, 'minimax_h3_image')
  assert.equal(mod.Config({}).defaultEditModel, 'qwen_image')
  assert.equal(mod.Config({}).defaultVideoModel, 'minimax_h3')

  for (const intent of ['image_gen', 'image_edit']) {
    const { tools: wizardTools, questionCalls } = await createHarness(chooseDefaults, mod.Config({}))
    const result = await wizardTools.get('media_wizard').execute({
      intent, known: { prompt: 'A new watercolor landscape', image: 'https://example.com/input.png', enhanced: false },
    }, execContext())
    assert.equal(result.confirmed, true)
    const models = questionCalls.flat().find((question) => question.id === 'model')
    assert.equal(models.options.some((option) => /^Image 2(?:（推荐）)?$/.test(option.label)), false)
    for (const model of ['H3 Image', 'Image 2.6 Sunburst', 'Image 2.6 Flare']) assert.ok(models.options.some((option) => option.label.replace(/（推荐）$/, '') === model))
    assert.deepEqual(models.initialSelected, [intent === 'image_gen' ? 'H3 Image（推荐）' : 'Qwen Image（推荐）'])
  }
})

test('legacy Image 2 requests are rejected before questions, uploads, or submission', async () => {
  const { mod, tools, questionCalls } = await createHarness()
  const originalSubmit = mod.TokensApiClient.prototype.submit
  const originalUpload = mod.TokensApiClient.prototype.uploadImage
  let effects = 0
  mod.TokensApiClient.prototype.submit = async () => { effects++; throw new Error('Unexpected submit') }
  mod.TokensApiClient.prototype.uploadImage = async () => { effects++; throw new Error('Unexpected upload') }
  try {
    for (const [intent, tool] of [['image_gen', 'media_generate_image'], ['image_edit', 'media_edit_image']]) {
      const known = { prompt: 'A new scene', model: 'image2', enhanced: false, image: 'data:image/png;base64,unused', aspect_ratio: '1:1', n: 1 }
      await assert.rejects(() => tools.get('media_wizard').execute({ intent, known }, execContext()), /is not supported/)
      await assert.rejects(() => tools.get(tool).execute(known, execContext()), /invalid arguments/)
    }
    assert.equal(questionCalls.length, 0)
    assert.equal(effects, 0)
  } finally {
    mod.TokensApiClient.prototype.submit = originalSubmit
    mod.TokensApiClient.prototype.uploadImage = originalUpload
  }
})

test('legacy Image 2 history discards removed settings and asks for a current model', async () => {
  const { Config } = await import('../dist/index.js')
  for (const intent of ['image_gen', 'image_edit']) {
    const { tools, questionCalls } = await createHarness(chooseDefaults, Config({}))
    const result = await tools.get('media_wizard').execute({
      intent,
      known: { prompt: 'A new scene', enhanced: false, image: 'https://example.com/input.png' },
      previousTask: { intent, params: { model: 'image2', aspect_ratio: '9:16', n: 4 } },
      reuse: { settings: true },
    }, execContext())
    assert.equal(result.confirmed, true)
    assert.equal(result.params.model, undefined)
    assert.equal(result.params.useDefaultModel, true)
    assert.equal(result.params.aspect_ratio, intent === 'image_gen' ? '1:1' : '16:9')
    assert.equal(result.params.n, 1)
    assert.equal(result.params.resolution, intent === 'image_gen' ? '2k' : undefined)
    const questions = questionCalls.flat()
    assert.ok(questions.some((question) => question.id === 'model'))
    assert.ok(questions.some((question) => question.id === 'aspect_ratio'))
    assert.ok(questions.some((question) => question.id === 'n'))
  }
})

test('stored Image 2 defaults normalize to H3 Image / Qwen without accepting arbitrary models', async () => {
  const { Config } = await import('../dist/index.js')
  const normalized = Config({ ...config, defaultImageModel: 'image2', defaultEditModel: 'image2' })
  assert.equal(normalized.defaultImageModel, 'minimax_h3_image')
  assert.equal(normalized.defaultEditModel, 'qwen_image')
  for (const intent of ['image_gen', 'image_edit']) {
    const { tools, questionCalls } = await createHarness(chooseDefaults, normalized)
    const result = await tools.get('media_wizard').execute({
      intent, known: { prompt: 'A new scene', enhanced: false, image: 'https://example.com/input.png' },
    }, execContext())
    assert.equal(result.confirmed, true)
    assert.equal(result.params.useDefaultModel, true)
    const models = questionCalls.flat().find((question) => question.id === 'model')
    assert.deepEqual(models.initialSelected, [intent === 'image_gen' ? 'H3 Image（推荐）' : 'Qwen Image（推荐）'])
  }
  assert.throws(() => Config({ ...config, defaultImageModel: 'unknown_model' }))
  assert.throws(() => Config({ ...config, defaultEditModel: 'unknown_model' }))
})

test('H3 Image wizard uses the selected 2k resolution without a final review', async () => {
  for (const intent of ['image_gen', 'image_edit']) {
    const { tools, questionCalls } = await createHarness(chooseDefaults)
    const result = await tools.get('media_wizard').execute({
      intent, known: { prompt: 'A cinematic landscape', model: 'minimax_h3_image', image: 'https://example.com/input.png', enhanced: false },
    }, execContext())
    assert.equal(result.confirmed, true)
    assert.equal(result.params.resolution, '2k')
    assert.equal(result.params.aspect_ratio, '1:1')
    const questions = questionCalls.flat()
    const resolution = questions.find((question) => question.id === 'resolution')
    assert.deepEqual(resolution.options.map((option) => option.label), ['1k', '2k'])
    assert.deepEqual(resolution.initialSelected, ['2k'])
    assert.deepEqual(questions.find((question) => question.id === 'aspect_ratio').options.map((option) => option.label), ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'])
    assert.equal(questions.some((question) => question.id === 'final_confirm'), false)
    assert.ok(questions.every((question) => question.options.every((option) => !option.label.includes('推荐'))))
  }
})

test('Image2.6 generation and editing expose only exact ratios and no resolution selector', async () => {
  for (const model of newImageModels.slice(1)) {
    for (const intent of ['image_gen', 'image_edit']) {
      const { tools, questionCalls } = await createHarness(chooseDefaults)
      const result = await tools.get('media_wizard').execute({
        intent, known: { prompt: 'A watercolor landscape', model, image: 'https://example.com/input.png', enhanced: false },
      }, execContext())
      assert.equal(result.confirmed, true)
      assert.equal(result.params.resolution, undefined)
      const questions = questionCalls.flat()
      const ratio = questions.find((question) => question.id === 'aspect_ratio')
      assert.deepEqual(ratio.options.map((option) => option.label), ['1:1', '3:2', '2:3'])
      assert.deepEqual(ratio.initialSelected, ['1:1'])
      assert.equal(questions.some((question) => question.id === 'resolution'), false)
      for (const aspect_ratio of ['16:9', '9:16', '4:3', '3:4', '21:9']) {
        await assert.rejects(() => tools.get('media_wizard').execute({ intent, known: { prompt: 'A scene', model, aspect_ratio } }, execContext()), /Aspect ratio .* is not supported/)
      }
      await assert.rejects(() => tools.get('media_wizard').execute({ intent, known: { prompt: 'A scene', model, resolution: '2k' } }, execContext()), /Resolution 2k is not supported/)
    }
  }
})

test('image model selection validates known parameters after selecting a model', async () => {
  const { tools } = await createHarness((questions) => ({
    answers: questions.map((question) => ({ id: question.id, selected: question.id === 'model' ? ['minimax_h3_image'] : question.initialSelected ?? [] })),
  }))
  // 3:2 is valid for the chosen H3 Image editor, even though the legacy default editor does not expose it.
  const result = await tools.get('media_wizard').execute({
    intent: 'image_edit', known: { prompt: 'A scene', image: 'https://example.com/input.png', enhanced: false, aspect_ratio: '3:2', n: 1, resolution: '1k' },
  }, execContext())
  assert.equal(result.confirmed, true)
  assert.equal(result.params.model, 'minimax_h3_image')
  assert.equal(result.params.resolution, '1k')

  const { tools: image26Tools, questionCalls } = await createHarness((questions) => ({
    answers: questions.map((question) => ({ id: question.id, selected: question.id === 'model' ? ['gpt-image-2.6-flare'] : question.initialSelected ?? [] })),
  }))
  await assert.rejects(() => image26Tools.get('media_wizard').execute({
    intent: 'image_gen', known: { prompt: 'A scene', enhanced: false, aspect_ratio: '16:9' },
  }, execContext()), /Aspect ratio 16:9 is not supported/)
  assert.equal(questionCalls.flat().some((question) => question.id === 'final_confirm'), false)
})

test('new image models submit exact model-specific generation and edit bodies', async () => {
  const { mod, tools } = await createHarness()
  const originalSubmit = mod.TokensApiClient.prototype.submit
  const originalPoll = mod.TokensApiClient.prototype.poll
  const requests = []
  mod.TokensApiClient.prototype.submit = async (kind, body) => { requests.push({ kind, body }); return `image_${requests.length}` }
  mod.TokensApiClient.prototype.poll = async () => ({ results: [] })
  try {
    for (const model of newImageModels) {
      for (const intent of ['image_gen', 'image_edit']) {
        for (const resolution of model === 'minimax_h3_image' ? ['1k', '2k'] : [undefined]) {
          const execution = execContext()
          const args = { model, prompt: 'A watercolor landscape', aspect_ratio: '3:2', n: 2,
            ...(resolution ? { resolution } : {}),
            ...(intent === 'image_edit' ? { image: 'https://example.com/input.png' } : {}),
          }
          await confirmedToolArgs(tools, intent, args, execution)
          await tools.get(intent === 'image_gen' ? 'media_generate_image' : 'media_edit_image').execute(args, execution)
          assert.deepEqual(requests.at(-1), { kind: 'images', body: {
            model, prompt: args.prompt, aspect_ratio: '3:2', n: 2,
            ...(resolution ? { resolution } : { quality: 'auto', complexity: 'high', output_format: 'png' }),
            ...(intent === 'image_edit' ? { input_references: [{ slot_name: 'reference_1', image_url: { url: args.image } }] } : {}),
          } })
        }
      }
    }
    assert.equal(requests.length, 8)
  } finally {
    mod.TokensApiClient.prototype.submit = originalSubmit
    mod.TokensApiClient.prototype.poll = originalPoll
  }
})

test('H3 Image unconfirmed or changed resolution cannot upload or submit, and closing resolution cancels', async () => {
  const { mod, tools } = await createHarness()
  const originalSubmit = mod.TokensApiClient.prototype.submit
  const originalUpload = mod.TokensApiClient.prototype.uploadImage
  let effects = 0
  mod.TokensApiClient.prototype.submit = async () => { effects++; throw new Error('Unexpected submit') }
  mod.TokensApiClient.prototype.uploadImage = async () => { effects++; throw new Error('Unexpected upload') }
  try {
    for (const intent of ['image_gen', 'image_edit']) {
      const execution = execContext()
      const tool = tools.get(intent === 'image_gen' ? 'media_generate_image' : 'media_edit_image')
      const args = { model: 'minimax_h3_image', prompt: 'A scene', aspect_ratio: '1:1', n: 1,
        ...(intent === 'image_edit' ? { image: 'data:image/png;base64,unused' } : {}),
      }
      await assert.rejects(() => tool.execute(args, execution), /Missing confirmed resolution/)
      await confirmedToolArgs(tools, intent, { ...args, resolution: '2k' }, execution)
      await assert.rejects(() => tool.execute({ ...args, resolution: '1k' }, execution), /parameters changed after confirmation/)

      const { tools: cancelledTools } = await createHarness(() => { throw Object.assign(new Error('closed'), { code: 'ASK_CANCELLED' }) })
      const cancelledExecution = execContext()
      const cancelled = await cancelledTools.get('media_wizard').execute({ intent, known: { ...args, enhanced: false } }, cancelledExecution)
      assert.equal(cancelled.cancelled, true)
      assert.equal(cancelled.confirmed, false)
      await assert.rejects(() => cancelledTools.get(tool.name).execute({ ...args, resolution: '2k' }, cancelledExecution), /flow was cancelled/)
    }
    assert.equal(effects, 0)
  } finally {
    mod.TokensApiClient.prototype.submit = originalSubmit
    mod.TokensApiClient.prototype.uploadImage = originalUpload
  }
})

test('H3 Image first submission recovers the chosen 1k or 2k for both default generation and editing', async () => {
  const { TokensApiClient } = await import('../dist/index.js')
  const originalSubmit = TokensApiClient.prototype.submit, originalPoll = TokensApiClient.prototype.poll
  const requests = []
  TokensApiClient.prototype.submit = async (kind, body) => { requests.push({ kind, body }); return `confirmed-resolution-${requests.length}` }
  TokensApiClient.prototype.poll = async () => ({ timedOut: true, status: 'running', progress: 30 })
  try {
    for (const intent of ['image_gen', 'image_edit']) {
      for (const resolution of ['1k', '2k']) {
        const { tools } = await createHarness((questions) => ({ answers: questions.map((q) => ({
          id: q.id, selected: q.id === 'resolution' ? [resolution] : q.initialSelected ?? [],
        })) }), { defaultImageModel: 'minimax_h3_image', defaultEditModel: 'minimax_h3_image' })
        const execution = execContext()
        const wizard = await tools.get('media_wizard').execute({ intent, known: {
          prompt: 'An image from the confirmed wizard', enhanced: false, aspect_ratio: '9:16', n: 2,
          ...(intent === 'image_edit' ? { image: 'https://example.com/selected-reference.png' } : {}),
        } }, execution)
        assert.equal(wizard.confirmed, true)
        assert.equal(wizard.params.resolution, resolution)
        assert.equal(wizard.params.useDefaultModel, true)
        // Exact failure from the supplied session: model and resolution omitted.
        const args = { prompt: wizard.params.prompt, aspect_ratio: '9:16', n: 2 }
        const before = requests.length
        const output = await tools.get(intent === 'image_gen' ? 'media_generate_image' : 'media_edit_image').execute(args, execution)
        assert.equal(requests.length, before + 1)
        assert.equal(output.taskId, `confirmed-resolution-${requests.length}`)
        const { body } = requests.at(-1)
        assert.equal(body.model, 'minimax_h3_image')
        assert.equal(body.resolution, resolution)
        assert.equal(body.aspect_ratio, '9:16')
        assert.equal(body.n, 2)
        if (intent === 'image_edit') assert.equal(body.input_references[0].image_url.url, 'https://example.com/selected-reference.png')
        assert.equal(args.resolution, undefined, 'recover into a new object, leaving the logged call intact')
      }
    }
  } finally {
    TokensApiClient.prototype.submit = originalSubmit
    TokensApiClient.prototype.poll = originalPoll
  }
})

test('omitted optional model and reference inputs use the confirmed image/video choices', async () => {
  const { TokensApiClient } = await import('../dist/index.js')
  const originalSubmit = TokensApiClient.prototype.submit, originalPoll = TokensApiClient.prototype.poll
  const requests = []
  TokensApiClient.prototype.submit = async (kind, body) => { requests.push({ kind, body }); return `confirmed-input-${requests.length}` }
  TokensApiClient.prototype.poll = async () => ({ timedOut: true, status: 'running', progress: 30 })
  try {
    for (const intent of ['image_gen', 'image_edit', 'video_gen']) {
      const { tools } = await createHarness()
      const execution = execContext()
      const args = intent === 'video_gen'
        ? { prompt: 'A slow camera move', duration: 5, resolution: '1080p', aspect_ratio: '16:9', generate_audio: true }
        : { prompt: 'A detailed illustration', aspect_ratio: '3:2', n: 1 }
      const choices = intent === 'video_gen'
        ? { model: 'ltx_2_5', start_image: 'https://example.com/first.png', end_image: 'https://example.com/last.png' }
        : { model: 'gpt-image-2.6-flare', ...(intent === 'image_edit' ? { image: 'https://example.com/selected.png' } : {}) }
      await confirmedToolArgs(tools, intent, { ...args, ...choices }, execution)
      await tools.get(intent === 'image_gen' ? 'media_generate_image' : intent === 'image_edit' ? 'media_edit_image' : 'media_generate_video').execute(args, execution)
      const { body } = requests.at(-1)
      assert.equal(body.model, choices.model)
      if (intent === 'image_edit') assert.equal(body.input_references[0].image_url.url, choices.image)
      if (intent === 'video_gen') assert.deepEqual(body.frame_images.map((f) => f.image_url.url), [choices.start_image, choices.end_image])
      else assert.equal(body.resolution, undefined, 'never add the H3 default to Image 2.6')
    }
    assert.equal(requests.length, 3)
  } finally {
    TokensApiClient.prototype.submit = originalSubmit
    TokensApiClient.prototype.poll = originalPoll
  }
})

test('missing optional parameters never recover from another session, request, intent, or expired record', async () => {
  const { mod, tools } = await createHarness()
  const originalSubmit = mod.TokensApiClient.prototype.submit, originalUpload = mod.TokensApiClient.prototype.uploadImage
  let sideEffects = 0
  mod.TokensApiClient.prototype.submit = async () => { sideEffects++; throw new Error('Unexpected submission') }
  mod.TokensApiClient.prototype.uploadImage = async () => { sideEffects++; throw new Error('Unexpected upload') }
  const args = { model: 'minimax_h3_image', prompt: 'A selected scene', aspect_ratio: '1:1', n: 1 }
  const conversation = conversationExecution()
  try {
    await confirmedToolArgs(tools, 'image_gen', { ...args, resolution: '1k' }, conversation.execution)
    await assert.rejects(() => tools.get('media_generate_image').execute(args, execContext()), /Missing confirmed resolution/)
    await assert.rejects(() => tools.get('media_edit_image').execute(args, conversation.execution), /Missing confirmed resolution/)
    conversation.nextUserMessage()
    await assert.rejects(() => tools.get('media_generate_image').execute(args, conversation.execution), /Missing confirmed resolution/)
    const expired = execContext()
    await confirmedToolArgs(tools, 'image_gen', { ...args, resolution: '1k' }, expired)
    const originalNow = Date.now
    try {
      Date.now = () => originalNow() + 31 * 60 * 1000
      await assert.rejects(() => tools.get('media_generate_image').execute(args, expired), /Missing confirmed resolution/)
    } finally { Date.now = originalNow }
    assert.equal(sideEffects, 0)
  } finally {
    mod.TokensApiClient.prototype.submit = originalSubmit
    mod.TokensApiClient.prototype.uploadImage = originalUpload
  }
})

test('recovery never overwrites explicit mismatches or fills values after cancellation', async () => {
  let cancel = false
  const { mod, tools } = await createHarness((questions) => {
    if (cancel) throw Object.assign(new Error('closed'), { code: 'ASK_CANCELLED' })
    return { answers: questions.map(q => ({ id: q.id, selected: q.initialSelected ?? [] })) }
  })
  const originalSubmit = mod.TokensApiClient.prototype.submit, originalUpload = mod.TokensApiClient.prototype.uploadImage
  let sideEffects = 0
  mod.TokensApiClient.prototype.submit = async () => { sideEffects++; throw new Error('Unexpected submission') }
  mod.TokensApiClient.prototype.uploadImage = async () => { sideEffects++; throw new Error('Unexpected upload') }
  try {
    for (const intent of ['image_gen', 'image_edit']) {
      const execution = execContext()
      const args = { model: 'minimax_h3_image', prompt: 'A confirmed scene', aspect_ratio: '1:1', n: 1,
        ...(intent === 'image_edit' ? { image: 'https://example.com/selected.png' } : {}) }
      const tool = tools.get(intent === 'image_gen' ? 'media_generate_image' : 'media_edit_image')
      await confirmedToolArgs(tools, intent, { ...args, resolution: '1k' }, execution)
      for (const changes of [{ resolution: '2k' }, { n: 2 }, { aspect_ratio: '9:16' }, { prompt: 'Changed scene' }, { model: 'qwen_image' }, ...(intent === 'image_edit' ? [{ image: 'https://example.com/different.png' }] : [])]) {
        await assert.rejects(() => tool.execute({ ...args, ...changes }, execution), /parameters changed after confirmation/)
      }
      cancel = true
      const cancelled = await tools.get('media_wizard').execute({ intent, known: { ...args, resolution: '1k', enhanced: false } }, execution)
      assert.equal(cancelled.cancelled, true)
      await assert.rejects(() => tool.execute(args, execution), /Missing confirmed resolution|flow was cancelled/)
      cancel = false
    }
    const videoExecution = execContext()
    const videoArgs = { prompt: 'A confirmed camera move', duration: 5, resolution: '1080p', aspect_ratio: '16:9', generate_audio: true }
    await confirmedToolArgs(tools, 'video_gen', { ...videoArgs, model: 'ltx_2_5', start_image: 'https://example.com/first.png', end_image: 'https://example.com/last.png' }, videoExecution)
    await assert.rejects(() => tools.get('media_generate_video').execute({ ...videoArgs, start_image: 'https://example.com/changed.png' }, videoExecution), /parameters changed after confirmation/)
    await assert.rejects(() => tools.get('media_generate_video').execute({ ...videoArgs, generate_audio: false }, videoExecution), /requires generated audio/)
    assert.equal(sideEffects, 0)
  } finally {
    mod.TokensApiClient.prototype.submit = originalSubmit
    mod.TokensApiClient.prototype.uploadImage = originalUpload
  }
})

test('unanswered H3 Image resolution cannot complete confirmation', async () => {
  const known = { prompt: 'A scene', model: 'minimax_h3_image', aspect_ratio: '1:1', n: 1, enhanced: false }
  const { tools: unansweredTools } = await createHarness()
  const unanswered = await unansweredTools.get('media_wizard').execute({ intent: 'image_gen', known }, execContext())
  assert.equal(unanswered.confirmed, false)
  assert.equal(unanswered.params.resolution, undefined)
})

test('new models work as configured defaults without adding an explicit model argument', async () => {
  const { TokensApiClient, Config } = await import('../dist/index.js')
  const originalSubmit = TokensApiClient.prototype.submit
  const originalPoll = TokensApiClient.prototype.poll
  const requests = []
  TokensApiClient.prototype.submit = async (kind, body) => { requests.push({ kind, body }); return 'task_default_image' }
  TokensApiClient.prototype.poll = async () => ({ results: [] })
  try {
    for (const model of newImageModels) {
      const defaults = Config({ ...config, defaultImageModel: model, defaultEditModel: model })
      const { tools } = await createHarness(chooseDefaults, defaults)
      for (const intent of ['image_gen', 'image_edit']) {
        const execution = execContext()
        const result = await tools.get('media_wizard').execute({
          intent, known: { prompt: 'A scene', enhanced: false, image: 'https://example.com/input.png' },
        }, execution)
        assert.equal(result.confirmed, true)
        assert.equal(result.params.model, undefined)
        assert.equal(result.params.useDefaultModel, true)
        const { prompt, aspect_ratio, n, resolution } = result.params
        const args = { prompt, aspect_ratio, n, ...(resolution ? { resolution } : {}), ...(intent === 'image_edit' ? { image: result.params.image } : {}) }
        await tools.get(intent === 'image_gen' ? 'media_generate_image' : 'media_edit_image').execute(args, execution)
        assert.equal(requests.at(-1).body.model, model)
        assert.equal(requests.at(-1).body.resolution, model === 'minimax_h3_image' ? '2k' : undefined)
      }
    }
    assert.equal(requests.length, 6)
  } finally {
    TokensApiClient.prototype.submit = originalSubmit
    TokensApiClient.prototype.poll = originalPoll
  }
})

test('all media intents complete after the last parameter without a final review regardless of the legacy flag', async () => {
  const scenarios = [
    { intent: 'image_gen', model: 'minimax_h3_image', aspect_ratio: '1:1', resolution: '2k', n: 1 },
    { intent: 'image_edit', model: 'qwen_image', aspect_ratio: '16:9', n: 1, image: 'https://example.com/input.png' },
    { intent: 'video_gen', model: 'minimax_h3', aspect_ratio: '16:9', resolution: '720p', duration: 5, generate_audio: true },
  ]
  for (const { intent, ...params } of scenarios) {
    for (const skipFinalConfirmation of [undefined, false, true]) {
      const { tools, questionCalls } = await createHarness((questions) => {
        assert.deepEqual(questions.map((question) => question.id), ['prompt'])
        return chooseDefaults(questions)
      })
      const result = await tools.get('media_wizard').execute({
        intent, known: { ...params, prompt: 'A new scene', enhanced: false, ...(skipFinalConfirmation === undefined ? {} : { skipFinalConfirmation }) },
      }, execContext())
      assert.equal(result.confirmed, true)
      assert.equal(result.finalConfirmed, true)
      assert.deepEqual(questionCalls.flat().map((question) => question.id), ['prompt'])
    }
  }
})

test('reused image parameters are pruned against the final selected model', async () => {
  const scenarios = [
    { model: 'gpt-image-2.6-flare' },
    { model: 'qwen_image' },
    {}, // Choose Image2.6 after accepting prior settings without a historical model.
  ]
  for (const current of scenarios) {
    const { tools, questionCalls } = await createHarness((questions) => ({
      answers: questions.map((question) => ({ id: question.id, selected: question.id === 'model' ? ['gpt-image-2.6-sunburst'] : question.initialSelected ?? [] })),
    }))
    const result = await tools.get('media_wizard').execute({
      intent: 'image_edit', known: { ...current, prompt: 'A new scene', image: 'https://example.com/input.png', enhanced: false },
      previousTask: { intent: 'image_edit', params: { ...(current.model ? { model: 'minimax_h3_image' } : {}), aspect_ratio: '16:9', resolution: '2k', n: 2 } },
      reuse: { settings: true },
    }, execContext())
    assert.equal(result.confirmed, true)
    assert.equal(result.params.resolution, undefined)
    assert.equal(result.params.n, 2)
    assert.equal(result.params.aspect_ratio, current.model === 'qwen_image' ? '16:9' : '1:1')
    assert.equal(questionCalls.flat().some((question) => question.id === 'aspect_ratio'), current.model !== 'qwen_image')
  }
})
