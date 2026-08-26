# Changelog

## 0.2.2

- Enabled prompt enhancement by default.
- Reused `TOKENSAPI_API_KEY` for prompt enhancement by default.
- Changed the default enhancement endpoint to `https://tokensapi.ai/v1` and the default enhancement model to `deepseek-v4-flash`.
- Kept the verified video model list unchanged (`ltx_2_3`, `seedance_2_0`).

## 0.2.1

- Replaced the duplicate generic default-model wizard option with a single named option such as `z_image_turbo（插件默认，推荐）`.
- Added a complete Chinese tarball distribution, installation, credential, restart, verification, and troubleshooting guide.

## 0.2.0

- Rebuilt the plugin as a formal source project with reproducible builds.
- Locked initial compatibility to DeepSeek Harness 0.1.0-rc.8.
- Added multi-image result handling and DSH attachment rendering.
- Added attachment-first image loading with remote URL fallback.
- Removed third-party temporary image hosts.
- Added TokensAPI first-party presigned local-image upload (`presign` POST → raw-byte PUT → `access_url`) with account and API-key authentication modes; public task APIs continue to receive HTTPS reference URLs.
- Corrected image-conditioned video requests to the documented `frame_images` protocol.
- Added video local saving, a restricted same-origin MP4 route with byte-range support, adaptive player aspect ratios, and explicit remote/local fallbacks.
- Added task-result recovery for completed image and video jobs.
- Replaced public image pixel-size choices with documented aspect ratios only.
- Restricted image editing to the supported `image2` and `qwen_image` models across configuration, wizard choices, tool schema, and runtime validation; `z_image_turbo` remains text-to-image only.
- Added a strict ordered wizard state machine requiring prompt, model-strategy, and one final full-summary confirmation; removed the redundant separate output-parameter confirmation. Default-model selection omits the `model` tool argument.
- Added model-aware video parameter choices: LTX workflow-default resolution and 3/5/8-second durations; Seedance 480p/720p/1080p resolution and 5/8/10/15-second durations.
- Added package metadata, tests, bilingual documentation, and cross-machine defaults.
