import { test } from 'node:test'
import assert from 'node:assert/strict'

test('video capability matrix exposes only MiniMax H3 and LTX 2.5', async () => {
  const mod = await import('../dist/index.js')

  assert.deepEqual(mod.VIDEO_MODEL_IDS, [
    'minimax_h3',
    'ltx_2_5',
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
  for (const removed of ['ltx_2_3', 'seedance_2_0', 'seedance_2_5']) {
    assert.equal(mod.isVideoModel(removed), false)
    assert.equal(mod.VIDEO_MODEL_CAPABILITIES[removed], undefined)
  }
})

test('video capability matrix preserves the confirmed audio rules', async () => {
  const { VIDEO_MODEL_CAPABILITIES: capabilities } = await import('../dist/index.js')

  assert.equal(capabilities.ltx_2_5.audioMode, 'required')
  assert.equal(capabilities.minimax_h3.audioMode, 'required')
  assert.equal(capabilities.ltx_2_5.generateAudioParameter, 'required_true')
  assert.equal(capabilities.minimax_h3.generateAudioParameter, 'required_true')
})

test('video capability matrix preserves the remaining models output options', async () => {
  const { VIDEO_MODEL_CAPABILITIES: capabilities } = await import('../dist/index.js')

  assert.deepEqual(capabilities.ltx_2_5.durations, [5, 10])
  assert.deepEqual(capabilities.ltx_2_5.resolutions, ['720p', '1080p'])
  assert.equal(capabilities.ltx_2_5.resolutions.includes('1440p'), false)

  assert.deepEqual(capabilities.minimax_h3.durations, [5, 10])
  assert.deepEqual(capabilities.minimax_h3.resolutions, ['480p', '720p'])
})
