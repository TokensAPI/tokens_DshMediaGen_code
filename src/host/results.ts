import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { detectImageMediaType, extensionForMediaType, sanitizeTaskId } from '../shared/media.js'
import type { GeneratedImage, GeneratedVideo, MediaConfig } from './types.js'

interface AttachmentService {
  saveImage(input: { data: Buffer; mediaType: string; name: string }): Promise<{
    attachmentId: string
    mediaType: string
    bytes: number
    width: number
    height: number
    name?: string
  }>
}

export async function download(url: string, signal?: AbortSignal): Promise<{ bytes: Buffer; mediaType?: string }> {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`Download failed (${response.status}) for ${url}`)
  return {
    bytes: Buffer.from(await response.arrayBuffer()),
    mediaType: response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase(),
  }
}

export async function saveImages(
  urls: string[],
  taskId: string,
  attachments: AttachmentService | undefined,
  signal?: AbortSignal,
): Promise<GeneratedImage[]> {
  return Promise.all(urls.map(async (url, index) => {
    const result: GeneratedImage = { url }
    if (!attachments) return result
    try {
      const downloaded = await download(url, signal)
      const mediaType = detectImageMediaType(downloaded.bytes, downloaded.mediaType)
      if (!mediaType) throw new Error(`Unsupported generated image type from ${url}`)
      const name = `media_gen_${sanitizeTaskId(taskId)}_${index + 1}${extensionForMediaType(mediaType)}`
      const ref = await attachments.saveImage({ data: downloaded.bytes, mediaType, name })
      return {
        ...result,
        attachmentId: ref.attachmentId,
        mediaType: ref.mediaType,
        bytes: ref.bytes,
        width: ref.width,
        height: ref.height,
        name: ref.name,
      }
    } catch (error) {
      return { ...result, error: error instanceof Error ? error.message : String(error) }
    }
  }))
}

export async function saveVideo(
  url: string | undefined,
  taskId: string,
  config: MediaConfig,
  signal?: AbortSignal,
): Promise<GeneratedVideo> {
  if (!url) return {}
  const result: GeneratedVideo = { url }
  try {
    await mkdir(config.outputDir, { recursive: true })
    const filePath = join(config.outputDir, `media_gen_${sanitizeTaskId(taskId)}.mp4`)
    let reuse = false
    try {
      const info = await stat(filePath)
      reuse = info.isFile() && info.size > 0
    } catch {}
    if (!reuse) {
      const downloaded = await download(url, signal)
      await writeFile(filePath, downloaded.bytes)
    } else {
      await readFile(filePath, { flag: 'r' })
    }
    result.filePath = filePath
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error)
  }
  return result
}
