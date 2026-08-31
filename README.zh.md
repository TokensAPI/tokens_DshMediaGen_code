# @tokensapi/dsh-media-gen

面向 DeepSeek Harness 的上下文感知 TokensAPI 图片与视频生成插件。

本包发布在 `@tokensapi` npm scope 下，基于上游 [`@tokens/dsh-media-gen`](https://github.com/TokensAPI/tokens_DshMediaGen_code) 项目继续开发。

## 兼容性

`0.3.x` 系列锁定并验证：

- DeepSeek Harness / DSH `0.1.0-rc.8`
- Node.js `^22.19.0 || >=24.0.0`

其他 DSH 版本尚未承诺兼容。

## 功能

- 文生图，支持一次生成 1、2 或 4 张；
- 图片编辑（仅 `image2` 和 `qwen_image`；`z_image_turbo` 仅支持文生图）；
- 文生视频；
- 图生视频、参考图视频和首尾帧视频；
- 图片保存为 DSH 会话附件并内联展示；
- 视频外链内联播放并保存本地 MP4；
- 任务超时后查询并恢复结果；
- 引导式媒体参数向导；
- 可选提示词增强。

## 视频模型

| 模型 | 时长 | 分辨率 | 生成音频 |
| --- | --- | --- | --- |
| `ltx_2_3` | 3、5、8 秒 | `720p` | 工作流固定开启 |
| `seedance_2_0` | 5、8、10、15 秒 | `480p`、`720p`、`1080p` | 可选，默认开启 |
| `ltx_2_5` | 5、10 秒 | `720p`、`1080p` | 强制开启，不能关闭 |
| `seedance_2_5` | 5、8、10、15 秒 | `720p`、`1080p` | 可选，默认开启 |
| `minimax_h3` | 5、10 秒 | `480p`、`720p` | 强制开启，不能关闭 |

LTX 2.5 不支持 `1440p`，插件不会显示或提交该分辨率。Seedance 2.5 使用首帧或首尾帧时，画面比例自动设为 `adaptive（自动匹配输入图片比例）`；纯文生视频的比例选项显示为 `adaptive（模型自动选择画面比例）`。

## 隐私

TokensAPI 生产任务接口要求参考图片是公开可访问的 HTTPS URL。插件不会把本地图片上传到 `uguu.se`、`tmpfiles.org` 或其他第三方临时图床。

本地图片和当前对话中的 DSH 图片附件使用第一方存储上传，不经过第三方临时图床。默认模式向 TokensAPI `/api/aigc/presign` 申请 `upload_url` 和 `access_url`，再用原始字节 `PUT`；也可以配置 `storageBackend: r2`，通过 S3 Signature V4 将图片直接上传到自己的 Cloudflare R2/S3 兼容存储，并把 CDN URL 提交给模型。聊天附件始终通过 DSH 官方 `attachments.readImage()` 接口读取和校验，不暴露或猜测用户原始文件路径。

## 分发与安装

### 打包方：生成可分发安装包

在插件源码目录执行：

```bash
npm run pack:dry
npm pack
```

`pack:dry` 会先执行 TypeScript 检查、测试、Host/Client 构建以及 npm 包内容预检。`npm pack` 随后生成类似下面的安装包：

```text
tokens-dsh-media-gen-<版本号>.tgz
```

只需把这个 `.tgz` 文件发给其他用户，不要复制整个 `node_modules`。安装包不应包含任何 API Key、账户令牌或个人绝对路径；每位用户都应配置自己的凭据。

### 使用方：安装 `.tgz`

安装前先完全退出 TokensHarness。假设安装包位于下载目录，在目标机器执行：

```bash
cd ~/.dsh/profiles
npm install ~/Downloads/tokens-dsh-media-gen-<版本号>.tgz
```

也可以使用 pnpm：

```bash
cd ~/.dsh/profiles
pnpm add ~/Downloads/tokens-dsh-media-gen-<版本号>.tgz
```

安装后，包通常位于：

```text
~/.dsh/profiles/node_modules/@tokensapi/dsh-media-gen
```

如果目标机器使用其他 DSH profile，应在实际启用的 profile 目录中安装，不能仅凭目录名称推断当前 profile。

### 注册插件

在目标 DSH profile 的 `cordis.patch.yml` 中注册：

```yaml
- insert:
    - id: media-gen
      name: '@tokensapi/dsh-media-gen'
```

如果文件中已经存在同一个 `insert` 列表，可把 `media-gen` 加入现有列表，避免创建冲突或重复的 YAML 结构。插件包本身也包含 `cordis.patch.yml`，支持 DSH bundle 安装机制。

最简配置就是上面的注册项。需要覆盖默认值时，可增加 `config`：

```yaml
- insert:
    - id: media-gen
      name: '@tokensapi/dsh-media-gen'
      config:
        defaultImageModel: z_image_turbo
        defaultEditModel: qwen_image
        defaultVideoModel: ltx_2_5
        enhanceEnabled: true
```

不要复制其他电脑的 `outputDir` 等绝对路径；省略 `outputDir` 时，插件会自动使用当前用户的 `~/Downloads/dsh-media-gen`。

### 重启和安装验证

安装、注册和凭据配置完成后，完全退出并重新打开 TokensHarness。只刷新页面不一定会重新加载 Host 插件。

在新对话中依次测试：

```text
我要生图
我要编辑图片
我要生成视频
```

文生图模型步骤应显示：

- `z_image_turbo（插件默认，推荐）`
- `image2`
- `qwen_image`

图片编辑应显示 `qwen_image（插件默认，推荐）` 和 `image2`；视频模型固定显示为 `minimax_h3`、`ltx_2_5（插件默认）`、`ltx_2_3`、`seedance_2_5`、`seedance_2_0`。视频模型不再显示绿色“推荐”标记，默认模型是 `ltx_2_5`，但不会被强制移到列表首位。选择带“插件默认”标记的选项时，工具调用不会显式传入 `model`，而是由插件当前配置决定模型。

### 常见安装问题

1. 确认 DSH 和 Node.js 版本符合“兼容性”章节；
2. 确认安装包安装到了当前实际启用的 DSH profile；
3. 确认 `cordis.patch.yml` 的 YAML 缩进正确且插件没有重复注册；
4. 确认已经完全重启 TokensHarness，而不是只刷新页面；
5. 确认凭据名称准确，例如 `TOKENSAPI_API_KEY`；
6. 不要把打包方电脑上的绝对路径复制到目标机器；
7. 若文生图可用但本地图片编辑失败，检查“本地图片上传凭据”配置。

## 凭据

必须在 DSH credentials 中配置：

```text
TOKENSAPI_API_KEY
```

提示词增强默认开启，并默认复用现有的 `TOKENSAPI_API_KEY`，通过 `https://tokensapi.ai/v1` 的 `deepseek-v4-flash` 模型增强图片和视频 Prompt，不需要额外配置 `DEEPSEEK_API_KEY`。如需使用其他兼容 OpenAI Chat Completions 的增强服务，可覆盖 `enhanceApiKeyEnv`、`enhanceBaseURL` 和 `enhanceModel`。

本地图片预签名上传当前生产环境默认需要额外配置账户身份：

```text
TOKENSAPI_ACCOUNT_ACCESS_TOKEN
```

并在插件配置中填写数字用户 ID：

```yaml
- insert:
    - id: media-gen
      name: '@tokensapi/dsh-media-gen'
      config:
        uploadAuthMode: account
        accountUserId: "你的数字用户ID"
```

如果 TokensAPI 将 `/api/aigc/presign` 改为 `TokenOrUserAuth`，可以只使用现有的 `TOKENSAPI_API_KEY`：

```yaml
- insert:
    - id: media-gen
      name: '@tokensapi/dsh-media-gen'
      config:
        uploadAuthMode: api_key
```

文生图、文生视频和使用公开 HTTPS 图片通常不需要这组本地上传身份。不要把自己的 API Key、账户令牌或用户 ID 写进安装包后分享给别人。

## 默认配置

```yaml
baseURL: https://tokensapi.ai/v1
apiKeyEnv: TOKENSAPI_API_KEY
outputDir: <用户主目录>/Downloads/dsh-media-gen
pollIntervalMs: 5000
maxPollMs: 720000
defaultImageModel: z_image_turbo
defaultEditModel: qwen_image
defaultVideoModel: ltx_2_5
enhanceEnabled: true
enhanceApiKeyEnv: TOKENSAPI_API_KEY
enhanceBaseURL: https://tokensapi.ai/v1
enhanceModel: deepseek-v4-flash
allowLocalImageInput: true
maxInputImageBytes: 31457280
imageUploadURL: https://tokensapi.ai/api/aigc/presign
uploadAuthMode: account
accountAccessTokenEnv: TOKENSAPI_ACCOUNT_ACCESS_TOKEN
accountUserId: ""
storageBackend: presign
r2Endpoint: ""
r2Region: auto
r2AccessKeyEnv: R2_ACCESS_KEY_ID
r2SecretKeyEnv: R2_SECRET_ACCESS_KEY
r2Bucket: ""
r2CdnBase: ""
r2PathPrefix: inputs
```

可以在 profile 中覆盖配置：

```yaml
- insert:
    - id: media-gen
      name: '@tokensapi/dsh-media-gen'
      config:
        outputDir: /your/media/output
        enhanceEnabled: true
```

不要复制其他电脑的绝对路径。

## 媒体向导

图片生成、图片编辑和视频生成前都要调用上下文感知向导。调用方应先把用户已经提供或可无歧义推断的 Prompt、聊天附件、模型、比例、数量、时长、分辨率和增强偏好放入 `known`；向导只补问缺失参数。未被增强服务改写的用户 Prompt 不重复确认，增强后的 Prompt 会显示前后对照；默认保留一次完整摘要最终确认，只有用户明确要求直接执行时才允许跳过。选择插件默认模型时，生成工具不传 `model`；只有用户明确选择具体模型时才传入。

图片生成只展示 TokensAPI 支持的画面比例，不显示像素分辨率：`1:1`、`16:9`、`9:16`、`4:3`、`3:4`、`3:2`、`2:3`。

视频输出参数根据所选模型能力动态显示，包括画面比例、时长、分辨率和音频状态。`ltx_2_3`、`ltx_2_5` 和 `minimax_h3` 固定生成音频，不提供关闭选项；`seedance_2_0` 和 `seedance_2_5` 提供音频开关并默认开启。Seedance 2.5 的首帧和首尾帧任务自动使用 `adaptive`。用户已经给出纯文本视频 Prompt 且没有图片输入时，向导直接推断为纯文生视频，不再额外询问视频类型。最终摘要会列出任务类型、图片输入、Prompt 来源和增强状态、模型、完整输出参数与音频状态；`skipFinalConfirmation` 只应在用户明确要求直接执行时使用。

任一步取消或缺少确认时，向导不会完成，也不会创建生成任务。

## 图片输入

生产任务始终支持公开 HTTPS URL。

配置有效的预签名或 R2 上传后，还支持 Base64/Data URL、DSH Host 可以读取的本地图片路径，以及当前对话中的用户图片附件。聊天附件选择器包括 `dsh-attachment:latest`、`dsh-attachment:first`、`dsh-attachment:last`、1-based 数字（如 `dsh-attachment:2`）、`dsh-attachment:index:N` 和当前会话附件 ID（`sha256:` 前缀可省略）。图片编辑省略 `image` 时默认使用最近一张用户图片；当前对话只有一张用户图片时向导可自动选择，有多张且角色不明确时必须补问，不能猜测最近一张。附件通过 `attachments.readImage` 在当前会话范围内读取。视频的 `image_url`、`start_image`、`end_image` 和 `reference_images` 也支持这些选择器，但当前生产视频契约仍不接受通用 `reference_images`，应优先使用首帧/尾帧字段。支持 PNG、JPEG、WebP、GIF，最大 30 MB。HTTP 明文 URL 会被拒绝。上传流程在创建生成任务之前完成，鉴权失败不会调用模型或产生生成费用。

## 图片显示

图片卡片优先读取 DSH 会话附件。附件读取失败时才回退到 TokensAPI 外部 URL。因此页面刷新后，历史图片仍可从会话附件恢复。

## 视频显示

DSH `rc.8` 的附件服务目前只支持图片，因此视频采用：

1. 下载到本地 `outputDir`；
2. 通过插件受限的同源 `/media-gen/videos/` 路由提供 MP4 和 Range 请求；
3. 客户端优先播放同源本地 MP4，避免外部对象存储的 CORS 限制；
4. TokensAPI 外部 URL 和本地保存路径继续作为明确降级；
5. 播放器根据调用的 `aspect_ratio` 自动适配 `16:9`、`9:16`、`1:1`、`4:3`、`3:4` 或 `21:9`。

## 开发

```bash
pnpm install
pnpm run typecheck
pnpm test
pnpm run build
pnpm run pack:dry
```

## 已知限制

- 首版只验证 DSH `0.1.0-rc.8`；
- 视频历史播放器要求本地 MP4 仍保留在配置的 `outputDir`；文件缺失时回退 TokensAPI 外部 URL；
- 当前公开生产任务接口不直接接受 Data URL；本地图片需要 TokensAPI 第一方上传端点；
- 非图片媒体附件尚未由 DSH `rc.8` 提供。
