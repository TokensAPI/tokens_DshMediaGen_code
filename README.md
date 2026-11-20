# @tokensapi/dsh-media-gen

Context-aware TokensAPI image and video generation tools for DeepSeek Harness.

This package is maintained under the `@tokensapi` npm scope and is derived from the upstream [`@tokens/dsh-media-gen`](https://github.com/TokensAPI/tokens_DshMediaGen_code) project.

## Compatibility

Version `0.3.14` declares compatibility with the DSH runtime lines used by supported TokensCowork releases:

- DeepSeek Harness / DSH `0.1.0-rc.8`, `0.1.3-alpha.1`, `^0.1.5-rc.2` (TokensCowork 0.5.25), and `0.2.1-rc.2` (TokensCowork 0.7.13 / 0.7.18)
- Cordis `>=4.0.1 <5`
- Node.js `^22.19.0 || >=24.0.0`

The obsolete `@deepseek-ai/dsh-client-runtime` peer is not required by the client bundle and is not present in TokensCowork 0.5.1. Other DSH prerelease lines are not yet guaranteed.

## Features

- Text-to-image with 1, 2, or 4 results;
- Image editing;
- Text-to-video;
- Image-to-video, reference images, and first/last frames;
- DSH attachment-backed inline image rendering;
- Inline video playback and explicit downloads;
- Timed-out task status and result recovery;
- Context-aware missing-parameter media wizard;
- Chinese and English wizard and result-card UI that automatically follows the active TokensCowork language;
- Chinese and English marketplace names and summaries that follow the active TokensCowork language;
- Direct current-conversation DSH attachment input with ordered multi-image selectors;
- TokensAPI presigned or configurable R2/S3 reference-image upload;
- Prompt enhancement enabled by default through TokensAPI (`deepseek-v4-flash`).

## Video models

| Model | Durations | Resolutions | Generated audio |
| --- | --- | --- | --- |
| `minimax_h3` | 5, 10 seconds | `480p`, `720p` | Required and cannot be disabled |
| `ltx_2_5` | 5, 10 seconds | `720p`, `1080p` | Required and cannot be disabled |

LTX 2.5 does not support `1440p` in this plugin. Version `0.3.14` removes LTX 2.3 and both Seedance models from the wizard and generation tools. Stored defaults pointing at a removed model normalize to MiniMax H3 in memory; explicit requests for removed models are rejected, and their historical settings require a fresh selection. Existing task IDs can still be recovered.

## Image models

| Model | Text-to-image | Image editing | Output options |
| --- | --- | --- | --- |
| `z_image_turbo` | Yes | No | Existing ratio and count controls |
| `qwen_image` | Yes | Yes | Existing ratio and count controls |
| `minimax_h3_image` | Yes | Yes | Seven ratios; `1k` / `2k`, default `2k` |
| `gpt-image-2.6-sunburst` | Yes | Yes | Exact ratios `1:1`, `3:2`, `2:3` |
| `gpt-image-2.6-flare` | Yes | Yes | Exact ratios `1:1`, `3:2`, `2:3` |

All image models keep the existing 1 / 2 / 4 output count selector and single-reference editing flow. H3 Image exposes `1:1`, `16:9`, `9:16`, `4:3`, `3:4`, `3:2`, and `2:3`; its confirmed resolution must be copied to the final tool call. Image2.6 uses PNG output with `quality: auto` and `complexity: high`, with no resolution selector. The new models use the same upload, confirmation, cancellation, task recovery, inline results, and download flow. Model availability and access remain subject to the TokensAPI account.

If a final tool call omits an optional parameter, the plugin can recover it only from the same Session, user request, and intent's live wizard confirmation. This preserves the selected H3 Image resolution rather than guessing 2k, and retains selected models and image/video references. Explicitly different values still fail before uploads or submission. Cancelled, expired, missing, or other-request confirmations cannot supply values; schema-required fields remain required.

## Privacy

TokensAPI production task endpoints require publicly accessible HTTPS reference images. The plugin never uploads local images to third-party temporary hosts such as uguu.se or tmpfiles.org.

Local images and current-conversation DSH attachments use first-party storage. Starting with `0.3.5`, the default flow uses the existing TokensAPI API key to call `POST /v1/assets/images`, validates the returned upload method, signed headers, expiry, and HTTPS URLs, then sends the raw bytes from the Host directly to `upload_url`. The API key is never forwarded to S3, redirects are rejected, and `access_url` is used only after S3 returns a successful 2xx response. A configurable `storageBackend: r2` path remains available for direct Cloudflare R2/S3 uploads with Signature V4. No third-party temporary image host is used. DSH attachments are read through the official `attachments.readImage()` service rather than exposing or guessing original local paths.

## Installation

Install from the TokensAPI private registry for your TokensCowork organization:

```bash
npm install @tokensapi/dsh-media-gen@0.3.14 --registry=https://npm.tokensapi.ai/
```

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

The plugin ships one bilingual client bundle rather than separate language packages. Its wizard, summaries, buttons, image cards, and video cards follow the language selected in TokensCowork. Localized labels are display-only: answers sent back to the Host retain their stable original values, so switching languages does not change model selection, confirmation, or generation parameters.

Starting with `0.3.13`, package-level `tokenscowork.displayName` and `tokenscowork.summary` metadata also provide Chinese and English market-card text. Compatible Community Plugin Market servers read this metadata from the published package and choose the text using the requested locale; users may need to refresh the market after its catalog cache expires. This does not automatically update their installed plugin.

The `0.3.5` image-upload defaults are:

```yaml
imageUploadURL: https://tokensapi.ai/v1/assets/images
uploadAuthMode: api_key
```

## Defaults

The default download output directory is:

```text
<home>/Downloads/dsh-media-gen
```

Completed videos are streamed inline without being saved automatically; users can download them explicitly.

Default models are configurable: `minimax_h3_image` for generation, `qwen_image` for editing, and `minimax_h3` for video. Video choices keep the fixed order `minimax_h3`, `ltx_2_5`; only the configured default model is labeled with plain `（推荐）` text. Other wizard choices do not show a recommendation marker. Choosing the default model keeps the model field omitted in final tool calls.

Wizard choices are driven by the selected model capability. Both video models use fixed enabled audio without a switch. Clicking a single-choice option advances immediately, including the last option in a question group. Highlighted defaults remain available through Space / Enter, Continue, or Skip. After all required choices are complete, generation proceeds without a final parameter-review question. Enhanced prompts still show their original / enhanced comparison for selection. Closing the wizard before completion cancels the flow. The legacy `skipFinalConfirmation` input remains accepted but no longer changes behavior.

After any required history-reuse consent, the wizard always shows the prompt card. Existing prompt text is fully displayed with “Use current prompt” selected by default; users can click it to continue or enter an edited multiline prompt and click Next. A missing prompt must be entered before continuing. Reference-image and frame-input cards offer explicit choices with a default when conversation images exist; missing external inputs must still be supplied. Friendly names such as H3 Image and Image 2.6 Flare are display labels only, preserving API model IDs.

Images, image edits, and videos show a generating card directly in chat while the tool runs. A foreground polling timeout remains a processing state with the task ID retained. S3 video playback uses the plugin Host's TLS 1.2 streaming route with byte ranges and HEAD support, without automatically saving the full video. Retry playback reloads the same result and never submits another generation task.

Click a generated or edited inline image to open the in-app preview. The preview supports fit-to-window, actual-size inspection, zoom controls, scrolling, and Escape / close-button dismissal. The download icon remains a separate action.

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

- Version `0.3.14` supports the declared DSH runtime lines above; other prerelease lines require separate validation.
- DSH `rc.8` has no video attachment type. The plugin therefore serves saved MP4 files through a restricted same-origin `/media-gen/videos/` route with byte-range support; remote TokensAPI URLs remain the fallback.
- Public generation task endpoints do not directly accept Data URLs. Local images are converted and sent through TokensAPI presigned object storage before task submission.
- Submission recovery state is currently process-local and is not written to a task journal. Restarting DSH/TokensCowork clears uncertain submissions that never returned a `task_id`; known task IDs remain recoverable when retained in conversation history.
