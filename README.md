# @tokensapi/dsh-media-gen

Context-aware TokensAPI image and video generation tools for DeepSeek Harness.

This package is maintained under the `@tokensapi` npm scope and is derived from the upstream [`@tokens/dsh-media-gen`](https://github.com/TokensAPI/tokens_DshMediaGen_code) project.

## Compatibility

The `0.3.x` series targets and is validated against:

- DeepSeek Harness / DSH `0.1.0-rc.8`
- Node.js `^22.19.0 || >=24.0.0`

Other DSH versions are not yet guaranteed.

## Features

- Text-to-image with 1, 2, or 4 results;
- Image editing;
- Text-to-video;
- Image-to-video, reference images, and first/last frames;
- DSH attachment-backed inline image rendering;
- Inline remote video playback plus local MP4 saving;
- Timed-out task status and result recovery;
- Context-aware missing-parameter media wizard;
- Direct current-conversation DSH attachment input with ordered multi-image selectors;
- TokensAPI presigned or configurable R2/S3 reference-image upload;
- Prompt enhancement enabled by default through TokensAPI (`deepseek-v4-flash`).

## Video models

| Model | Durations | Resolutions | Generated audio |
| --- | --- | --- | --- |
| `ltx_2_3` | 3, 5, 8 seconds | `720p` | Always enabled by the workflow |
| `seedance_2_0` | 5, 8, 10, 15 seconds | `480p`, `720p`, `1080p` | Optional; enabled by default |
| `ltx_2_5` | 5, 10 seconds | `720p`, `1080p` | Required and cannot be disabled |
| `seedance_2_5` | 5, 8, 10, 15 seconds | `720p`, `1080p` | Optional; enabled by default |
| `minimax_h3` | 5, 10 seconds | `480p`, `720p` | Required and cannot be disabled |

LTX 2.5 does not support `1440p` in this plugin. Seedance 2.5 first-frame and first/last-frame tasks use `adaptive`: the plugin explains it as automatically matching the input image ratio. For text-to-video, the `adaptive` option means the model chooses the output aspect ratio.

## Privacy

TokensAPI production task endpoints require publicly accessible HTTPS reference images. The plugin never uploads local images to third-party temporary hosts such as uguu.se or tmpfiles.org.

Local images and current-conversation DSH attachments use first-party storage. Starting with `0.3.5`, the default flow uses the existing TokensAPI API key to call `POST /v1/assets/images`, validates the returned upload method, signed headers, expiry, and HTTPS URLs, then sends the raw bytes from the Host directly to `upload_url`. The API key is never forwarded to S3, redirects are rejected, and `access_url` is used only after S3 returns a successful 2xx response. A configurable `storageBackend: r2` path remains available for direct Cloudflare R2/S3 uploads with Signature V4. No third-party temporary image host is used. DSH attachments are read through the official `attachments.readImage()` service rather than exposing or guessing original local paths.

## Installation

Register the package in the active DSH profile:

```yaml
- insert:
    - id: media-gen
      name: '@tokensapi/dsh-media-gen'
```

Configure the required DSH credential:

```text
TOKENSAPI_API_KEY
```

Prompt enhancement and first-party local-image upload both reuse `TOKENSAPI_API_KEY`; no separate DeepSeek or account access token is required by the default configuration. Legacy custom `/api/aigc/presign` deployments can still explicitly select `uploadAuthMode: account` and configure their account credential and user ID.

The `0.3.5` image-upload defaults are:

```yaml
imageUploadURL: https://tokensapi.ai/v1/assets/images
uploadAuthMode: api_key
```

## Defaults

Videos are saved to:

```text
<home>/Downloads/dsh-media-gen
```

Default models are configurable. The default video model is `minimax_h3`. Video choices keep the fixed order `minimax_h3`, `ltx_2_5`, `ltx_2_3`, `seedance_2_5`, `seedance_2_0`; only `minimax_h3` is labeled with plain `（推荐）` text by default. Other wizard choices do not show a recommendation marker. When the user does not explicitly choose a model, tool calls should omit the model field and let the plugin default apply.

Video wizard choices are driven by the selected model capability. Fixed-audio models show the audio status without a switch. Seedance models ask whether to generate audio and default to enabled. The final confirmation includes the selected model, frame inputs, duration, resolution, aspect ratio, and audio status.

Starting with `0.3.4`, current-request values are separated from reusable values found in the most recent same-intent task. Ambiguous follow-ups ask independently before reusing the prior Prompt, reference images or frame inputs, and generation settings. Explicit current-request values always win, and historical media is never selected silently.

Media submissions in `0.3.4` retain one in-process idempotency operation while the request is uncertain or its task is still running. Network failures and HTTP 429 responses therefore retry only with the same idempotency key; a returned `task_id` switches permanently to status polling. Transient polling failures use bounded backoff, unchanged progress remains a running state, and foreground timeouts return the task ID for `media_task_status` recovery instead of authorizing another submission.

## Development

```bash
pnpm install
pnpm run typecheck
pnpm test
pnpm run build
pnpm run pack:dry
```

## Limitations

- Only DSH `0.1.0-rc.8` is supported by the initial release.
- DSH `rc.8` has no video attachment type. The plugin therefore serves saved MP4 files through a restricted same-origin `/media-gen/videos/` route with byte-range support; remote TokensAPI URLs remain the fallback.
- Public generation task endpoints do not directly accept Data URLs. Local images are converted and sent through TokensAPI presigned object storage before task submission.
- Submission recovery state is currently process-local and is not written to a task journal. Restarting DSH/TokensCowork clears uncertain submissions that never returned a `task_id`; known task IDs remain recoverable when retained in conversation history.
