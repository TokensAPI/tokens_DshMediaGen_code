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

## Privacy

TokensAPI production task endpoints require publicly accessible HTTPS reference images. The plugin never uploads local images to third-party temporary hosts such as uguu.se or tmpfiles.org.

Local images and current-conversation DSH attachments use first-party storage. The default flow uses `POST /api/aigc/presign`, raw-byte `PUT` to `upload_url`, then `access_url` in the generation request. A configurable `storageBackend: r2` path signs direct Cloudflare R2/S3 uploads with Signature V4. No third-party temporary image host is used. DSH attachments are read through the official `attachments.readImage()` service rather than exposing or guessing original local paths.

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

Prompt enhancement is enabled by default and reuses `TOKENSAPI_API_KEY` with `https://tokensapi.ai/v1` and `deepseek-v4-flash`; no separate `DEEPSEEK_API_KEY` is required. Production local-image upload additionally requires `TOKENSAPI_ACCOUNT_ACCESS_TOKEN` plus `accountUserId`, unless the server enables API-key authentication for `/api/aigc/presign`.

## Defaults

Videos are saved to:

```text
<home>/Downloads/dsh-media-gen
```

Default models are configurable. When the user does not explicitly choose a model, tool calls should omit the model field and let the plugin default apply.

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
- The current production presign route uses account authentication; an `sk-...` API key alone is rejected until the server enables `TokenOrUserAuth`.
