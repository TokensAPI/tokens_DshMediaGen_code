# Changelog

## 0.3.5

- Limited the `（推荐）` marker to the default model in model-selection questions, changed the default recommended video model to `minimax_h3`, and left all other wizard choices and the final summary unmarked.
- Switched the default first-party image upload endpoint to `POST /v1/assets/images` with the existing `TOKENSAPI_API_KEY`.
- Added strict parsing and validation for `upload_url`, `access_url`, `upload_method`, `required_headers`, and `upload_expires_at` while retaining the legacy `{ success, data }` response as an explicit compatibility path.
- Moved the complete S3 upload operation into the Host with raw image bytes, exact signed headers, disabled redirects, and acceptance of any successful HTTP 2xx response.
- Added safeguards for HTTPS URLs, signed content length/type, expiry margin, duplicate or malformed headers, and sensitive identity headers that must never be forwarded to S3.
- Added clear signing failures for HTTP 400/401/403/413/429/503 and prevented invalid grants or failed object uploads from reaching media task submission.
- Added parser, validation, Host upload, API-key isolation, legacy-account compatibility, and failure-path tests without making real TokensAPI, S3, or paid generation requests.

## 0.3.4

- Added an explicit context-reuse consent gate for prior Prompt, reference images or frame inputs, and generation settings.
- Separated current-request parameters from historical same-intent task candidates so new media tasks no longer silently inherit previous values.
- Added per-category explicit reuse/reset decisions, current-request precedence, compatibility filtering, and reuse-source summaries.
- Replaced the UI-triggering English recommendation suffix with plain `（推荐）` text across wizard choices, and renamed default-model labels from `（插件默认）` to `（推荐）`.
- Added the complete current Prompt and its source to the Prompt-enhancement question before the user chooses whether to enhance it.
- Reused one idempotency key for every retry of the same in-process media submission, including repeated tool calls whose uploaded reference URLs changed.
- Adopted task IDs returned by HTTP 429 responses, respected `Retry-After`, and prevented known or uncertain submissions from silently creating a new task.
- Added transient status-poll recovery with bounded backoff for network failures, HTTP 408/425/429, and server errors; unchanged progress no longer implies failure.
- Preserved the task ID, last status, and progress when foreground polling times out so the existing `media_task_status` tool can recover the result without resubmission.
- Added network-failure, idempotency, 429, stalled-progress, timeout, and non-retryable-error regression tests without making paid production calls.

## 0.3.3

- Added `ltx_2_5`, `seedance_2_5`, and `minimax_h3` to the video model catalog while retaining `ltx_2_3` and `seedance_2_0`.
- Added a shared video capability matrix for model-specific durations, resolutions, aspect ratios, frame-input modes, and generated-audio behavior.
- Added dynamic wizard choices and validation for all five video models, including explanatory `adaptive` labels for Seedance 2.5.
- Marked LTX 2.3, LTX 2.5, and MiniMax H3 audio as fixed on; Seedance 2.0 and Seedance 2.5 expose an audio switch that defaults to enabled.
- Added model-aware request construction: LTX 2.3 omits the audio parameter, LTX 2.5 and MiniMax H3 send `generate_audio: true`, and Seedance forwards the selected boolean.
- Restricted LTX 2.5 to `720p` and `1080p`; `1440p` is not exposed or accepted by the plugin.
- Added pre-submission validation for invalid durations, resolutions, aspect ratios, frame combinations, and attempts to disable required audio.
- Added capability, wizard, request-body, `adaptive`-label, and regression tests without making paid production generation calls.
- Set `ltx_2_5` as the default video model while keeping the fixed display order `minimax_h3`, `ltx_2_5`, `ltx_2_3`, `seedance_2_5`, `seedance_2_0`.
- Removed the recommendation badge from the video model list; the default model now uses a plain `（插件默认）` label.

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
