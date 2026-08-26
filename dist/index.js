// src/host/index.ts
import Schema from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { homedir } from "node:os";
import { createReadStream } from "node:fs";
import { stat as stat3 } from "node:fs/promises";
import { join as join2 } from "node:path";

// src/shared/media.ts
import { readFile, stat } from "node:fs/promises";
import { extname } from "node:path";
var IMAGE_MODELS = ["image2", "z_image_turbo", "qwen_image"];
var IMAGE_EDIT_MODELS = ["image2", "qwen_image"];
var VIDEO_MODELS = ["ltx_2_3", "seedance_2_0"];
var IMAGE_ASPECT_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"];
var DURATIONS = [3, 5, 8, 10, 15];
var SEEDANCE_RESOLUTIONS = ["480p", "720p", "1080p"];
var ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"];
var MIME_EXTENSIONS = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif"
};
var EXTENSION_MIMES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif"
};
function detectImageMediaType(bytes, hint) {
  if (bytes.length >= 8 && bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  if (bytes.length >= 6) {
    const signature = String.fromCharCode(...bytes.slice(0, 6));
    if (signature === "GIF87a" || signature === "GIF89a") return "image/gif";
  }
  if (hint) {
    const normalized = hint.split(";", 1)[0]?.trim().toLowerCase();
    if (normalized && MIME_EXTENSIONS[normalized]) return normalized;
  }
  return null;
}
function extensionForMediaType(mediaType) {
  return MIME_EXTENSIONS[mediaType] ?? ".bin";
}
function decodePercentBytes(value) {
  const bytes = [];
  for (let index = 0; index < value.length; ) {
    if (value[index] === "%" && /^[0-9A-Fa-f]{2}$/.test(value.slice(index + 1, index + 3))) {
      bytes.push(Number.parseInt(value.slice(index + 1, index + 3), 16));
      index += 3;
    } else {
      const code = value.charCodeAt(index);
      if (code > 127) throw new Error("Non-base64 image data URL must percent-encode binary bytes.");
      bytes.push(code);
      index += 1;
    }
  }
  return Buffer.from(bytes);
}
function normalizeDataUrl(value, maxBytes) {
  const match = value.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!match) throw new Error("Invalid image data URL.");
  const declared = (match[1] ?? "image/png").toLowerCase();
  const encoded = match[3] ?? "";
  const bytes = match[2] ? Buffer.from(encoded, "base64") : decodePercentBytes(encoded);
  if (bytes.length === 0) throw new Error("Image data URL is empty.");
  if (bytes.length > maxBytes) throw new Error(`Image input exceeds the ${maxBytes} byte limit.`);
  const mediaType = detectImageMediaType(bytes, declared);
  if (!mediaType) throw new Error(`Unsupported image data type: ${declared}`);
  return {
    value: `data:${mediaType};base64,${bytes.toString("base64")}`,
    mediaType,
    bytes: bytes.length,
    source: "data"
  };
}
async function resolveImageInput(input, maxBytes) {
  const value = String(input).trim();
  if (/^https:\/\//i.test(value)) return { value, source: "remote" };
  if (/^http:\/\//i.test(value)) throw new Error("Image URL must use HTTPS.");
  if (value.startsWith("data:")) return normalizeDataUrl(value, maxBytes);
  const info = await stat(value);
  if (!info.isFile()) throw new Error(`Image input is not a regular file: ${value}`);
  if (info.size > maxBytes) throw new Error(`Image input exceeds the ${maxBytes} byte limit.`);
  const bytes = await readFile(value);
  const mediaType = detectImageMediaType(bytes, EXTENSION_MIMES[extname(value).toLowerCase()]);
  if (!mediaType) throw new Error(`Unsupported image file type: ${value}`);
  return {
    value: `data:${mediaType};base64,${bytes.toString("base64")}`,
    mediaType,
    bytes: bytes.length,
    source: "file"
  };
}
function resultUrls(data) {
  if (!data || typeof data !== "object") return [];
  const results = data.results;
  if (!Array.isArray(results)) return [];
  return results.map((item) => item && typeof item === "object" ? item.url : void 0).filter((url) => typeof url === "string" && url.length > 0);
}
function sanitizeTaskId(taskId) {
  return taskId.replace(/[^A-Za-z0-9_-]/g, "_");
}

// src/host/results.ts
import { mkdir, readFile as readFile2, stat as stat2, writeFile } from "node:fs/promises";
import { join } from "node:path";
async function download(url, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Download failed (${response.status}) for ${url}`);
  return {
    bytes: Buffer.from(await response.arrayBuffer()),
    mediaType: response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase()
  };
}
async function saveImages(urls, taskId, attachments, signal) {
  return Promise.all(urls.map(async (url, index) => {
    const result = { url };
    if (!attachments) return result;
    try {
      const downloaded = await download(url, signal);
      const mediaType = detectImageMediaType(downloaded.bytes, downloaded.mediaType);
      if (!mediaType) throw new Error(`Unsupported generated image type from ${url}`);
      const name2 = `media_gen_${sanitizeTaskId(taskId)}_${index + 1}${extensionForMediaType(mediaType)}`;
      const ref = await attachments.saveImage({ data: downloaded.bytes, mediaType, name: name2 });
      return {
        ...result,
        attachmentId: ref.attachmentId,
        mediaType: ref.mediaType,
        bytes: ref.bytes,
        width: ref.width,
        height: ref.height,
        name: ref.name
      };
    } catch (error) {
      return { ...result, error: error instanceof Error ? error.message : String(error) };
    }
  }));
}
async function saveVideo(url, taskId, config, signal) {
  if (!url) return {};
  const result = { url };
  try {
    await mkdir(config.outputDir, { recursive: true });
    const filePath = join(config.outputDir, `media_gen_${sanitizeTaskId(taskId)}.mp4`);
    let reuse = false;
    try {
      const info = await stat2(filePath);
      reuse = info.isFile() && info.size > 0;
    } catch {
    }
    if (!reuse) {
      const downloaded = await download(url, signal);
      await writeFile(filePath, downloaded.bytes);
    } else {
      await readFile2(filePath, { flag: "r" });
    }
    result.filePath = filePath;
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  }
  return result;
}

// src/host/tokensapi.ts
import { credentialRef } from "@deepseek-ai/dsh-credentials";
var TokensApiClient = class {
  constructor(ctx, config) {
    this.ctx = ctx;
    this.config = config;
  }
  async key(refName = this.config.apiKeyEnv) {
    const resolved = await this.ctx.credentials.resolve(credentialRef(refName));
    if (!resolved?.value) throw new Error(`${refName} is not configured in DSH credentials`);
    return resolved.value;
  }
  idempotencyKey() {
    return `dsh-media-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
  async uploadImage(dataUrl, signal) {
    if (!this.config.imageUploadURL) throw new Error("TokensAPI presign URL is not configured.");
    if (this.config.uploadAuthMode === "account" && !this.config.accountUserId.trim()) {
      throw new Error("accountUserId is required for account-authenticated TokensAPI image upload.");
    }
    const match = dataUrl.match(/^data:([^;,]+);base64,(.*)$/s);
    if (!match) throw new Error("First-party image upload requires a base64 Data URL.");
    const mediaType = match[1] ?? "image/png";
    if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(mediaType)) {
      throw new Error(`TokensAPI presign does not support ${mediaType}.`);
    }
    const bytes = Buffer.from(match[2] ?? "", "base64");
    if (bytes.length === 0 || bytes.length > 30 * 1024 * 1024) throw new Error("TokensAPI image upload size must be between 1 byte and 30 MB.");
    const uploadCredentialRef = this.config.uploadAuthMode === "api_key" ? this.config.apiKeyEnv : this.config.accountAccessTokenEnv;
    const presignHeaders = {
      Authorization: `Bearer ${await this.key(uploadCredentialRef)}`,
      "Content-Type": "application/json"
    };
    if (this.config.uploadAuthMode === "account") presignHeaders["New-Api-User"] = this.config.accountUserId.trim();
    const presignResponse = await fetch(this.config.imageUploadURL, {
      method: "POST",
      headers: presignHeaders,
      body: JSON.stringify({ mime_type: mediaType, file_size: bytes.length }),
      signal
    });
    const presign = await presignResponse.json().catch(() => ({}));
    if (!presignResponse.ok || presign.success !== true) {
      const detail = presign.message ?? presignResponse.statusText;
      if (this.config.uploadAuthMode === "api_key" && /unauthorized|invalid access token/i.test(detail)) {
        throw new Error("TokensAPI presign rejected the configured API key. Production /api/aigc/presign currently requires an account access token and New-Api-User, or the server must enable TokenOrUserAuth for this route.");
      }
      throw new Error(`TokensAPI presign failed (${presignResponse.status}): ${detail}`);
    }
    const uploadUrl = presign.data?.upload_url;
    const accessUrl = presign.data?.access_url;
    if (!uploadUrl || !/^https:\/\//i.test(uploadUrl) || !accessUrl || !/^https:\/\//i.test(accessUrl)) {
      throw new Error("TokensAPI presign returned invalid upload_url or access_url.");
    }
    const uploadResponse = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": mediaType },
      body: bytes,
      signal
    });
    if (!uploadResponse.ok) throw new Error(`TokensAPI object upload failed (${uploadResponse.status}): ${uploadResponse.statusText}`);
    return accessUrl;
  }
  async submit(kind, body, signal) {
    const response = await fetch(`${this.config.baseURL}/tasks/${kind}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await this.key()}`,
        "Content-Type": "application/json",
        "Idempotency-Key": this.idempotencyKey()
      },
      body: JSON.stringify(body),
      signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`TokensAPI submit failed (${response.status}): ${data.error?.message ?? response.statusText}`);
    if (!data.task_id) throw new Error("TokensAPI returned no task_id");
    return data.task_id;
  }
  async status(taskId, signal) {
    const response = await fetch(`${this.config.baseURL}/tasks/${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${await this.key()}` },
      signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`TokensAPI status failed (${response.status})`);
    return data;
  }
  async poll(taskId, signal) {
    const deadline = Date.now() + this.config.maxPollMs;
    for (; ; ) {
      if (signal?.aborted) throw new Error("Generation cancelled");
      const data = await this.status(taskId, signal);
      const status = typeof data.status === "string" ? data.status : "unknown";
      if (status === "succeeded") return data;
      if (status === "failed" || status === "error" || status === "cancelled") {
        const errorValue = data.error;
        const error = errorValue && typeof errorValue === "object" ? errorValue.message ?? JSON.stringify(errorValue) : typeof errorValue === "string" ? errorValue : status;
        throw new Error(`Generation task ${taskId} failed: ${error}`);
      }
      if (Date.now() > deadline) return { ...data, timedOut: true };
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, this.config.pollIntervalMs);
        signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new Error("Generation cancelled"));
        }, { once: true });
      });
    }
  }
  urls(data) {
    return resultUrls(data);
  }
  async enhance(intent, prompt, signal) {
    if (!this.config.enhanceEnabled) return prompt;
    try {
      const prompts = {
        image_gen: "Enhance this AI image prompt. Preserve intent and add visual details, style, lighting, composition and atmosphere. Respond only with the enhanced prompt.",
        image_edit: "Enhance this AI image editing instruction. Preserve intent and add precise desired changes and quality details. Respond only with the enhanced instruction.",
        video_gen: "Enhance this AI video prompt. Preserve intent and add motion, camera movement, lighting and atmosphere. Respond only with the enhanced prompt."
      };
      const response = await fetch(`${this.config.enhanceBaseURL}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${await this.key(this.config.enhanceApiKeyEnv)}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: this.config.enhanceModel,
          messages: [
            { role: "system", content: prompts[intent] },
            { role: "user", content: prompt }
          ],
          temperature: 0.7
        }),
        signal
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(`Prompt enhancement failed (${response.status})`);
      return data.choices?.[0]?.message?.content?.trim().slice(0, this.config.enhanceMaxChars) || prompt;
    } catch (error) {
      this.ctx.logger.warn("media-gen: prompt enhancement failed, using original prompt: %s", error instanceof Error ? error.message : String(error));
      return prompt;
    }
  }
};

// src/host/index.ts
var name = "media-gen";
var inject = ["tools", "credentials", "userQuestions", "systemPrompt", "attachments", "webServer"];
var Config = Schema.object({
  baseURL: Schema.string().default("https://tokensapi.ai/v1"),
  apiKeyEnv: Schema.string().role("credential-ref").default("TOKENSAPI_API_KEY"),
  outputDir: Schema.string().default(join2(homedir(), "Downloads", "dsh-media-gen")),
  pollIntervalMs: Schema.number().default(5e3),
  maxPollMs: Schema.number().default(12 * 60 * 1e3),
  defaultImageModel: Schema.union([...IMAGE_MODELS]).default("z_image_turbo"),
  defaultEditModel: Schema.union([...IMAGE_EDIT_MODELS]).default("qwen_image"),
  defaultVideoModel: Schema.union([...VIDEO_MODELS]).default("ltx_2_3"),
  enhanceEnabled: Schema.boolean().default(true),
  enhanceApiKeyEnv: Schema.string().role("credential-ref").default("TOKENSAPI_API_KEY"),
  enhanceBaseURL: Schema.string().default("https://tokensapi.ai/v1"),
  enhanceModel: Schema.string().default("deepseek-v4-flash"),
  enhanceMaxChars: Schema.number().default(4e3),
  allowLocalImageInput: Schema.boolean().default(true),
  maxInputImageBytes: Schema.number().default(30 * 1024 * 1024),
  imageUploadURL: Schema.string().default("https://tokensapi.ai/api/aigc/presign"),
  uploadAuthMode: Schema.union(["account", "api_key"]).default("account"),
  accountAccessTokenEnv: Schema.string().role("credential-ref").default("TOKENSAPI_ACCOUNT_ACCESS_TOKEN"),
  accountUserId: Schema.string().default("")
});
var VIDEO_ROUTE_PREFIX = "/media-gen/videos";
function parseRange(value, size) {
  if (!value) return null;
  const match = value.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;
  let start;
  let end;
  if (match[1]) {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
  } else if (match[2]) {
    const suffix = Number(match[2]);
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else return null;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= size) return null;
  return { start, end: Math.min(end, size - 1) };
}
function registerVideoRoute(ctx, config) {
  ctx.effect(() => ctx.webServer.register({
    kind: "prefix",
    path: VIDEO_ROUTE_PREFIX,
    async handler(req, res) {
      if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405, { Allow: "GET, HEAD" });
        res.end();
        return;
      }
      const pathname = new URL(req.url ?? "/", "http://dsh.local").pathname;
      const encodedName = pathname.slice(VIDEO_ROUTE_PREFIX.length + 1);
      let filename;
      try {
        filename = decodeURIComponent(encodedName);
      } catch {
        res.writeHead(400);
        res.end();
        return;
      }
      if (!/^media_gen_[A-Za-z0-9_-]+\.mp4$/.test(filename)) {
        res.writeHead(404);
        res.end();
        return;
      }
      const filePath = join2(config.outputDir, filename);
      let info;
      try {
        info = await stat3(filePath);
      } catch {
        res.writeHead(404);
        res.end();
        return;
      }
      if (!info.isFile()) {
        res.writeHead(404);
        res.end();
        return;
      }
      const range = parseRange(typeof req.headers.range === "string" ? req.headers.range : void 0, info.size);
      const headers = {
        "Content-Type": "video/mp4",
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=3600"
      };
      if (req.headers.range && !range) {
        res.writeHead(416, { ...headers, "Content-Range": `bytes */${info.size}` });
        res.end();
        return;
      }
      if (range) {
        headers["Content-Range"] = `bytes ${range.start}-${range.end}/${info.size}`;
        headers["Content-Length"] = range.end - range.start + 1;
        res.writeHead(206, headers);
      } else {
        headers["Content-Length"] = info.size;
        res.writeHead(200, headers);
      }
      if (req.method === "HEAD") {
        res.end();
        return;
      }
      const stream = createReadStream(filePath, range ?? void 0);
      stream.on("error", () => res.destroy());
      stream.pipe(res);
    }
  }), "media-gen: local video route");
}
function stripRecommended(value) {
  return String(value ?? "").replace(/\s*(?:\((?:recommended|推荐)\)|（(?:recommended|推荐)）)\s*$/i, "").trim();
}
function selected(answer) {
  if (answer?.custom !== void 0 && String(answer.custom).trim()) return String(answer.custom).trim();
  return answer?.selected?.[0] ?? null;
}
function numberLabel(value) {
  const match = String(value ?? "").match(/^\s*(\d+)/);
  return match ? Number(match[1]) : void 0;
}
async function ask(ctx, exec, questions) {
  const response = await ctx.userQuestions.ask({ questions, ...exec.agent ? { agent: exec.agent } : {}, signal: exec.signal });
  return Object.fromEntries((response.answers ?? []).map((answer) => [answer.id, answer]));
}
function imageBlocks(images, label, model, taskId) {
  const blocks = [];
  for (const image of images) {
    if (image.attachmentId && image.mediaType && image.bytes !== void 0 && image.width !== void 0 && image.height !== void 0) {
      blocks.push({
        type: "image",
        attachment: {
          attachmentId: image.attachmentId,
          mediaType: image.mediaType,
          bytes: image.bytes,
          width: image.width,
          height: image.height,
          ...image.name ? { name: image.name } : {}
        }
      });
    }
  }
  const lines = [`${label} (${model}, task ${taskId})`];
  images.forEach((image, index) => {
    if (image.url) lines.push(`Image ${index + 1}: ${image.url}`);
    if (image.error) lines.push(`Image ${index + 1} attachment warning: ${image.error}`);
  });
  blocks.push({ type: "text", text: lines.join("\n") });
  return blocks;
}
function imageOutputSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      taskId: { type: "string", required: true },
      model: { type: "string", required: true },
      timedOut: { type: "boolean" },
      images: {
        type: "array",
        required: true,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            url: { type: "string" },
            attachmentId: { type: "string" },
            mediaType: { type: "string" },
            bytes: { type: "integer" },
            width: { type: "integer" },
            height: { type: "integer" },
            name: { type: "string" },
            error: { type: "string" }
          }
        }
      }
    }
  };
}
async function prepareInput(config, api, input, signal) {
  const trimmed = String(input).trim();
  if (!config.allowLocalImageInput && !/^https:\/\//i.test(trimmed)) {
    throw new Error("Local image input is disabled by plugin configuration.");
  }
  const resolved = await resolveImageInput(trimmed, config.maxInputImageBytes);
  if (resolved.source === "remote") return resolved.value;
  return api.uploadImage(resolved.value, signal);
}
function apply(ctx, config) {
  const api = new TokensApiClient(ctx, config);
  registerVideoRoute(ctx, config);
  const attachments = ctx.get("attachments");
  const register = (spec) => ctx.tools.register(defineTool(spec));
  ctx.systemPrompt.section({
    name: "media-gen:wizard",
    order: 200,
    text: "Before image generation, image editing, or video generation, call media_wizard and complete its ordered confirmation flow. The wizard must confirm the prompt, model strategy, output parameters, and final summary. If the user chooses the plugin default model, do not pass model to the generation tool; only pass model after an explicit model choice."
  });
  register({
    name: "media_wizard",
    description: "Guided media generation wizard. Run before media_generate_image, media_edit_image, or media_generate_video.",
    parameters: {
      intent: { type: "string", enum: ["image_gen", "image_edit", "video_gen"], required: true },
      known: { type: "object", additionalProperties: true }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          intent: { type: "string", required: true },
          confirmed: { type: "boolean", required: true },
          promptConfirmed: { type: "boolean", required: true },
          modelChoiceConfirmed: { type: "boolean", required: true },
          modelExplicit: { type: "boolean", required: true },
          finalConfirmed: { type: "boolean", required: true },
          needsImage: { type: "boolean" },
          params: { type: "object", additionalProperties: true, required: true }
        }
      },
      render: (_args, value) => [{
        type: "text",
        text: [
          value.confirmed ? `Wizard complete (${value.intent})` : `Wizard cancelled (${value.intent})`,
          `Prompt confirmed: ${value.promptConfirmed ? "yes" : "no"}`,
          `Model choice confirmed: ${value.modelChoiceConfirmed ? "yes" : "no"}`,
          `Model strategy: ${value.modelExplicit ? "explicit model" : "plugin default"}`,
          `Final confirmation: ${value.finalConfirmed ? "yes" : "no"}`,
          `Parameters:
${JSON.stringify(value.params, null, 2)}`
        ].join("\n")
      }]
    },
    async execute(args, exec) {
      const intent = args.intent;
      const params = { ...args.known ?? {} };
      delete params.modelExplicit;
      let needsImage = false;
      let promptConfirmed = false;
      let modelChoiceConfirmed = false;
      let modelExplicit = false;
      let finalConfirmed = false;
      const result = () => ({
        intent,
        confirmed: promptConfirmed && modelChoiceConfirmed && finalConfirmed,
        promptConfirmed,
        modelChoiceConfirmed,
        modelExplicit,
        finalConfirmed,
        needsImage,
        params
      });
      try {
        if (intent === "image_edit" && !params.image) {
          const answers = await ask(ctx, exec, [{
            id: "image",
            header: "\u53C2\u8003\u56FE",
            question: "\u8BF7\u9009\u62E9\u5DF2\u9644\u52A0\u7684\u56FE\u7247\uFF0C\u6216\u8F93\u5165 HTTPS URL / \u672C\u5730\u56FE\u7247\u8DEF\u5F84"
          }]);
          params.image = selected(answers.image);
          if (!params.image) {
            needsImage = true;
            return result();
          }
        }
        if (intent === "video_gen") {
          const hasInput = params.image_url || params.start_image || params.end_image || Array.isArray(params.reference_images) && params.reference_images.length;
          if (!hasInput) {
            const answers = await ask(ctx, exec, [{
              id: "video_input",
              header: "\u89C6\u9891\u7C7B\u578B",
              question: "\u9009\u62E9\u89C6\u9891\u751F\u6210\u65B9\u5F0F",
              options: [{ label: "\u7EAF\u6587\u751F\u89C6\u9891 (Recommended)" }, { label: "\u4F7F\u7528\u9996\u5E27\u56FE\u7247" }, { label: "\u4F7F\u7528\u9996\u5E27\u548C\u5C3E\u5E27\u56FE\u7247" }]
            }]);
            const choice = stripRecommended(selected(answers.video_input));
            if (!choice) return result();
            if (choice === "\u4F7F\u7528\u9996\u5E27\u56FE\u7247") {
              const imageAnswers = await ask(ctx, exec, [{ id: "start_image", header: "\u9996\u5E27\u56FE\u7247", question: "\u8BF7\u9009\u62E9\u5DF2\u9644\u52A0\u7684\u9996\u5E27\u56FE\u7247\uFF0C\u6216\u8F93\u5165 HTTPS URL / \u672C\u5730\u56FE\u7247\u8DEF\u5F84" }]);
              params.start_image = selected(imageAnswers.start_image);
              if (!params.start_image) {
                needsImage = true;
                return result();
              }
            }
            if (choice === "\u4F7F\u7528\u9996\u5E27\u548C\u5C3E\u5E27\u56FE\u7247") {
              const imageAnswers = await ask(ctx, exec, [
                { id: "start_image", header: "\u9996\u5E27\u56FE\u7247", question: "\u8BF7\u9009\u62E9\u5DF2\u9644\u52A0\u7684\u9996\u5E27\u56FE\u7247\uFF0C\u6216\u8F93\u5165 HTTPS URL / \u672C\u5730\u56FE\u7247\u8DEF\u5F84" },
                { id: "end_image", header: "\u5C3E\u5E27\u56FE\u7247", question: "\u8BF7\u9009\u62E9\u5DF2\u9644\u52A0\u7684\u5C3E\u5E27\u56FE\u7247\uFF0C\u6216\u8F93\u5165 HTTPS URL / \u672C\u5730\u56FE\u7247\u8DEF\u5F84" }
              ]);
              params.start_image = selected(imageAnswers.start_image);
              params.end_image = selected(imageAnswers.end_image);
              if (!params.start_image || !params.end_image) {
                needsImage = true;
                return result();
              }
            }
          }
        }
        if (!params.prompt) {
          const answers = await ask(ctx, exec, [{
            id: "prompt",
            header: "\u539F\u59CB Prompt",
            question: intent === "image_edit" ? "\u8BF7\u63CF\u8FF0\u4F60\u60F3\u600E\u4E48\u4FEE\u6539\u56FE\u7247" : intent === "video_gen" ? "\u8BF7\u63CF\u8FF0\u4F60\u60F3\u751F\u6210\u7684\u89C6\u9891" : "\u8BF7\u63CF\u8FF0\u4F60\u60F3\u751F\u6210\u7684\u56FE\u7247"
          }]);
          params.prompt = selected(answers.prompt);
          if (!params.prompt) return result();
        }
        if (params.enhanced === void 0) {
          const enhanceOptions = config.enhanceEnabled ? [
            { label: "\u589E\u5F3A Prompt (Recommended)", description: "\u4F18\u5316\u89C6\u89C9\u3001\u955C\u5934\u548C\u8D28\u91CF\u7EC6\u8282" },
            { label: "\u4FDD\u6301\u539F\u59CB Prompt", description: "\u4E0D\u4FEE\u6539\u5185\u5BB9\u63CF\u8FF0" }
          ] : [{ label: "\u4FDD\u6301\u539F\u59CB Prompt (Recommended)", description: "\u5F53\u524D\u672A\u542F\u7528\u63D0\u793A\u8BCD\u589E\u5F3A\u670D\u52A1" }];
          const answers = await ask(ctx, exec, [{ id: "enhance", header: "Prompt \u589E\u5F3A", question: "\u662F\u5426\u589E\u5F3A Prompt\uFF1F", options: enhanceOptions }]);
          const choice = stripRecommended(selected(answers.enhance));
          if (!choice) return result();
          if (choice === "\u589E\u5F3A Prompt") {
            const original = params.prompt;
            const enhanced = await api.enhance(intent, original, exec.signal);
            params.originalPrompt = original;
            params.prompt = enhanced;
            params.enhanced = enhanced !== original;
          } else {
            params.enhanced = false;
          }
        }
        const promptAnswers = await ask(ctx, exec, [{
          id: "prompt_confirm",
          header: "\u786E\u8BA4 Prompt",
          question: "\u662F\u5426\u4F7F\u7528\u8FD9\u4E2A\u6700\u7EC8 Prompt\uFF1F",
          detail: String(params.prompt),
          options: [{ label: "\u786E\u8BA4 Prompt (Recommended)" }, { label: "\u53D6\u6D88" }]
        }]);
        promptConfirmed = stripRecommended(selected(promptAnswers.prompt_confirm)) === "\u786E\u8BA4 Prompt";
        if (!promptConfirmed) return result();
        const selectableModels = intent === "video_gen" ? VIDEO_MODELS : intent === "image_edit" ? IMAGE_EDIT_MODELS : IMAGE_MODELS;
        const defaultModel = intent === "video_gen" ? config.defaultVideoModel : intent === "image_edit" ? config.defaultEditModel : config.defaultImageModel;
        const defaultModelLabel = `${defaultModel}\uFF08\u63D2\u4EF6\u9ED8\u8BA4\uFF0C\u63A8\u8350\uFF09`;
        const modelOptions = [
          { label: defaultModelLabel, description: "\u4F7F\u7528\u63D2\u4EF6\u5F53\u524D\u914D\u7F6E\u7684\u9ED8\u8BA4\u6A21\u578B" },
          ...selectableModels.filter((model) => model !== defaultModel).map((model) => ({ label: model }))
        ];
        const modelAnswers = await ask(ctx, exec, [{ id: "model", header: "\u6A21\u578B", question: "\u9009\u62E9\u6A21\u578B", options: modelOptions }]);
        const rawModelChoice = selected(modelAnswers.model);
        if (!rawModelChoice) return result();
        const usesPluginDefault = rawModelChoice === defaultModelLabel;
        const modelChoice = usesPluginDefault ? defaultModel : stripRecommended(rawModelChoice);
        modelChoiceConfirmed = true;
        if (usesPluginDefault) {
          delete params.model;
          modelExplicit = false;
        } else {
          params.model = modelChoice;
          modelExplicit = true;
        }
        const effectiveVideoModel = intent === "video_gen" ? params.model ?? config.defaultVideoModel : void 0;
        const outputQuestions = [];
        if (intent === "image_gen" && !params.aspect_ratio) outputQuestions.push({
          id: "aspect_ratio",
          header: "\u753B\u9762\u6BD4\u4F8B",
          question: "\u9009\u62E9\u753B\u9762\u6BD4\u4F8B",
          options: IMAGE_ASPECT_RATIOS.map((ratio) => ({ label: ratio === "1:1" ? `${ratio} (Recommended)` : ratio }))
        });
        if ((intent === "image_edit" || intent === "video_gen") && !params.aspect_ratio) outputQuestions.push({
          id: "aspect_ratio",
          header: "\u753B\u9762\u6BD4\u4F8B",
          question: "\u9009\u62E9\u753B\u9762\u6BD4\u4F8B",
          options: ASPECT_RATIOS.map((ratio, index) => ({ label: index === 0 ? `${ratio} (Recommended)` : ratio }))
        });
        if (intent === "video_gen" && !params.duration) outputQuestions.push({
          id: "duration",
          header: "\u65F6\u957F",
          question: "\u9009\u62E9\u89C6\u9891\u65F6\u957F",
          options: effectiveVideoModel === "seedance_2_0" ? [{ label: "5 \u79D2 (Recommended)" }, { label: "8 \u79D2" }, { label: "10 \u79D2" }, { label: "15 \u79D2" }] : [{ label: "5 \u79D2 (Recommended)" }, { label: "3 \u79D2" }, { label: "8 \u79D2" }]
        });
        if (intent === "video_gen" && effectiveVideoModel === "seedance_2_0" && !params.resolution) outputQuestions.push({
          id: "resolution",
          header: "\u5206\u8FA8\u7387",
          question: "\u9009\u62E9\u89C6\u9891\u5206\u8FA8\u7387",
          options: SEEDANCE_RESOLUTIONS.map((resolution) => ({ label: resolution === "720p" ? `${resolution} (Recommended)` : resolution }))
        });
        if ((intent === "image_gen" || intent === "image_edit") && !params.n) outputQuestions.push({
          id: "n",
          header: "\u6570\u91CF",
          question: "\u751F\u6210\u51E0\u5F20\uFF1F",
          options: [{ label: "1 \u5F20 (Recommended)" }, { label: "2 \u5F20" }, { label: "4 \u5F20" }]
        });
        if (outputQuestions.length) {
          const answers = await ask(ctx, exec, outputQuestions);
          if (answers.aspect_ratio) params.aspect_ratio = stripRecommended(selected(answers.aspect_ratio));
          if (answers.duration) params.duration = numberLabel(selected(answers.duration));
          if (answers.resolution) params.resolution = stripRecommended(selected(answers.resolution));
          if (answers.n) params.n = numberLabel(selected(answers.n));
        }
        const requiredParametersPresent = Boolean(params.aspect_ratio) && (intent === "video_gen" ? Boolean(params.duration) && (effectiveVideoModel !== "seedance_2_0" || Boolean(params.resolution)) : Boolean(params.n));
        if (!requiredParametersPresent) return result();
        const parameterLines = [
          `- \u753B\u9762\u6BD4\u4F8B: ${params.aspect_ratio}`,
          ...params.duration ? [`- \u65F6\u957F: ${params.duration} \u79D2`] : [],
          ...intent === "video_gen" ? [`- \u5206\u8FA8\u7387: ${params.resolution ?? "\u6A21\u578B\u5DE5\u4F5C\u6D41\u9ED8\u8BA4\u503C"}`] : [],
          ...params.n ? [`- \u6570\u91CF: ${params.n} \u5F20`] : [],
          ...needsImage ? ["- \u56FE\u7247\u8F93\u5165: \u9700\u8981\u63D0\u4F9B"] : []
        ];
        const finalLines = [
          `- \u5185\u5BB9: ${params.prompt}`,
          `- \u6A21\u578B: ${params.model ?? `${defaultModel}\uFF08\u63D2\u4EF6\u9ED8\u8BA4\uFF09`}`,
          ...parameterLines
        ];
        const finalAnswers = await ask(ctx, exec, [{
          id: "final_confirm",
          header: "\u6700\u7EC8\u786E\u8BA4",
          question: "\u6309\u4EE5\u4E0B\u5B8C\u6574\u914D\u7F6E\u521B\u5EFA\u4EFB\u52A1\u5417\uFF1F",
          detail: finalLines.join("\n"),
          options: [{ label: "\u786E\u8BA4\u751F\u6210 (Recommended)" }, { label: "\u53D6\u6D88" }]
        }]);
        finalConfirmed = stripRecommended(selected(finalAnswers.final_confirm)) === "\u786E\u8BA4\u751F\u6210";
        return result();
      } catch (error) {
        if (error?.code === "ASK_CANCELLED") return result();
        throw error;
      }
    }
  });
  register({
    name: "media_generate_image",
    description: "Generate one or more images with TokensAPI and return DSH image attachments plus remote fallback URLs.",
    parameters: {
      prompt: { type: "string", required: true },
      model: { type: "string", enum: [...IMAGE_MODELS] },
      aspect_ratio: { type: "string", enum: [...IMAGE_ASPECT_RATIOS] },
      n: { type: "integer" }
    },
    output: {
      schema: imageOutputSchema(),
      render: (_args, value) => imageBlocks(value.images, "Generated images", value.model, value.taskId)
    },
    async execute(args, exec) {
      const model = args.model ?? config.defaultImageModel;
      const taskId = await api.submit("images", { model, prompt: args.prompt, aspect_ratio: args.aspect_ratio ?? "1:1", n: args.n ?? 1 }, exec.signal);
      const data = await api.poll(taskId, exec.signal);
      const timedOut = data.timedOut === true;
      const images = timedOut ? [] : await saveImages(api.urls(data), taskId, attachments, exec.signal);
      return { taskId, model, images, ...timedOut ? { timedOut: true } : {} };
    }
  });
  register({
    name: "media_edit_image",
    description: "Edit an image with TokensAPI. HTTPS URLs and local/data images are supported; local images use TokensAPI first-party presigned upload without third-party hosting.",
    parameters: {
      prompt: { type: "string", required: true },
      image: { type: "string", required: true },
      model: { type: "string", enum: [...IMAGE_EDIT_MODELS] },
      aspect_ratio: { type: "string", enum: [...ASPECT_RATIOS] },
      n: { type: "integer" }
    },
    output: {
      schema: imageOutputSchema(),
      render: (_args, value) => imageBlocks(value.images, "Edited images", value.model, value.taskId)
    },
    async execute(args, exec) {
      const model = args.model ?? config.defaultEditModel;
      if (!IMAGE_EDIT_MODELS.includes(model)) {
        throw new Error(`Model ${model} does not support image editing. Choose image2 or qwen_image.`);
      }
      const image = await prepareInput(config, api, args.image, exec.signal);
      const body = {
        model,
        prompt: args.prompt,
        n: args.n ?? 1,
        ...args.aspect_ratio ? { aspect_ratio: args.aspect_ratio } : {},
        input_references: [{ type: "image_url", slot_name: "reference_1", image_url: { url: image } }]
      };
      const taskId = await api.submit("images", body, exec.signal);
      const data = await api.poll(taskId, exec.signal);
      const timedOut = data.timedOut === true;
      const images = timedOut ? [] : await saveImages(api.urls(data), taskId, attachments, exec.signal);
      return { taskId, model, images, ...timedOut ? { timedOut: true } : {} };
    }
  });
  const videoSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
      taskId: { type: "string", required: true },
      model: { type: "string", required: true },
      url: { type: "string" },
      filePath: { type: "string" },
      durationSeconds: { type: "number" },
      width: { type: "integer" },
      height: { type: "integer" },
      fps: { type: "integer" },
      timedOut: { type: "boolean" },
      error: { type: "string" }
    }
  };
  const renderVideo = (_args, value) => {
    const blocks = [];
    if (value.url) blocks.push({ type: "video", url: value.url });
    const lines = [
      `Generated video (${value.model}, task ${value.taskId})`,
      ...value.filePath ? [`Saved to: ${value.filePath}`] : [],
      ...value.url ? [`URL: ${value.url}`] : [],
      ...value.error ? [`Local save warning: ${value.error}`] : [],
      ...value.timedOut ? ["Task is still running. Use media_task_status with this task id."] : []
    ];
    blocks.push({ type: "text", text: lines.join("\n") });
    return blocks;
  };
  register({
    name: "media_generate_video",
    description: "Generate a short TokensAPI video. Supports text and first/last frame images. Local images use TokensAPI first-party presigned upload.",
    parameters: {
      prompt: { type: "string", required: true },
      model: { type: "string", enum: [...VIDEO_MODELS] },
      duration: { type: "integer", enum: [...DURATIONS] },
      resolution: { type: "string", enum: [...SEEDANCE_RESOLUTIONS] },
      aspect_ratio: { type: "string", enum: [...ASPECT_RATIOS] },
      image_url: { type: "string" },
      reference_images: { type: "array", items: { type: "string" } },
      start_image: { type: "string" },
      end_image: { type: "string" }
    },
    output: { schema: videoSchema, render: renderVideo },
    async execute(args, exec) {
      if (args.end_image && !args.start_image) throw new Error("end_image requires start_image");
      const model = args.model ?? config.defaultVideoModel;
      if (args.resolution && model !== "seedance_2_0") throw new Error("resolution is configurable only for seedance_2_0; ltx_2_3 uses its workflow default.");
      if (Array.isArray(args.reference_images) && args.reference_images.length > 0) {
        throw new Error("The current TokensAPI production video contract supports first/last frame_images, not generic reference_images.");
      }
      const firstInput = args.start_image ?? args.image_url;
      const startImage = typeof firstInput === "string" ? await prepareInput(config, api, firstInput, exec.signal) : void 0;
      const endImage = typeof args.end_image === "string" ? await prepareInput(config, api, args.end_image, exec.signal) : void 0;
      const frameImages = [
        ...startImage ? [{ type: "image_url", frame_type: "first_frame", image_url: { url: startImage } }] : [],
        ...endImage ? [{ type: "image_url", frame_type: "last_frame", image_url: { url: endImage } }] : []
      ];
      const body = {
        model,
        prompt: args.prompt,
        n: 1,
        ...args.duration ? { duration: args.duration } : {},
        ...args.resolution ? { resolution: args.resolution } : {},
        ...args.aspect_ratio ? { aspect_ratio: args.aspect_ratio } : {},
        ...frameImages.length ? { frame_images: frameImages } : {}
      };
      const taskId = await api.submit("videos", body, exec.signal);
      const data = await api.poll(taskId, exec.signal);
      if (data.timedOut === true) return { taskId, model, timedOut: true };
      const url = api.urls(data)[0];
      const saved = await saveVideo(url, taskId, config, exec.signal);
      const media = data.media && typeof data.media === "object" ? data.media : {};
      return {
        taskId,
        model,
        ...saved,
        ...typeof media.duration_seconds === "number" ? { durationSeconds: media.duration_seconds } : {},
        ...typeof media.width === "number" ? { width: media.width } : {},
        ...typeof media.height === "number" ? { height: media.height } : {},
        ...typeof media.fps === "number" ? { fps: media.fps } : {}
      };
    }
  });
  register({
    name: "media_list_models",
    description: "List media models supported by this plugin.",
    parameters: {},
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          images: { type: "array", items: { type: "string" }, required: true },
          videos: { type: "array", items: { type: "string" }, required: true }
        }
      },
      render: (_args, value) => [{ type: "text", text: `Image models: ${value.images.join(", ")}
Video models: ${value.videos.join(", ")}` }]
    },
    async execute() {
      return { images: [...IMAGE_MODELS], videos: [...VIDEO_MODELS] };
    }
  });
  register({
    name: "media_task_status",
    description: "Check and recover a TokensAPI media task. Completed images are saved as DSH attachments; completed videos are saved locally.",
    parameters: {
      task_id: { type: "string", required: true },
      kind: { type: "string", enum: ["auto", "images", "videos"] }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: true,
        properties: {
          taskId: { type: "string", required: true },
          status: { type: "string", required: true },
          progress: { type: "integer" },
          kind: { type: "string" },
          images: { type: "array", items: imageOutputSchema().properties.images.items },
          url: { type: "string" },
          filePath: { type: "string" },
          error: { type: "string" }
        }
      },
      render: (_args, value) => {
        if (Array.isArray(value.images) && value.images.length) return imageBlocks(value.images, "Recovered images", "task result", value.taskId);
        const blocks = [];
        if (value.url) blocks.push({ type: "video", url: value.url });
        blocks.push({ type: "text", text: [
          `Task ${value.taskId}: ${value.status} (progress ${value.progress ?? 0}%)`,
          ...value.filePath ? [`Saved to: ${value.filePath}`] : [],
          ...value.url ? [`URL: ${value.url}`] : [],
          ...value.error ? [`Warning: ${value.error}`] : []
        ].join("\n") });
        return blocks;
      }
    },
    async execute(args, exec) {
      const data = await api.status(args.task_id, exec.signal);
      const status = typeof data.status === "string" ? data.status : "unknown";
      const progress = typeof data.progress === "number" ? data.progress : 0;
      if (status !== "succeeded") return { taskId: args.task_id, status, progress };
      const urls = api.urls(data);
      const detectedKind = args.kind && args.kind !== "auto" ? args.kind : data.media && typeof data.media === "object" ? "videos" : urls.some((url) => /\.(?:mp4|webm)(?:\?|$)/i.test(url)) ? "videos" : "images";
      if (detectedKind === "videos") {
        const saved = await saveVideo(urls[0], args.task_id, config, exec.signal);
        return { taskId: args.task_id, status, progress, kind: "videos", ...saved };
      }
      const images = await saveImages(urls, args.task_id, attachments, exec.signal);
      return { taskId: args.task_id, status, progress, kind: "images", images };
    }
  });
}
export {
  Config,
  TokensApiClient,
  apply,
  inject,
  name
};
//# sourceMappingURL=index.js.map
