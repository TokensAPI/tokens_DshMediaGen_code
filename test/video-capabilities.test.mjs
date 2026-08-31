import { test } from 'node:test'
import assert from 'node:assert/strict'

test('video capability matrix defines the 0.3.3 model set', async () => {
  const mod = await import('../dist/index.js')

  assert.deepEqual(mod.VIDEO_MODEL_IDS, [
    'minimax_h3',
    'ltx_2_5',
    'ltx_2_3',
    'seedance_2_5',
    'seedance_2_0',
  ])

  for (const model of mod.VIDEO_MODEL_IDS) {
    const capability = mod.videoModelCapability(model)
    assert.equal(capability, mod.VIDEO_MODEL_CAPABILITIES[model])
    assert.equal(mod.isVideoModel(model), true)
    assert.ok(capability.durations.includes(capability.defaultDuration))
    assert.ok(capability.resolutions.includes(capability.defaultResolution))
    assert.ok(capability.aspectRatios.includes(capability.defaultAspectRatio))
    assert.equal(capability.defaultAudioEnabled, true)
    assert.deepEqual(capability.inputModes, ['text', 'first_frame', 'first_last_frame'])
  }

  assert.equal(mod.isVideoModel('unknown_video_model'), false)
})

test('video capability matrix preserves the confirmed audio rules', async () => {
  const { VIDEO_MODEL_CAPABILITIES: capabilities } = await import('../dist/index.js')

  assert.equal(capabilities.ltx_2_3.audioMode, 'required')
  assert.equal(capabilities.ltx_2_5.audioMode, 'required')
  assert.equal(capabilities.minimax_h3.audioMode, 'required')
  assert.equal(capabilities.seedance_2_0.audioMode, 'optional')
  assert.equal(capabilities.seedance_2_5.audioMode, 'optional')

  assert.equal(capabilities.ltx_2_3.generateAudioParameter, 'omit')
  assert.equal(capabilities.ltx_2_5.generateAudioParameter, 'required_true')
  assert.equal(capabilities.minimax_h3.generateAudioParameter, 'required_true')
  assert.equal(capabilities.seedance_2_0.generateAudioParameter, 'optional')
  assert.equal(capabilities.seedance_2_5.generateAudioParameter, 'optional')
})

test('video capability matrix exposes only the approved 0.3.3 output options', async () => {
  const { VIDEO_MODEL_CAPABILITIES: capabilities } = await import('../dist/index.js')

  assert.deepEqual(capabilities.ltx_2_3.durations, [3, 5, 8])
  assert.deepEqual(capabilities.ltx_2_3.resolutions, ['720p'])

  assert.deepEqual(capabilities.ltx_2_5.durations, [5, 10])
  assert.deepEqual(capabilities.ltx_2_5.resolutions, ['720p', '1080p'])
  assert.equal(capabilities.ltx_2_5.resolutions.includes('1440p'), false)

  assert.deepEqual(capabilities.seedance_2_5.durations, [5, 8, 10, 15])
  assert.deepEqual(capabilities.seedance_2_5.resolutions, ['720p', '1080p'])
  assert.equal(capabilities.seedance_2_5.requiredAspectRatioByInputMode.first_frame, 'adaptive')
  assert.equal(capabilities.seedance_2_5.requiredAspectRatioByInputMode.first_last_frame, 'adaptive')

  assert.deepEqual(capabilities.minimax_h3.durations, [5, 10])
  assert.deepEqual(capabilities.minimax_h3.resolutions, ['480p', '720p'])
})
