# Changelog

## 0.3.2

- Added a compact in-image download icon to generated and edited image result cards.
- Reused the existing restricted same-origin download route for TokensAPI S3 images and direct Blob downloads for conversation attachments.
- Added a client-bundle regression test to prevent the image download action from disappearing from future releases.

## 0.3.1

- Fixed the web client bundle to register `@tokensapi/dsh-media-gen`, matching the published package name and preventing Harness plugin-loader startup failures.
- Added build-time and test-time checks that reject future package-name and client-module-ID mismatches.

## 0.3.0

- Published under the `@tokensapi` npm scope with clear attribution to the upstream `@tokens/dsh-media-gen` project.
- Added direct image editing from current DSH conversation attachments through the official attachment store.
- Added latest, first, last, 1-based, and current-session attachment-id selectors for uploaded images.
- Added context-aware intent and parameter extraction guidance and a missing-parameter-only media wizard.
- Added known-parameter normalization and model-aware validation for models, aspect ratios, counts, durations, resolutions, and input-image roles.
- Removed redundant confirmation for unchanged user prompts while retaining confirmation for enhanced prompts.
- Added explicit final-confirmation skipping only when requested by the user.
- Added R2/S3 reference-image upload support alongside TokensAPI presigned upload.
- Added focused context-wizard and conversation-attachment regression tests.

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
