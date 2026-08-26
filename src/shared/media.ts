import { readFile, stat } from 'node:fs/promises'
import { extname } from 'node:path'

export const IMAGE_MODELS = ['image2', 'z_image_turbo', 'qwen_image'] as const
export const IMAGE_EDIT_MODELS = ['image2', 'qwen_image'] as const
export const VIDEO_MODELS = ['ltx_2_3', 'seedance_2_0'] as const
export const IMAGE_ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'] as const
export const DURATIONS = [3, 5, 8, 10, 15] as const
export const SEEDANCE_RESOLUTIONS = ['480p', '720p', '1080p'] as const
export const ASPECT_RATIOS = ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'] as const

export type ImageModel = typeof IMAGE_MODELS[number]
export type VideoModel = typeof VIDEO_MODELS[number]

export interface ResolvedImageInput {
  value: string
  mediaType?: string
  bytes?: number
  source: 'remote' | 'data' | 'file'
}

const MIME_EXTENSIONS: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
}

const EXTENSION_MIMES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}

export function detectImageMediaType(bytes: Uint8Array, hint?: string): string | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp'
  if (bytes.length >= 6) {
    const signature = String.fromCharCode(...bytes.slice(0, 6))
    if (signature === 'GIF87a' || signature === 'GIF89a') return 'image/gif'
  }
  if (hint) {
    const normalized = hint.split(';', 1)[0]?.trim().toLowerCase()
    if (normalized && MIME_EXTENSIONS[normalized]) return normalized
  }
  return null
}

export function extensionForMediaType(mediaType: string): string {
  return MIME_EXTENSIONS[mediaType] ?? '.bin'
}

function decodePercentBytes(value: string): Buffer {
  const bytes: number[] = []
  for (let index = 0; index < value.length;) {
    if (value[index] === '%' && /^[0-9A-Fa-f]{2}$/.test(value.slice(index + 1, index + 3))) {
      bytes.push(Number.parseInt(value.slice(index + 1, index + 3), 16))
      index += 3
    } else {
      const code = value.charCodeAt(index)
      if (code > 0x7f) throw new Error('Non-base64 image data URL must percent-encode binary bytes.')
      bytes.push(code)
      index += 1
    }
  }
  return Buffer.from(bytes)
}

export function normalizeDataUrl(value: string, maxBytes: number): ResolvedImageInput {
  const match = value.match(/^data:([^;,]+)?(;base64)?,(.*)$/s)
  if (!match) throw new Error('Invalid image data URL.')
  const declared = (match[1] ?? 'image/png').toLowerCase()
  const encoded = match[3] ?? ''
  const bytes = match[2]
    ? Buffer.from(encoded, 'base64')
    : decodePercentBytes(encoded)
  if (bytes.length === 0) throw new Error('Image data URL is empty.')
  if (bytes.length > maxBytes) throw new Error(`Image input exceeds the ${maxBytes} byte limit.`)
  const mediaType = detectImageMediaType(bytes, declared)
  if (!mediaType) throw new Error(`Unsupported image data type: ${declared}`)
  return {
    value: `data:${mediaType};base64,${bytes.toString('base64')}`,
    mediaType,
    bytes: bytes.length,
    source: 'data',
  }
}

export async function resolveImageInput(input: string, maxBytes: number): Promise<ResolvedImageInput> {
  const value = String(input).trim()
  if (/^https:\/\//i.test(value)) return { value, source: 'remote' }
  if (/^http:\/\//i.test(value)) throw new Error('Image URL must use HTTPS.')
  if (value.startsWith('data:')) return normalizeDataUrl(value, maxBytes)

  const info = await stat(value)
  if (!info.isFile()) throw new Error(`Image input is not a regular file: ${value}`)
  if (info.size > maxBytes) throw new Error(`Image input exceeds the ${maxBytes} byte limit.`)
  const bytes = await readFile(value)
  const mediaType = detectImageMediaType(bytes, EXTENSION_MIMES[extname(value).toLowerCase()])
  if (!mediaType) throw new Error(`Unsupported image file type: ${value}`)
  return {
    value: `data:${mediaType};base64,${bytes.toString('base64')}`,
    mediaType,
    bytes: bytes.length,
    source: 'file',
  }
}

export function resultUrls(data: unknown): string[] {
  if (!data || typeof data !== 'object') return []
  const results = (data as { results?: unknown }).results
  if (!Array.isArray(results)) return []
  return results
    .map((item) => item && typeof item === 'object' ? (item as { url?: unknown }).url : undefined)
    .filter((url): url is string => typeof url === 'string' && url.length > 0)
}

export function sanitizeTaskId(taskId: string): string {
  return taskId.replace(/[^A-Za-z0-9_-]/g, '_')
}
