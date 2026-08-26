# @tokens/dsh-media-gen

TokensAPI image and video generation tools for DeepSeek Harness.

## Compatibility

The `0.2.x` series targets and is validated against:

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
- Guided media wizard;
- Prompt enhancement enabled by default through TokensAPI (`deepseek-v4-flash`).

## Privacy

TokensAPI production task endpoints require publicly accessible HTTPS reference images. The plugin never uploads local images to third-party temporary hosts such as uguu.se or tmpfiles.org.

Local images use the TokensAPI first-party presigned flow: `POST /api/aigc/presign`, raw-byte `PUT` to `upload_url`, then `access_url` in the generation request. No third-party image host is used. Production currently requires an account access token and numeric user id; the plugin also supports API-key mode for deployments that enable `TokenOrUserAuth` on the presign route.

## Installation

Register the package in the active DSH profile:

```yaml
- insert:
    - id: media-gen
      name: '@tokens/dsh-media-gen'
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
