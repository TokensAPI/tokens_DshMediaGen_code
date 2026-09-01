// src/host/index.ts
import Schema from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { homedir } from "node:os";
import { createReadStream } from "node:fs";
import { stat as stat3 } from "node:fs/promises";
import { join as join2 } from "node:path";
import { Readable } from "node:stream";

// src/shared/media.ts
import { readFile, stat } from "node:fs/promises";
import { extname } from "node:path";
var IMAGE_MODELS = ["image2", "z_image_turbo", "qwen_image"];
var IMAGE_EDIT_MODELS = ["image2", "qwen_image"];
var IMAGE_ASPECT_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"];
var LTX_VIDEO_ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"];
var SEEDANCE_2_5_ASPECT_RATIOS = [...LTX_VIDEO_ASPECT_RATIOS, "adaptive"];
var MINIMAX_H3_ASPECT_RATIOS = ["16:9", "9:16", "1:1", "3:2", "2:3"];
var VIDEO_ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "3:2", "2:3", "adaptive"];
var DURATIONS = [3, 5, 8, 10, 15];
var SEEDANCE_RESOLUTIONS = ["480p", "720p", "1080p"];
var ASPECT_RATIOS = LTX_VIDEO_ASPECT_RATIOS;
var VIDEO_MODEL_IDS = [
  "minimax_h3",
  "ltx_2_5",
  "ltx_2_3",
  "seedance_2_5",
  "seedance_2_0"
];
var VIDEO_MODEL_CAPABILITIES = {
  ltx_2_3: {
    durations: [3, 5, 8],
    resolutions: ["720p"],
    aspectRatios: LTX_VIDEO_ASPECT_RATIOS,
    defaultDuration: 5,
    defaultResolution: "720p",
    defaultAspectRatio: "16:9",
    defaultAudioEnabled: true,
    audioMode: "required",
    generateAudioParameter: "omit",
    inputModes: ["text", "first_frame", "first_last_frame"]
  },
  seedance_2_0: {
    durations: [5, 8, 10, 15],
    resolutions: ["480p", "720p", "1080p"],
    aspectRatios: LTX_VIDEO_ASPECT_RATIOS,
    defaultDuration: 5,
    defaultResolution: "720p",
    defaultAspectRatio: "16:9",
    defaultAudioEnabled: true,
    audioMode: "optional",
    generateAudioParameter: "optional",
    inputModes: ["text", "first_frame", "first_last_frame"]
  },
  ltx_2_5: {
    durations: [5, 10],
    resolutions: ["720p", "1080p"],
    aspectRatios: LTX_VIDEO_ASPECT_RATIOS,
    defaultDuration: 5,
    defaultResolution: "720p",
    defaultAspectRatio: "16:9",
    defaultAudioEnabled: true,
    audioMode: "required",
    generateAudioParameter: "required_true",
    inputModes: ["text", "first_frame", "first_last_frame"]
  },
  seedance_2_5: {
    durations: [5, 8, 10, 15],
    resolutions: ["720p", "1080p"],
    aspectRatios: SEEDANCE_2_5_ASPECT_RATIOS,
    defaultDuration: 5,
    defaultResolution: "720p",
    defaultAspectRatio: "16:9",
    defaultAudioEnabled: true,
    audioMode: "optional",
    generateAudioParameter: "optional",
    inputModes: ["text", "first_frame", "first_last_frame"],
    requiredAspectRatioByInputMode: {
      first_frame: "adaptive",
      first_last_frame: "adaptive"
    }
  },
  minimax_h3: {
    durations: [5, 10],
    resolutions: ["480p", "720p"],
    aspectRatios: MINIMAX_H3_ASPECT_RATIOS,
    defaultDuration: 5,
    defaultResolution: "720p",
    defaultAspectRatio: "16:9",
    defaultAudioEnabled: true,
    audioMode: "required",
    generateAudioParameter: "required_true",
    inputModes: ["text", "first_frame", "first_last_frame"]
  }
};
var VIDEO_MODELS = VIDEO_MODEL_IDS;
function isVideoModel(value) {
  return typeof value === "string" && VIDEO_MODEL_IDS.includes(value);
}
function videoModelCapability(model) {
  return VIDEO_MODEL_CAPABILITIES[model];
}
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
import { createHash, createHmac } from "node:crypto";
var TokensApiHttpError = class extends Error {
  constructor(message, status, retryAfterMs) {
    super(message);
    this.status = status;
    this.retryAfterMs = retryAfterMs;
    this.name = "TokensApiHttpError";
  }
};
function sha256Hex(data) {
  return createHash("sha256").update(data).digest("hex");
}
function hmacSha256(key, data) {
  return createHmac("sha256", key).update(data).digest();
}
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value).filter(([, item]) => item !== void 0).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
function responseTaskId(data) {
  const nested = [data, data.data, data.error].filter((value) => Boolean(value && typeof value === "object"));
  for (const value of nested) {
    for (const key of ["task_id", "taskId", "active_task_id", "activeTaskId", "existing_task_id", "existingTaskId"]) {
      if (typeof value[key] === "string" && value[key].trim()) return value[key].trim();
    }
  }
  return void 0;
}
function responseErrorMessage(data, fallback) {
  if (typeof data.message === "string" && data.message.trim()) return data.message;
  const error = data.error;
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object" && typeof error.message === "string") {
    return String(error.message);
  }
  return fallback;
}
function responseRetryAfterMs(response) {
  const value = response.headers.get("retry-after")?.trim();
  if (!value) return void 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1e3;
  const date = Date.parse(value);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return void 0;
}
function transientStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}
function signS3V4(options) {
  const now = /* @__PURE__ */ new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(options.payload);
  const headerEntries = [
    ["content-type", options.contentType],
    ["host", options.host],
    ["x-amz-content-sha256", payloadHash],
    ["x-amz-date", amzDate]
  ];
  if (options.acl) headerEntries.push(["x-amz-acl", options.acl]);
  const canonicalHeaders = headerEntries.map(([key, value]) => `${key}:${value}
`).join("");
  const signedHeaders = headerEntries.map(([key]) => key).join(";");
  const canonicalRequest = [options.method, options.path, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${dateStamp}/${options.region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const kDate = hmacSha256(`AWS4${options.secretAccessKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, options.region);
  const kService = hmacSha256(kRegion, "s3");
  const kSigning = hmacSha256(kService, "aws4_request");
  const signature = hmacSha256(kSigning, stringToSign).toString("hex");
  return {
    amzDate,
    payloadHash,
    authorization: `AWS4-HMAC-SHA256 Credential=${options.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
  };
}
var TokensApiClient = class {
  constructor(ctx, config) {
    this.ctx = ctx;
    this.config = config;
  }
  pendingSubmissions = /* @__PURE__ */ new Map();
  async key(refName = this.config.apiKeyEnv) {
    const resolved = await this.ctx.credentials.resolve(credentialRef(refName));
    if (!resolved?.value) throw new Error(`${refName} is not configured in DSH credentials`);
    return resolved.value;
  }
  idempotencyKey() {
    return `dsh-media-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
  submissionFingerprint(kind, body) {
    return sha256Hex(`${kind}
${canonicalJson(body)}`);
  }
  prunePendingSubmissions() {
    const expiry = Date.now() - Math.max(this.config.maxPollMs * 2, 30 * 60 * 1e3);
    for (const [fingerprint, record] of this.pendingSubmissions) {
      if (record.updatedAt < expiry) this.pendingSubmissions.delete(fingerprint);
    }
  }
  forgetTask(taskId) {
    for (const [fingerprint, record] of this.pendingSubmissions) {
      if (record.taskId === taskId) this.pendingSubmissions.delete(fingerprint);
    }
  }
  retryDelay(attempt, retryAfterMs) {
    if (retryAfterMs !== void 0) return Math.min(retryAfterMs, 3e4);
    const factors = [1, 1.6, 2.6, 4, 6];
    const factor = factors[Math.min(attempt, factors.length - 1)] ?? 6;
    return Math.min(3e4, Math.max(1, Math.round(this.config.pollIntervalMs * factor)));
  }
  async wait(ms, signal) {
    if (signal?.aborted) throw new Error("Generation cancelled");
    await new Promise((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timer);
        reject(new Error("Generation cancelled"));
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      }, ms);
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }
  isTransientError(error) {
    if (error instanceof TokensApiHttpError) return transientStatus(error.status);
    return error instanceof TypeError || error instanceof Error && /fetch failed|network|socket|ECONNRESET|ETIMEDOUT/i.test(error.message);
  }
  async uploadImage(dataUrl, signal) {
    if (this.config.storageBackend === "r2") return this.uploadImageR2(dataUrl, signal);
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
  async uploadImageR2(dataUrl, signal) {
    const requiredFields = ["r2Endpoint", "r2Bucket", "r2CdnBase"];
    for (const field of requiredFields) {
      if (!String(this.config[field] ?? "").trim()) throw new Error(`${field} is required for R2/S3 image upload.`);
    }
    const match = dataUrl.match(/^data:([^;,]+);base64,(.*)$/s);
    if (!match) throw new Error("R2/S3 image upload requires a base64 Data URL.");
    const mediaType = match[1] ?? "image/png";
    if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(mediaType)) {
      throw new Error(`R2/S3 upload does not support ${mediaType}.`);
    }
    const bytes = Buffer.from(match[2] ?? "", "base64");
    if (bytes.length === 0 || bytes.length > 30 * 1024 * 1024) throw new Error("R2/S3 image upload size must be between 1 byte and 30 MB.");
    const endpoint = new URL(this.config.r2Endpoint.trim());
    const bucket = this.config.r2Bucket.trim().replace(/^\/+|\/+$/g, "");
    const prefix = this.config.r2PathPrefix.trim().replace(/^\/+|\/+$/g, "");
    const extension = extensionForMediaType(mediaType);
    const objectKey = `${prefix ? `${prefix}/` : ""}dsh-media-${Date.now()}-${Math.random().toString(36).slice(2, 10)}${extension}`;
    const encodedKey = objectKey.split("/").map((segment) => encodeURIComponent(segment)).join("/");
    const path = `/${bucket}/${encodedKey}`;
    const accessKeyId = await this.key(this.config.r2AccessKeyEnv);
    const secretAccessKey = await this.key(this.config.r2SecretKeyEnv);
    const signed = signS3V4({
      method: "PUT",
      path,
      host: endpoint.host,
      contentType: mediaType,
      payload: bytes,
      accessKeyId,
      secretAccessKey,
      region: this.config.r2Region.trim() || "auto"
    });
    const uploadResponse = await fetch(`https://${endpoint.host}${path}`, {
      method: "PUT",
      headers: {
        "Content-Type": mediaType,
        "x-amz-content-sha256": signed.payloadHash,
        "x-amz-date": signed.amzDate,
        Authorization: signed.authorization
      },
      body: bytes,
      signal
    });
    if (!uploadResponse.ok) {
      const detail = await uploadResponse.text().catch(() => "");
      throw new Error(`R2/S3 object upload failed (${uploadResponse.status}): ${detail || uploadResponse.statusText}`);
    }
    const cdnBase = this.config.r2CdnBase.trim().replace(/\/+$/, "");
    return `${cdnBase}/${objectKey}`;
  }
  async submit(kind, body, signal, deduplicationInput = body) {
    this.prunePendingSubmissions();
    const fingerprint = this.submissionFingerprint(kind, deduplicationInput);
    const existing = this.pendingSubmissions.get(fingerprint);
    if (existing?.taskId) {
      existing.updatedAt = Date.now();
      return existing.taskId;
    }
    const record = existing ?? { idempotencyKey: this.idempotencyKey(), updatedAt: Date.now() };
    this.pendingSubmissions.set(fingerprint, record);
    let lastProblem = "network interruption";
    const maxAttempts = 3;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (signal?.aborted) throw new Error("Generation cancelled");
      let response;
      try {
        response = await fetch(`${this.config.baseURL}/tasks/${kind}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${await this.key()}`,
            "Content-Type": "application/json",
            "Idempotency-Key": record.idempotencyKey
          },
          body: JSON.stringify(body),
          signal
        });
      } catch (error) {
        if (signal?.aborted) throw new Error("Generation cancelled");
        if (!this.isTransientError(error)) {
          this.pendingSubmissions.delete(fingerprint);
          throw error;
        }
        lastProblem = error instanceof Error ? error.message : String(error);
        record.updatedAt = Date.now();
        if (attempt + 1 < maxAttempts) {
          await this.wait(this.retryDelay(attempt), signal);
          continue;
        }
        break;
      }
      const data = await response.json().catch(() => ({}));
      const taskId = responseTaskId(data);
      if (taskId && (response.ok || response.status === 409 || response.status === 429)) {
        record.taskId = taskId;
        record.updatedAt = Date.now();
        return taskId;
      }
      if (response.ok && !taskId) {
        lastProblem = "TokensAPI returned no task_id";
      } else if (!response.ok) {
        const detail = responseErrorMessage(data, response.statusText);
        lastProblem = `TokensAPI submit failed (${response.status}): ${detail}`;
        if (!transientStatus(response.status)) {
          this.pendingSubmissions.delete(fingerprint);
          throw new TokensApiHttpError(lastProblem, response.status, responseRetryAfterMs(response));
        }
      }
      record.updatedAt = Date.now();
      if (attempt + 1 < maxAttempts) {
        await this.wait(this.retryDelay(attempt, responseRetryAfterMs(response)), signal);
      }
    }
    throw new Error(`TokensAPI submission status is uncertain after ${lastProblem}. Do not create a new task; retrying the same request will reuse idempotency key ${record.idempotencyKey}.`);
  }
  async status(taskId, signal) {
    const response = await fetch(`${this.config.baseURL}/tasks/${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${await this.key()}` },
      signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new TokensApiHttpError(
        `TokensAPI status failed (${response.status}): ${responseErrorMessage(data, response.statusText)}`,
        response.status,
        responseRetryAfterMs(response)
      );
    }
    return data;
  }
  async poll(taskId, signal) {
    const deadline = Date.now() + this.config.maxPollMs;
    let lastData = { task_id: taskId, status: "running", progress: 0 };
    let transientAttempts = 0;
    for (; ; ) {
      if (signal?.aborted) throw new Error("Generation cancelled");
      let data;
      try {
        data = await this.status(taskId, signal);
        lastData = data;
        transientAttempts = 0;
      } catch (error) {
        if (signal?.aborted) throw new Error("Generation cancelled");
        if (!this.isTransientError(error)) throw new Error(`Generation task ${taskId} status check failed: ${error instanceof Error ? error.message : String(error)}`);
        if (Date.now() > deadline) return { ...lastData, task_id: taskId, timedOut: true, recoverable: true };
        const retryAfterMs = error instanceof TokensApiHttpError ? error.retryAfterMs : void 0;
        await this.wait(this.retryDelay(transientAttempts, retryAfterMs), signal);
        transientAttempts += 1;
        continue;
      }
      const status = typeof data.status === "string" ? data.status : "unknown";
      if (status === "succeeded") {
        this.forgetTask(taskId);
        return data;
      }
      if (status === "failed" || status === "error" || status === "cancelled") {
        this.forgetTask(taskId);
        const errorValue = data.error;
        const error = errorValue && typeof errorValue === "object" ? errorValue.message ?? JSON.stringify(errorValue) : typeof errorValue === "string" ? errorValue : status;
        throw new Error(`Generation task ${taskId} failed: ${error}`);
      }
      if (Date.now() > deadline) return { ...data, task_id: taskId, timedOut: true, recoverable: true };
      await this.wait(this.config.pollIntervalMs, signal);
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
  defaultVideoModel: Schema.union([...VIDEO_MODELS]).default("ltx_2_5"),
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
  accountUserId: Schema.string().default(""),
  storageBackend: Schema.union(["presign", "r2"]).default("presign"),
  r2Endpoint: Schema.string().default(""),
  r2Region: Schema.string().default("auto"),
  r2AccessKeyEnv: Schema.string().role("credential-ref").default("R2_ACCESS_KEY_ID"),
  r2SecretKeyEnv: Schema.string().role("credential-ref").default("R2_SECRET_ACCESS_KEY"),
  r2Bucket: Schema.string().default(""),
  r2CdnBase: Schema.string().default(""),
  r2PathPrefix: Schema.string().default("inputs")
});
var VIDEO_ROUTE_PREFIX = "/media-gen/videos";
var DOWNLOAD_ROUTE = "/media-gen/download";
function safeDownloadName(url, requestedName) {
  const fallback = url.pathname.split("/").pop() || "media-download";
  const value = String(requestedName || fallback).replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 160);
  return value || "media-download";
}
function registerDownloadRoute(ctx) {
  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: DOWNLOAD_ROUTE,
    async handler(req, res) {
      if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405, { Allow: "GET, HEAD" });
        res.end();
        return;
      }
      let source;
      let filename;
      try {
        const requestUrl = new URL(req.url ?? DOWNLOAD_ROUTE, "http://dsh.local");
        source = new URL(requestUrl.searchParams.get("url") || "");
        filename = safeDownloadName(source, requestUrl.searchParams.get("name"));
      } catch {
        res.writeHead(400);
        res.end();
        return;
      }
      if (source.protocol !== "https:" || source.hostname !== "s3.tokensapi.ai") {
        res.writeHead(403);
        res.end();
        return;
      }
      try {
        const response = await fetch(source);
        if (!response.ok || !response.body) {
          res.writeHead(response.status || 502);
          res.end();
          return;
        }
        const headers = {
          "Content-Type": response.headers.get("content-type") || "application/octet-stream",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "private, max-age=300"
        };
        const length = response.headers.get("content-length");
        if (length) headers["Content-Length"] = length;
        res.writeHead(200, headers);
        if (req.method === "HEAD") {
          res.end();
          return;
        }
        Readable.fromWeb(response.body).pipe(res);
      } catch {
        res.writeHead(502);
        res.end();
      }
    }
  }), "media-gen: explicit download route");
}
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
function sessionUserImageRefs(exec) {
  const messages = exec.agent?.session?.deriveMessages?.() ?? [];
  const refs = [];
  for (const message of messages) {
    if (message?.role !== "user" || !Array.isArray(message.content)) continue;
    for (const block of message.content) {
      if (block?.type !== "image" || !block.attachment || typeof block.attachment !== "object") continue;
      if (typeof block.attachment.attachmentId !== "string") continue;
      refs.push(block.attachment);
    }
  }
  return refs;
}
function resolveSessionImageRef(exec, selector) {
  const refs = sessionUserImageRefs(exec);
  if (refs.length === 0) return null;
  if (!selector || selector === "latest") return refs.at(-1) ?? null;
  if (selector === "first") return refs[0] ?? null;
  if (selector === "last") return refs.at(-1) ?? null;
  const ordinal = /^(?:index:)?(\d+)$/.exec(selector);
  if (ordinal) {
    const position = Number(ordinal[1]);
    if (!Number.isSafeInteger(position) || position < 1) return null;
    return refs[position - 1] ?? null;
  }
  const attachmentId = selector.startsWith("sha256:") ? selector : `sha256:${selector}`;
  for (let index = refs.length - 1; index >= 0; index -= 1) {
    if (refs[index]?.attachmentId === attachmentId) return refs[index] ?? null;
  }
  return null;
}
function describeSessionImageSelector(selector) {
  if (!selector || selector === "latest" || selector === "last") return "\u5F53\u524D\u5BF9\u8BDD\u6700\u8FD1\u4E00\u5F20\u7528\u6237\u4E0A\u4F20\u56FE\u7247";
  if (selector === "first") return "\u5F53\u524D\u5BF9\u8BDD\u7B2C 1 \u5F20\u7528\u6237\u4E0A\u4F20\u56FE\u7247";
  const ordinal = /^(?:index:)?(\d+)$/.exec(selector);
  if (ordinal) return `\u5F53\u524D\u5BF9\u8BDD\u7B2C ${Number(ordinal[1])} \u5F20\u7528\u6237\u4E0A\u4F20\u56FE\u7247`;
  return `\u5F53\u524D\u5BF9\u8BDD\u9644\u4EF6 ${selector}`;
}
function describeImageInput(input) {
  const value = String(input ?? "");
  if (!value.startsWith("dsh-attachment:")) return value;
  return describeSessionImageSelector(value.slice("dsh-attachment:".length).trim() || "latest");
}
function supportedModelsForIntent(intent) {
  return intent === "video_gen" ? VIDEO_MODELS : intent === "image_edit" ? IMAGE_EDIT_MODELS : IMAGE_MODELS;
}
function defaultModelForIntent(intent, config) {
  return intent === "video_gen" ? config.defaultVideoModel : intent === "image_edit" ? config.defaultEditModel : config.defaultImageModel;
}
function resolveEffectiveVideoModel(params, config) {
  const model = params.model ?? config.defaultVideoModel;
  if (!VIDEO_MODELS.includes(model)) throw new Error(`Unsupported video model: ${model}`);
  return model;
}
function videoInputMode(params) {
  if (params.end_image) return "first_last_frame";
  if (params.start_image || params.image_url) return "first_frame";
  return "text";
}
function videoAudioDescription(model, generateAudio) {
  const capability = videoModelCapability(model);
  if (capability.audioMode === "required") return "\u81EA\u52A8\u751F\u6210\u97F3\u9891\uFF08\u6A21\u578B\u56FA\u5B9A\u5F00\u542F\uFF09";
  if (capability.audioMode === "not_configurable") return "\u7531\u6A21\u578B\u5DE5\u4F5C\u6D41\u51B3\u5B9A";
  return generateAudio === false ? "\u5173\u95ED" : "\u5F00\u542F";
}
function videoModelDescription(model) {
  const capability = videoModelCapability(model);
  const audio = capability.audioMode === "required" ? "\u56FA\u5B9A\u97F3\u9891" : capability.audioMode === "optional" ? "\u97F3\u9891\u53EF\u9009" : "\u97F3\u9891\u4E0D\u53EF\u914D\u7F6E";
  return `${capability.durations.join("/")} \u79D2 \xB7 ${capability.resolutions.join("/")} \xB7 ${audio}`;
}
function videoAspectRatioLabel(ratio, inputMode) {
  if (ratio !== "adaptive") return ratio;
  return inputMode === "text" ? "adaptive\uFF08\u6A21\u578B\u81EA\u52A8\u9009\u62E9\u753B\u9762\u6BD4\u4F8B\uFF09" : "adaptive\uFF08\u81EA\u52A8\u5339\u914D\u8F93\u5165\u56FE\u7247\u6BD4\u4F8B\uFF09";
}
function parseVideoAspectRatioLabel(value) {
  return stripRecommended(value).replace(/^adaptive（[^）]+）$/, "adaptive");
}
var REFERENCE_REUSE_KEYS = {
  image_gen: [],
  image_edit: ["image"],
  video_gen: ["image_url", "start_image", "end_image"]
};
var SETTINGS_REUSE_KEYS = {
  image_gen: ["model", "useDefaultModel", "aspect_ratio", "n"],
  image_edit: ["model", "useDefaultModel", "aspect_ratio", "n"],
  video_gen: ["model", "useDefaultModel", "aspect_ratio", "duration", "resolution", "generate_audio"]
};
function normalizeReuseDecisions(value) {
  if (value === void 0) return {};
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("reuse must be an object.");
  const decisions = {};
  for (const category of ["prompt", "references", "settings"]) {
    const decision = value[category];
    if (decision !== void 0 && typeof decision !== "boolean") throw new Error(`reuse.${category} must be a boolean.`);
    if (typeof decision === "boolean") decisions[category] = decision;
  }
  return decisions;
}
function normalizeContextCandidates(intent, value) {
  if (value === void 0) return {};
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("previousTask must be an object.");
  const previous = value;
  if (previous.intent !== intent) return {};
  if (previous.params === null || typeof previous.params !== "object" || Array.isArray(previous.params)) {
    throw new Error("previousTask.params must be an object.");
  }
  const source = previous.params;
  const keys = ["prompt", ...REFERENCE_REUSE_KEYS[intent], ...SETTINGS_REUSE_KEYS[intent]];
  const candidates = {};
  for (const key of keys) {
    if (source[key] !== void 0) candidates[key] = source[key];
  }
  for (const key of ["prompt", "model", "image", "aspect_ratio", "resolution", "image_url", "start_image", "end_image"]) {
    trimOptionalString(candidates, key);
  }
  for (const key of ["useDefaultModel", "generate_audio"]) {
    if (candidates[key] !== void 0 && typeof candidates[key] !== "boolean") delete candidates[key];
  }
  for (const key of ["n", "duration"]) {
    if (candidates[key] !== void 0 && (!Number.isInteger(candidates[key]) || candidates[key] <= 0)) delete candidates[key];
  }
  if (candidates.model && candidates.useDefaultModel === true) delete candidates.useDefaultModel;
  return candidates;
}
function missingReusableValues(params, candidates, keys) {
  return Object.fromEntries(keys.filter((key) => params[key] === void 0 && candidates[key] !== void 0).map((key) => [key, candidates[key]]));
}
function truncatedPrompt(value) {
  const prompt = String(value ?? "").replace(/\s+/g, " ").trim();
  return prompt.length > 180 ? `${prompt.slice(0, 177)}...` : prompt;
}
function promptSourceDescription(value) {
  if (value === "inferred") return "\u6839\u636E\u5F53\u524D\u8BF7\u6C42\u63A8\u65AD";
  if (value === "wizard") return "\u5411\u5BFC\u4E2D\u586B\u5199";
  if (value === "reused") return "\u5386\u53F2\u4EFB\u52A1\u590D\u7528";
  return "\u672C\u6B21\u8F93\u5165";
}
function reusableReferenceDetail(intent, values) {
  if (intent === "image_edit") return `\u53C2\u8003\u56FE\uFF1A${describeImageInput(values.image)}`;
  return [
    ...values.start_image || values.image_url ? [`\u9996\u5E27\uFF1A${describeImageInput(values.start_image ?? values.image_url)}`] : [],
    ...values.end_image ? [`\u5C3E\u5E27\uFF1A${describeImageInput(values.end_image)}`] : []
  ].join("\n");
}
function reusableSettingsDetail(values) {
  return [
    ...values.model ? [`\u6A21\u578B\uFF1A${values.model}`] : values.useDefaultModel === true ? ["\u6A21\u578B\uFF1A\u63A8\u8350\u6A21\u578B"] : [],
    ...values.aspect_ratio ? [`\u753B\u9762\u6BD4\u4F8B\uFF1A${values.aspect_ratio}`] : [],
    ...values.n ? [`\u6570\u91CF\uFF1A${values.n} \u5F20`] : [],
    ...values.duration ? [`\u65F6\u957F\uFF1A${values.duration} \u79D2`] : [],
    ...values.resolution ? [`\u5206\u8FA8\u7387\uFF1A${values.resolution}`] : [],
    ...typeof values.generate_audio === "boolean" ? [`\u97F3\u9891\uFF1A${values.generate_audio ? "\u5F00\u542F" : "\u5173\u95ED"}`] : []
  ].join("\n");
}
function mergeReusableValues(params, values) {
  for (const [key, value] of Object.entries(values)) {
    if (params[key] === void 0) params[key] = value;
  }
}
function pruneIncompatibleReusedSettings(intent, params, reusedKeys, config) {
  const supportedModels = supportedModelsForIntent(intent);
  if (reusedKeys.has("model") && params.model && !supportedModels.includes(params.model)) delete params.model;
  if (intent === "video_gen") {
    const model = resolveEffectiveVideoModel(params, config);
    const capability = videoModelCapability(model);
    if (reusedKeys.has("duration") && params.duration !== void 0 && !capability.durations.includes(params.duration)) delete params.duration;
    if (reusedKeys.has("resolution") && params.resolution && !capability.resolutions.includes(params.resolution)) delete params.resolution;
    if (reusedKeys.has("aspect_ratio") && params.aspect_ratio && !capability.aspectRatios.includes(params.aspect_ratio)) delete params.aspect_ratio;
    if (reusedKeys.has("generate_audio") && capability.audioMode === "required" && params.generate_audio === false) delete params.generate_audio;
    const requiredAspectRatio = capability.requiredAspectRatioByInputMode?.[videoInputMode(params)];
    if (reusedKeys.has("aspect_ratio") && requiredAspectRatio && params.aspect_ratio !== requiredAspectRatio) delete params.aspect_ratio;
  }
}
function trimOptionalString(params, key) {
  if (params[key] === void 0) return;
  if (typeof params[key] !== "string") throw new Error(`${key} must be a string.`);
  const value = params[key].trim();
  if (value) params[key] = value;
  else delete params[key];
}
function normalizeWizardKnown(intent, known, _exec) {
  if (known !== void 0 && (known === null || typeof known !== "object" || Array.isArray(known))) {
    throw new Error("known must be an object.");
  }
  const params = { ...known ?? {} };
  delete params.modelExplicit;
  for (const key of ["prompt", "originalPrompt", "promptSource", "model", "image", "aspect_ratio", "resolution", "image_url", "start_image", "end_image"]) {
    trimOptionalString(params, key);
  }
  if (params.promptSource !== void 0 && !["user", "inferred", "wizard", "reused"].includes(params.promptSource)) {
    throw new Error("promptSource must be user, inferred, wizard, or reused.");
  }
  for (const key of ["enhanced", "useDefaultModel", "skipFinalConfirmation", "generate_audio"]) {
    if (params[key] !== void 0 && typeof params[key] !== "boolean") throw new Error(`${key} must be a boolean.`);
  }
  for (const key of ["n", "duration"]) {
    if (params[key] !== void 0 && (!Number.isInteger(params[key]) || params[key] <= 0)) throw new Error(`${key} must be a positive integer.`);
  }
  if (params.reference_images !== void 0) {
    if (!Array.isArray(params.reference_images) || params.reference_images.some((value) => typeof value !== "string" || !value.trim())) {
      throw new Error("reference_images must be an array of non-empty strings.");
    }
    params.reference_images = params.reference_images.map((value) => value.trim());
  }
  if (params.model && params.useDefaultModel === true) throw new Error("model and useDefaultModel cannot both be set.");
  return params;
}
function validateWizardKnown(intent, params, config) {
  const supportedModels = supportedModelsForIntent(intent);
  if (params.model && !supportedModels.includes(params.model)) {
    throw new Error(`Model ${params.model} is not supported for ${intent}. Choose one of: ${supportedModels.join(", ")}.`);
  }
  if (intent !== "video_gen") {
    const ratios = intent === "image_gen" ? IMAGE_ASPECT_RATIOS : ASPECT_RATIOS;
    if (params.aspect_ratio && !ratios.includes(params.aspect_ratio)) {
      throw new Error(`Aspect ratio ${params.aspect_ratio} is not supported for ${intent}. Choose one of: ${ratios.join(", ")}.`);
    }
  }
  if ((intent === "image_gen" || intent === "image_edit") && params.n !== void 0 && ![1, 2, 4].includes(params.n)) {
    throw new Error("Image count n must be 1, 2, or 4.");
  }
  if (intent === "video_gen") {
    const model = resolveEffectiveVideoModel(params, config);
    const capability = videoModelCapability(model);
    const inputMode = videoInputMode(params);
    if (params.aspect_ratio && !capability.aspectRatios.includes(params.aspect_ratio)) {
      throw new Error(`Aspect ratio ${params.aspect_ratio} is not supported by ${model}. Choose one of: ${capability.aspectRatios.join(", ")}.`);
    }
    const requiredAspectRatio = capability.requiredAspectRatioByInputMode?.[inputMode];
    if (requiredAspectRatio && params.aspect_ratio && params.aspect_ratio !== requiredAspectRatio) {
      throw new Error(`${model} ${inputMode} requires aspect_ratio=${requiredAspectRatio}.`);
    }
    if (params.duration !== void 0 && !capability.durations.includes(params.duration)) {
      throw new Error(`Duration ${params.duration} is not supported by ${model}. Choose one of: ${capability.durations.join(", ")}.`);
    }
    if (params.resolution && !capability.resolutions.includes(params.resolution)) {
      throw new Error(`Resolution ${params.resolution} is not supported by ${model}. Choose one of: ${capability.resolutions.join(", ")}.`);
    }
    if (capability.audioMode === "required" && params.generate_audio === false) {
      throw new Error(`${model} requires generated audio to remain enabled.`);
    }
    if (capability.audioMode === "not_configurable" && params.generate_audio !== void 0) {
      throw new Error(`${model} does not expose a configurable audio parameter.`);
    }
  }
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
function pendingTaskFields(data) {
  return {
    timedOut: true,
    recoverable: true,
    status: typeof data.status === "string" ? data.status : "running",
    progress: typeof data.progress === "number" ? data.progress : 0
  };
}
function pendingTaskBlock(value) {
  if (value.timedOut !== true) return void 0;
  return {
    type: "text",
    text: [
      `Task ${value.taskId} is still running (${value.progress ?? 0}%).`,
      "The task id has been retained. Use media_task_status to continue checking; do not submit the generation again."
    ].join("\n")
  };
}
function imageOutputSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      taskId: { type: "string", required: true },
      model: { type: "string", required: true },
      timedOut: { type: "boolean" },
      recoverable: { type: "boolean" },
      status: { type: "string" },
      progress: { type: "integer" },
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
async function prepareInput(config, api, input, exec, attachments) {
  const trimmed = String(input ?? "dsh-attachment:latest").trim();
  if (trimmed.startsWith("dsh-attachment:")) {
    if (!exec.agent) throw new Error("Chat attachment input requires a session-scoped tool call.");
    if (!attachments?.readImage) throw new Error("DSH attachment storage is unavailable.");
    const selector = trimmed.slice("dsh-attachment:".length).trim() || "latest";
    const ref = resolveSessionImageRef(exec, selector);
    if (!ref) {
      const count = sessionUserImageRefs(exec).length;
      throw new Error(selector === "latest" ? "No user-uploaded image was found in the current conversation." : `Image selector ${selector} did not match the current conversation's ${count} user-uploaded image(s). Use latest, first, last, a 1-based number, index:N, or a current-conversation attachment id.`);
    }
    const stored = await attachments.readImage(ref, exec.signal);
    if (!stored?.data) throw new Error("DSH attachment storage returned no image bytes.");
    if (stored.data.byteLength > config.maxInputImageBytes) throw new Error(`Image input exceeds the ${config.maxInputImageBytes} byte limit.`);
    const mediaType = stored.ref?.mediaType ?? ref.mediaType;
    if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(mediaType)) {
      throw new Error(`Unsupported chat attachment image type: ${mediaType ?? "unknown"}`);
    }
    const dataUrl = `data:${mediaType};base64,${Buffer.from(stored.data).toString("base64")}`;
    return api.uploadImage(dataUrl, exec.signal);
  }
  if (!config.allowLocalImageInput && !/^https:\/\//i.test(trimmed)) {
    throw new Error("Local image input is disabled by plugin configuration.");
  }
  const resolved = await resolveImageInput(trimmed, config.maxInputImageBytes);
  if (resolved.source === "remote") return resolved.value;
  return api.uploadImage(resolved.value, exec.signal);
}
function apply(ctx, config) {
  const api = new TokensApiClient(ctx, config);
  registerDownloadRoute(ctx);
  registerVideoRoute(ctx, config);
  const attachments = ctx.get("attachments");
  const register = (spec) => ctx.tools.register(defineTool(spec));
  ctx.systemPrompt.section({
    name: "media-gen:wizard",
    order: 200,
    text: `Before calling media_wizard, infer the user's media intent and separate current-request parameters from reusable historical context. media_wizard is a missing-parameter completer and reuse-consent gate, not a fixed questionnaire.

Infer intent from the requested outcome; the user does not need to say "generate an image" or "edit an image". Put only values supplied by the current user request, its newly attached media, or an explicit reuse instruction into known. Do not silently copy a previous task's prompt, reference images, model, aspect ratio, count, duration, resolution, or audio choice into known. When the most recent completed task of the same intent contains potentially reusable values that the current request did not explicitly supply, put its intent and final params into previousTask instead. The wizard will ask for consent before merging them.

For image editing, when the current request itself contains one unambiguous target image, pass image: "dsh-attachment:latest" and use the current requested change as prompt. When the user refers to an ordered image, use dsh-attachment:1, dsh-attachment:2, first, last, index:N, or a current-conversation attachment id. If multiple images exist and the target or role is ambiguous, leave image absent. Never invent a local path or URL for a chat attachment.

Known-field contract: prompt is the current requested content or edit; promptSource is user or inferred when supplied before the wizard; enhanced is a boolean only when explicitly chosen; model is present only for an explicit supported model choice; useDefaultModel is true only after an explicit default-model choice; aspect_ratio, n, duration, resolution, generate_audio, image_url, start_image, end_image, and reference_images are supplied only when stated or unambiguously derived from the current request. Set skipFinalConfirmation only when explicitly requested.

Reuse contract: previousTask contains only the most recent completed same-intent task and its final params. reuse contains explicit per-category decisions only when the user already said whether to reuse prompt, references, or settings. Use true for explicit reuse and false for explicit reset. Leave a category absent when the request is ambiguous, such as "generate another video", so the wizard asks. Phrases such as "another identical one" can set all available categories true; "do not reuse anything" can set them false; "change the content but keep other settings" should set prompt false and settings true. Current known values always win over reused values.

The wizard must complete any remaining confirmation flow before media_generate_image, media_edit_image, or media_generate_video. If the user chooses the plugin default model, do not pass model to the final generation tool; only pass model after an explicit model choice. For video generation, pass the wizard's generate_audio value to media_generate_video when present.

Submission safety contract: a network error, HTTP 429, unchanged progress, or a timed-out foreground wait does not authorize another generation submission. If a generation result includes a taskId, timedOut, recoverable, or says the submission status is uncertain, do not call a media_generate_* tool again for that request. Continue with media_task_status when a taskId is known. The plugin reuses the same in-process idempotency operation for an uncertain identical request; never change parameters merely to force a retry.`
  });
  register({
    name: "media_wizard",
    description: "Context-aware media task wizard. Pass current-request values in known, prior same-intent task values in previousTask, and explicit reuse decisions in reuse. Historical values are never merged without consent.",
    parameters: {
      intent: { type: "string", enum: ["image_gen", "image_edit", "video_gen"], required: true },
      known: {
        type: "object",
        additionalProperties: true,
        description: "Parameters already supplied or unambiguously derived from the user request. Supported fields include prompt, promptSource, enhanced, model, useDefaultModel, skipFinalConfirmation, image, aspect_ratio, n, duration, resolution, generate_audio, image_url, start_image, end_image, and reference_images. Do not invent missing values."
      },
      previousTask: {
        type: "object",
        additionalProperties: false,
        description: "Most recent completed task of the same media intent, supplied only as reusable context candidates.",
        properties: {
          intent: { type: "string", enum: ["image_gen", "image_edit", "video_gen"], required: true },
          params: { type: "object", additionalProperties: true, required: true }
        }
      },
      reuse: {
        type: "object",
        additionalProperties: false,
        description: "Explicit reuse decisions already stated by the user. Omit ambiguous categories so the wizard asks.",
        properties: {
          prompt: { type: "boolean" },
          references: { type: "boolean" },
          settings: { type: "boolean" }
        }
      }
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
          reuseDecisions: { type: "object", additionalProperties: true },
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
          `Reuse decisions: ${JSON.stringify(value.reuseDecisions ?? {})}`,
          `Parameters:
${JSON.stringify(value.params, null, 2)}`
        ].join("\n")
      }]
    },
    async execute(args, exec) {
      const intent = args.intent;
      const params = normalizeWizardKnown(intent, args.known, exec);
      validateWizardKnown(intent, params, config);
      const contextCandidates = normalizeContextCandidates(intent, args.previousTask);
      const reuseDecisions = normalizeReuseDecisions(args.reuse);
      const reusablePrompt = missingReusableValues(params, contextCandidates, ["prompt"]);
      const reusableReferences = missingReusableValues(params, contextCandidates, REFERENCE_REUSE_KEYS[intent]);
      const reusableSettings = missingReusableValues(params, contextCandidates, SETTINGS_REUSE_KEYS[intent]);
      const reuseQuestions = [];
      if (Object.keys(reusablePrompt).length && reuseDecisions.prompt === void 0) {
        reuseQuestions.push({
          id: "reuse_prompt",
          header: "\u5386\u53F2 Prompt",
          question: "\u662F\u5426\u590D\u7528\u4E0A\u4E00\u6B21\u4EFB\u52A1\u7684 Prompt\uFF1F",
          detail: `\u4E0A\u6B21 Prompt\uFF1A${truncatedPrompt(reusablePrompt.prompt)}`,
          options: [{ label: "\u4E0D\u590D\u7528", description: "\u6309\u672C\u6B21\u65B0\u4EFB\u52A1\u91CD\u65B0\u586B\u5199 Prompt" }, { label: "\u590D\u7528", description: "\u6CBF\u7528\u4E0A\u4E00\u6B21\u4EFB\u52A1\u7684 Prompt" }]
        });
      }
      if (Object.keys(reusableReferences).length && reuseDecisions.references === void 0) {
        reuseQuestions.push({
          id: "reuse_references",
          header: "\u5386\u53F2\u53C2\u8003\u7D20\u6750",
          question: "\u662F\u5426\u590D\u7528\u4E0A\u4E00\u6B21\u4EFB\u52A1\u7684\u53C2\u8003\u56FE\u6216\u9996\u5C3E\u5E27\uFF1F",
          detail: reusableReferenceDetail(intent, reusableReferences),
          options: [{ label: "\u4E0D\u590D\u7528", description: "\u672C\u6B21\u4E0D\u4F7F\u7528\u5386\u53F2\u53C2\u8003\u7D20\u6750" }, { label: "\u590D\u7528", description: "\u6CBF\u7528\u4E0A\u4E00\u6B21\u4EFB\u52A1\u7684\u53C2\u8003\u7D20\u6750" }]
        });
      }
      if (Object.keys(reusableSettings).length && reuseDecisions.settings === void 0) {
        reuseQuestions.push({
          id: "reuse_settings",
          header: "\u5386\u53F2\u751F\u6210\u53C2\u6570",
          question: "\u662F\u5426\u590D\u7528\u4E0A\u4E00\u6B21\u4EFB\u52A1\u7684\u751F\u6210\u53C2\u6570\uFF1F",
          detail: reusableSettingsDetail(reusableSettings),
          options: [{ label: "\u4E0D\u590D\u7528", description: "\u91CD\u65B0\u9009\u62E9\u6A21\u578B\u548C\u8F93\u51FA\u53C2\u6570" }, { label: "\u590D\u7528", description: "\u6CBF\u7528\u53EF\u517C\u5BB9\u7684\u6A21\u578B\u548C\u8F93\u51FA\u53C2\u6570" }]
        });
      }
      if (reuseQuestions.length) {
        const answers = await ask(ctx, exec, reuseQuestions);
        if (answers.reuse_prompt) reuseDecisions.prompt = stripRecommended(selected(answers.reuse_prompt)) === "\u590D\u7528";
        if (answers.reuse_references) reuseDecisions.references = stripRecommended(selected(answers.reuse_references)) === "\u590D\u7528";
        if (answers.reuse_settings) reuseDecisions.settings = stripRecommended(selected(answers.reuse_settings)) === "\u590D\u7528";
      }
      if (reuseDecisions.prompt === true) {
        mergeReusableValues(params, reusablePrompt);
        if (reusablePrompt.prompt && !params.promptSource) params.promptSource = "reused";
      }
      if (reuseDecisions.references === true) mergeReusableValues(params, reusableReferences);
      const reusedSettingKeys = /* @__PURE__ */ new Set();
      if (reuseDecisions.settings === true) {
        mergeReusableValues(params, reusableSettings);
        for (const key of Object.keys(reusableSettings)) reusedSettingKeys.add(key);
        pruneIncompatibleReusedSettings(intent, params, reusedSettingKeys, config);
      }
      validateWizardKnown(intent, params, config);
      const promptProvidedBeforeWizard = Boolean(params.prompt);
      if (promptProvidedBeforeWizard && !params.promptSource) params.promptSource = "user";
      let needsImage = false;
      let promptConfirmed = false;
      let modelChoiceConfirmed = false;
      let modelExplicit = false;
      let finalConfirmed = false;
      const result = () => ({ intent, confirmed: promptConfirmed && modelChoiceConfirmed && finalConfirmed, promptConfirmed, modelChoiceConfirmed, modelExplicit, finalConfirmed, needsImage, reuseDecisions, params });
      try {
        if (intent === "image_edit" && !params.image) {
          const imageCount = sessionUserImageRefs(exec).length;
          const answers = await ask(ctx, exec, [{
            id: "image",
            header: "\u53C2\u8003\u56FE",
            question: imageCount > 0 ? `\u5386\u53F2\u56FE\u7247\u4E0D\u4F1A\u81EA\u52A8\u590D\u7528\u3002\u8BF7\u660E\u786E\u8F93\u5165 dsh-attachment:1 \u81F3 dsh-attachment:${imageCount}\uFF0C\u6216\u63D0\u4F9B HTTPS URL / \u672C\u5730\u56FE\u7247\u8DEF\u5F84` : "\u5F53\u524D\u5BF9\u8BDD\u4E2D\u6CA1\u6709\u7528\u6237\u4E0A\u4F20\u7684\u56FE\u7247\u3002\u8BF7\u8F93\u5165 HTTPS URL / \u672C\u5730\u56FE\u7247\u8DEF\u5F84"
          }]);
          params.image = selected(answers.image);
          if (!params.image) {
            needsImage = true;
            return result();
          }
        }
        if (intent === "video_gen") {
          const hasInput = params.image_url || params.start_image || params.end_image || Array.isArray(params.reference_images) && params.reference_images.length;
          if (!hasInput && !params.prompt) {
            const answers = await ask(ctx, exec, [{ id: "video_input", header: "\u89C6\u9891\u7C7B\u578B", question: "\u9009\u62E9\u89C6\u9891\u751F\u6210\u65B9\u5F0F", options: [{ label: "\u7EAF\u6587\u751F\u89C6\u9891\uFF08\u63A8\u8350\uFF09" }, { label: "\u4F7F\u7528\u9996\u5E27\u56FE\u7247" }, { label: "\u4F7F\u7528\u9996\u5E27\u548C\u5C3E\u5E27\u56FE\u7247" }] }]);
            const choice = stripRecommended(selected(answers.video_input));
            if (!choice) return result();
            if (choice === "\u4F7F\u7528\u9996\u5E27\u56FE\u7247") {
              const imageAnswers = await ask(ctx, exec, [{ id: "start_image", header: "\u9996\u5E27\u56FE\u7247", question: "\u8BF7\u9009\u62E9\u5DF2\u9644\u52A0\u7684\u9996\u5E27\u56FE\u7247\uFF0C\u6216\u8F93\u5165 dsh-attachment \u9009\u62E9\u5668 / HTTPS URL / \u672C\u5730\u56FE\u7247\u8DEF\u5F84" }]);
              params.start_image = selected(imageAnswers.start_image);
              if (!params.start_image) {
                needsImage = true;
                return result();
              }
            }
            if (choice === "\u4F7F\u7528\u9996\u5E27\u548C\u5C3E\u5E27\u56FE\u7247") {
              const imageAnswers = await ask(ctx, exec, [
                { id: "start_image", header: "\u9996\u5E27\u56FE\u7247", question: "\u8BF7\u9009\u62E9\u9996\u5E27\u56FE\u7247\uFF0C\u6216\u8F93\u5165 dsh-attachment \u9009\u62E9\u5668 / HTTPS URL / \u672C\u5730\u56FE\u7247\u8DEF\u5F84" },
                { id: "end_image", header: "\u5C3E\u5E27\u56FE\u7247", question: "\u8BF7\u9009\u62E9\u5C3E\u5E27\u56FE\u7247\uFF0C\u6216\u8F93\u5165 dsh-attachment \u9009\u62E9\u5668 / HTTPS URL / \u672C\u5730\u56FE\u7247\u8DEF\u5F84" }
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
          const answers = await ask(ctx, exec, [{ id: "prompt", header: "\u539F\u59CB Prompt", question: intent === "image_edit" ? "\u8BF7\u63CF\u8FF0\u4F60\u60F3\u600E\u4E48\u4FEE\u6539\u56FE\u7247" : intent === "video_gen" ? "\u8BF7\u63CF\u8FF0\u4F60\u60F3\u751F\u6210\u7684\u89C6\u9891" : "\u8BF7\u63CF\u8FF0\u4F60\u60F3\u751F\u6210\u7684\u56FE\u7247" }]);
          params.prompt = selected(answers.prompt);
          if (!params.prompt) return result();
          params.prompt = String(params.prompt).trim();
          params.promptSource = "wizard";
        }
        if (params.enhanced === true && !config.enhanceEnabled) throw new Error("Prompt enhancement was requested, but enhancement is disabled by plugin configuration.");
        if (params.enhanced === true && !params.originalPrompt) {
          const original = params.prompt;
          const enhanced = await api.enhance(intent, original, exec.signal);
          params.originalPrompt = original;
          params.prompt = enhanced;
          params.enhanced = enhanced !== original;
        }
        if (params.enhanced === void 0) {
          const enhanceOptions = config.enhanceEnabled ? [{ label: "\u589E\u5F3A Prompt\uFF08\u63A8\u8350\uFF09", description: "\u4F18\u5316\u89C6\u89C9\u3001\u955C\u5934\u548C\u8D28\u91CF\u7EC6\u8282" }, { label: "\u4FDD\u6301\u539F\u59CB Prompt", description: "\u4E0D\u4FEE\u6539\u5185\u5BB9\u63CF\u8FF0" }] : [{ label: "\u4FDD\u6301\u539F\u59CB Prompt\uFF08\u63A8\u8350\uFF09", description: "\u5F53\u524D\u672A\u542F\u7528\u63D0\u793A\u8BCD\u589E\u5F3A\u670D\u52A1" }];
          const answers = await ask(ctx, exec, [{
            id: "enhance",
            header: "Prompt \u589E\u5F3A",
            question: "\u662F\u5426\u589E\u5F3A\u4E0B\u9762\u7684 Prompt\uFF1F",
            detail: `\u5F53\u524D Prompt
\u6765\u6E90\uFF1A${promptSourceDescription(params.promptSource)}

${params.prompt}`,
            options: enhanceOptions
          }]);
          const choice = stripRecommended(selected(answers.enhance));
          if (!choice) return result();
          if (choice === "\u589E\u5F3A Prompt") {
            const original = params.prompt;
            const enhanced = await api.enhance(intent, original, exec.signal);
            params.originalPrompt = original;
            params.prompt = enhanced;
            params.enhanced = enhanced !== original;
          } else params.enhanced = false;
        }
        const promptWasEnhanced = Boolean(params.originalPrompt && params.prompt !== params.originalPrompt);
        if (promptWasEnhanced) {
          const promptAnswers = await ask(ctx, exec, [{ id: "prompt_confirm", header: "\u786E\u8BA4\u589E\u5F3A\u540E Prompt", question: "Prompt \u5DF2\u88AB\u589E\u5F3A\uFF0C\u662F\u5426\u4F7F\u7528\u589E\u5F3A\u540E\u7684\u5185\u5BB9\uFF1F", detail: `\u539F\u59CB Prompt:
${params.originalPrompt}

\u589E\u5F3A\u540E Prompt:
${params.prompt}`, options: [{ label: "\u786E\u8BA4\u589E\u5F3A\u540E Prompt\uFF08\u63A8\u8350\uFF09" }, { label: "\u53D6\u6D88" }] }]);
          promptConfirmed = stripRecommended(selected(promptAnswers.prompt_confirm)) === "\u786E\u8BA4\u589E\u5F3A\u540E Prompt";
        } else promptConfirmed = Boolean(params.prompt);
        if (!promptConfirmed) return result();
        const selectableModels = supportedModelsForIntent(intent);
        const defaultModel = defaultModelForIntent(intent, config);
        if (params.model) {
          modelChoiceConfirmed = true;
          modelExplicit = true;
          delete params.useDefaultModel;
        } else if (params.useDefaultModel === true) {
          modelChoiceConfirmed = true;
          modelExplicit = false;
          delete params.model;
        } else {
          const defaultModelLabel = `${defaultModel}\uFF08\u63A8\u8350\uFF09`;
          const modelOptions = selectableModels.map((model) => ({
            label: model === defaultModel ? defaultModelLabel : model,
            ...intent === "video_gen" ? { description: `${model === defaultModel ? "\u4F7F\u7528\u63D2\u4EF6\u5F53\u524D\u914D\u7F6E\u7684\u9ED8\u8BA4\u6A21\u578B\uFF1B" : ""}${videoModelDescription(model)}` } : model === defaultModel ? { description: "\u4F7F\u7528\u63D2\u4EF6\u5F53\u524D\u914D\u7F6E\u7684\u9ED8\u8BA4\u6A21\u578B" } : {}
          }));
          const modelAnswers = await ask(ctx, exec, [{ id: "model", header: "\u6A21\u578B", question: "\u9009\u62E9\u6A21\u578B", options: modelOptions }]);
          const rawModelChoice = selected(modelAnswers.model);
          if (!rawModelChoice) return result();
          const usesPluginDefault = rawModelChoice === defaultModelLabel;
          modelChoiceConfirmed = true;
          if (usesPluginDefault) {
            params.useDefaultModel = true;
            delete params.model;
            modelExplicit = false;
          } else {
            params.model = stripRecommended(rawModelChoice);
            delete params.useDefaultModel;
            modelExplicit = true;
          }
        }
        const effectiveVideoModel = intent === "video_gen" ? resolveEffectiveVideoModel(params, config) : void 0;
        const videoCapability = effectiveVideoModel ? videoModelCapability(effectiveVideoModel) : void 0;
        const selectedVideoInputMode = intent === "video_gen" ? videoInputMode(params) : void 0;
        if (videoCapability && selectedVideoInputMode) {
          const requiredAspectRatio = videoCapability.requiredAspectRatioByInputMode?.[selectedVideoInputMode];
          if (requiredAspectRatio && !params.aspect_ratio) params.aspect_ratio = requiredAspectRatio;
          if (videoCapability.audioMode === "required" && params.generate_audio === void 0) params.generate_audio = true;
        }
        const outputQuestions = [];
        if (intent === "image_gen" && !params.aspect_ratio) outputQuestions.push({ id: "aspect_ratio", header: "\u753B\u9762\u6BD4\u4F8B", question: "\u9009\u62E9\u753B\u9762\u6BD4\u4F8B", options: IMAGE_ASPECT_RATIOS.map((ratio) => ({ label: ratio === "1:1" ? `${ratio}\uFF08\u63A8\u8350\uFF09` : ratio })) });
        if (intent === "image_edit" && !params.aspect_ratio) outputQuestions.push({ id: "aspect_ratio", header: "\u753B\u9762\u6BD4\u4F8B", question: "\u9009\u62E9\u753B\u9762\u6BD4\u4F8B", options: ASPECT_RATIOS.map((ratio, index) => ({ label: index === 0 ? `${ratio}\uFF08\u63A8\u8350\uFF09` : ratio })) });
        if (intent === "video_gen" && videoCapability && selectedVideoInputMode && !params.aspect_ratio) outputQuestions.push({ id: "aspect_ratio", header: "\u753B\u9762\u6BD4\u4F8B", question: "\u9009\u62E9\u753B\u9762\u6BD4\u4F8B", options: videoCapability.aspectRatios.map((ratio) => {
          const label = videoAspectRatioLabel(ratio, selectedVideoInputMode);
          return { label: ratio === videoCapability.defaultAspectRatio ? `${label}\uFF08\u63A8\u8350\uFF09` : label };
        }) });
        if (intent === "video_gen" && videoCapability && !params.duration) outputQuestions.push({ id: "duration", header: "\u65F6\u957F", question: "\u9009\u62E9\u89C6\u9891\u65F6\u957F", options: videoCapability.durations.map((duration) => ({ label: duration === videoCapability.defaultDuration ? `${duration} \u79D2\uFF08\u63A8\u8350\uFF09` : `${duration} \u79D2` })) });
        if (intent === "video_gen" && videoCapability && videoCapability.resolutions.length > 1 && !params.resolution) outputQuestions.push({ id: "resolution", header: "\u5206\u8FA8\u7387", question: "\u9009\u62E9\u89C6\u9891\u5206\u8FA8\u7387", options: videoCapability.resolutions.map((resolution) => ({ label: resolution === videoCapability.defaultResolution ? `${resolution}\uFF08\u63A8\u8350\uFF09` : resolution })) });
        if (intent === "video_gen" && videoCapability?.audioMode === "optional" && params.generate_audio === void 0) outputQuestions.push({ id: "generate_audio", header: "\u751F\u6210\u97F3\u9891", question: "\u662F\u5426\u751F\u6210\u89C6\u9891\u97F3\u9891\uFF1F", options: [{ label: "\u5F00\u542F\u97F3\u9891\uFF08\u63A8\u8350\uFF09", description: "\u89C6\u9891\u5C06\u5305\u542B\u6A21\u578B\u751F\u6210\u7684\u97F3\u9891" }, { label: "\u5173\u95ED\u97F3\u9891", description: "\u751F\u6210\u65E0\u97F3\u9891\u89C6\u9891" }] });
        if ((intent === "image_gen" || intent === "image_edit") && !params.n) outputQuestions.push({ id: "n", header: "\u6570\u91CF", question: "\u751F\u6210\u51E0\u5F20\uFF1F", options: [{ label: "1 \u5F20\uFF08\u63A8\u8350\uFF09" }, { label: "2 \u5F20" }, { label: "4 \u5F20" }] });
        if (outputQuestions.length) {
          const answers = await ask(ctx, exec, outputQuestions);
          if (answers.aspect_ratio) params.aspect_ratio = intent === "video_gen" ? parseVideoAspectRatioLabel(selected(answers.aspect_ratio)) : stripRecommended(selected(answers.aspect_ratio));
          if (answers.duration) params.duration = numberLabel(selected(answers.duration));
          if (answers.resolution) params.resolution = stripRecommended(selected(answers.resolution));
          if (answers.generate_audio) params.generate_audio = stripRecommended(selected(answers.generate_audio)) === "\u5F00\u542F\u97F3\u9891";
          if (answers.n) params.n = numberLabel(selected(answers.n));
        }
        validateWizardKnown(intent, params, config);
        const videoParametersPresent = videoCapability ? Boolean(params.duration) && (videoCapability.resolutions.length === 1 || Boolean(params.resolution)) && (videoCapability.audioMode !== "optional" || typeof params.generate_audio === "boolean") : false;
        const requiredParametersPresent = Boolean(params.aspect_ratio) && (intent === "video_gen" ? videoParametersPresent : Boolean(params.n));
        if (!requiredParametersPresent) return result();
        const taskLabel = intent === "image_edit" ? "\u56FE\u7247\u7F16\u8F91" : intent === "video_gen" ? "\u89C6\u9891\u751F\u6210" : "\u56FE\u7247\u751F\u6210";
        const inputLines = intent === "image_edit" ? [`- \u53C2\u8003\u56FE: ${describeImageInput(params.image)}`] : intent === "video_gen" ? [
          ...params.start_image || params.image_url ? [`- \u9996\u5E27\u56FE\u7247: ${describeImageInput(params.start_image ?? params.image_url)}`] : [],
          ...params.end_image ? [`- \u5C3E\u5E27\u56FE\u7247: ${describeImageInput(params.end_image)}`] : [],
          ...Array.isArray(params.reference_images) && params.reference_images.length ? [`- \u53C2\u8003\u56FE\u7247: ${params.reference_images.map(describeImageInput).join(", ")}`] : []
        ] : [];
        const parameterLines = [
          `- \u4EFB\u52A1: ${taskLabel}`,
          ...inputLines,
          `- \u5185\u5BB9: ${params.prompt}`,
          `- Prompt \u6765\u6E90: ${params.promptSource ?? (promptProvidedBeforeWizard ? "user" : "wizard")}`,
          `- Prompt \u589E\u5F3A: ${promptWasEnhanced ? "\u5DF2\u589E\u5F3A" : "\u672A\u589E\u5F3A"}`,
          `- \u6A21\u578B: ${params.model ?? `${defaultModel}\uFF08\u63A8\u8350\uFF09`}`,
          `- \u753B\u9762\u6BD4\u4F8B: ${intent === "video_gen" && selectedVideoInputMode ? videoAspectRatioLabel(params.aspect_ratio, selectedVideoInputMode) : params.aspect_ratio}`,
          ...params.duration ? [`- \u65F6\u957F: ${params.duration} \u79D2`] : [],
          ...intent === "video_gen" && videoCapability ? [`- \u5206\u8FA8\u7387: ${params.resolution ?? videoCapability.defaultResolution}`] : [],
          ...intent === "video_gen" && effectiveVideoModel ? [`- \u97F3\u9891: ${videoAudioDescription(effectiveVideoModel, params.generate_audio)}`] : [],
          ...params.n ? [`- \u6570\u91CF: ${params.n} \u5F20`] : []
        ];
        if (params.skipFinalConfirmation === true) finalConfirmed = true;
        else {
          const finalAnswers = await ask(ctx, exec, [{ id: "final_confirm", header: "\u6700\u7EC8\u786E\u8BA4", question: "\u6309\u4EE5\u4E0B\u5B8C\u6574\u914D\u7F6E\u521B\u5EFA\u4EFB\u52A1\u5417\uFF1F", detail: parameterLines.join("\n"), options: [{ label: "\u786E\u8BA4\u751F\u6210\uFF08\u63A8\u8350\uFF09" }, { label: "\u53D6\u6D88" }] }]);
          finalConfirmed = stripRecommended(selected(finalAnswers.final_confirm)) === "\u786E\u8BA4\u751F\u6210";
        }
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
      render: (_args, value) => {
        const blocks = imageBlocks(value.images, "Generated images", value.model, value.taskId);
        const pending = pendingTaskBlock(value);
        if (pending) blocks.push(pending);
        return blocks;
      }
    },
    async execute(args, exec) {
      const model = args.model ?? config.defaultImageModel;
      const body = { model, prompt: args.prompt, aspect_ratio: args.aspect_ratio ?? "1:1", n: args.n ?? 1 };
      const taskId = await api.submit("images", body, exec.signal, body);
      const data = await api.poll(taskId, exec.signal);
      const timedOut = data.timedOut === true;
      const images = timedOut ? [] : await saveImages(api.urls(data), taskId, attachments, exec.signal);
      if (!timedOut && images.length > 0) exec.concludeTurn();
      return { taskId, model, images, ...timedOut ? pendingTaskFields(data) : {} };
    }
  });
  register({
    name: "media_edit_image",
    description: "Edit an image with TokensAPI. Omit image to use the latest user-uploaded image in the current conversation; HTTPS URLs and local/data images are also supported.",
    parameters: {
      prompt: { type: "string", required: true },
      image: { type: "string", description: "Optional image source: dsh-attachment:latest, first, last, a 1-based selector such as dsh-attachment:2, index:N, a current-conversation attachment id, HTTPS URL, local path, or data URL. Defaults to the latest user-uploaded conversation image." },
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
      const image = await prepareInput(config, api, args.image, exec, attachments);
      const body = {
        model,
        prompt: args.prompt,
        n: args.n ?? 1,
        ...args.aspect_ratio ? { aspect_ratio: args.aspect_ratio } : {},
        input_references: [{ type: "image_url", slot_name: "reference_1", image_url: { url: image } }]
      };
      const deduplicationInput = { ...args, model, image: args.image ?? "dsh-attachment:latest" };
      const taskId = await api.submit("images", body, exec.signal, deduplicationInput);
      const data = await api.poll(taskId, exec.signal);
      const timedOut = data.timedOut === true;
      const images = timedOut ? [] : await saveImages(api.urls(data), taskId, attachments, exec.signal);
      if (!timedOut && images.length > 0) exec.concludeTurn();
      return { taskId, model, images, ...timedOut ? pendingTaskFields(data) : {} };
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
      generateAudio: { type: "boolean" },
      timedOut: { type: "boolean" },
      recoverable: { type: "boolean" },
      status: { type: "string" },
      progress: { type: "integer" },
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
      ...typeof value.generateAudio === "boolean" ? [`Audio: ${value.generateAudio ? "enabled" : "disabled"}`] : [],
      ...value.error ? [`Local save warning: ${value.error}`] : [],
      ...value.timedOut ? [`Task is still running (${value.progress ?? 0}%). Use media_task_status with this task id; do not submit the generation again.`] : []
    ];
    blocks.push({ type: "text", text: lines.join("\n") });
    return blocks;
  };
  register({
    name: "media_generate_video",
    description: "Generate a short TokensAPI video with model-aware duration, resolution, aspect-ratio, frame-image, and audio validation. Image inputs accept dsh-attachment selectors, HTTPS URLs, local paths, and data URLs.",
    parameters: {
      prompt: { type: "string", required: true },
      model: { type: "string", enum: [...VIDEO_MODELS] },
      duration: { type: "integer", enum: [...DURATIONS] },
      resolution: { type: "string", enum: [...SEEDANCE_RESOLUTIONS] },
      aspect_ratio: { type: "string", enum: [...VIDEO_ASPECT_RATIOS] },
      generate_audio: { type: "boolean", description: "Seedance audio switch. LTX 2.3, LTX 2.5, and MiniMax H3 audio remains enabled." },
      image_url: { type: "string", description: "Legacy first-frame input; supports dsh-attachment selectors, HTTPS URL, local path, or data URL." },
      reference_images: { type: "array", items: { type: "string" }, description: "Reference image inputs support dsh-attachment selectors, although the current production video contract may reject generic references." },
      start_image: { type: "string", description: "First-frame input; supports dsh-attachment selectors, HTTPS URL, local path, or data URL." },
      end_image: { type: "string", description: "Last-frame input; supports dsh-attachment selectors, HTTPS URL, local path, or data URL." }
    },
    output: { schema: videoSchema, render: renderVideo },
    async execute(args, exec) {
      const model = args.model ?? config.defaultVideoModel;
      const capability = videoModelCapability(model);
      const firstInput = args.start_image ?? args.image_url;
      if (args.end_image && !firstInput) throw new Error("end_image requires start_image or image_url");
      if (Array.isArray(args.reference_images) && args.reference_images.length > 0) {
        throw new Error("Version 0.3.3 supports first/last frame_images, not generic reference_images.");
      }
      const inputMode = videoInputMode({ ...args, ...firstInput ? { start_image: firstInput } : {} });
      if (!capability.inputModes.includes(inputMode)) throw new Error(`${model} does not support video input mode ${inputMode}.`);
      const requiredAspectRatio = capability.requiredAspectRatioByInputMode?.[inputMode];
      const aspectRatio = args.aspect_ratio ?? requiredAspectRatio;
      if (capability.audioMode === "required" && args.generate_audio === false) {
        throw new Error(`${model} requires generated audio to remain enabled.`);
      }
      const generateAudio = capability.audioMode === "required" ? true : args.generate_audio ?? capability.defaultAudioEnabled;
      validateWizardKnown("video_gen", {
        ...args,
        model,
        ...aspectRatio ? { aspect_ratio: aspectRatio } : {},
        generate_audio: generateAudio
      }, config);
      const startImage = typeof firstInput === "string" ? await prepareInput(config, api, firstInput, exec, attachments) : void 0;
      const endImage = typeof args.end_image === "string" ? await prepareInput(config, api, args.end_image, exec, attachments) : void 0;
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
        ...aspectRatio ? { aspect_ratio: aspectRatio } : {},
        ...capability.generateAudioParameter === "required_true" ? { generate_audio: true } : {},
        ...capability.generateAudioParameter === "optional" ? { generate_audio: generateAudio } : {},
        ...frameImages.length ? { frame_images: frameImages } : {}
      };
      const deduplicationInput = {
        ...args,
        model,
        ...aspectRatio ? { aspect_ratio: aspectRatio } : {},
        generate_audio: generateAudio,
        ...firstInput ? { start_image: firstInput } : {}
      };
      const taskId = await api.submit("videos", body, exec.signal, deduplicationInput);
      const data = await api.poll(taskId, exec.signal);
      if (data.timedOut === true) return { taskId, model, generateAudio, ...pendingTaskFields(data) };
      const url = api.urls(data)[0];
      const saved = await saveVideo(url, taskId, config, exec.signal);
      const media = data.media && typeof data.media === "object" ? data.media : {};
      if (url) exec.concludeTurn();
      return {
        taskId,
        model,
        generateAudio,
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
    description: "Check and recover a TokensAPI media task. Completed images are saved as DSH attachments; completed videos remain available by remote URL and explicit download.",
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
        if (urls[0]) exec.concludeTurn();
        return { taskId: args.task_id, status, progress, kind: "videos", ...saved };
      }
      const images = await saveImages(urls, args.task_id, attachments, exec.signal);
      if (images.length > 0) exec.concludeTurn();
      return { taskId: args.task_id, status, progress, kind: "images", images };
    }
  });
}
export {
  Config,
  TokensApiClient,
  VIDEO_MODELS,
  VIDEO_MODEL_CAPABILITIES,
  VIDEO_MODEL_IDS,
  apply,
  inject,
  isVideoModel,
  name,
  videoModelCapability
};
//# sourceMappingURL=index.js.map
