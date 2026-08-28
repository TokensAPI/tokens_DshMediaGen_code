import type { ImageModel, VideoModel } from '../shared/media.js'

export interface GeneratedImage {
  url: string
  attachmentId?: string
  mediaType?: string
  bytes?: number
  width?: number
  height?: number
  name?: string
  error?: string
}

export interface GeneratedVideo {
  url?: string
  filePath?: string
  error?: string
}

export interface MediaConfig {
  baseURL: string
  apiKeyEnv: string
  outputDir: string
  pollIntervalMs: number
  maxPollMs: number
  defaultImageModel: ImageModel
  defaultEditModel: 'image2' | 'qwen_image'
  defaultVideoModel: VideoModel
  enhanceEnabled: boolean
  enhanceApiKeyEnv: string
  enhanceBaseURL: string
  enhanceModel: string
  enhanceMaxChars: number
  allowLocalImageInput: boolean
  maxInputImageBytes: number
  imageUploadURL: string
  uploadAuthMode: 'account' | 'api_key'
  accountAccessTokenEnv: string
  accountUserId: string
  storageBackend: 'presign' | 'r2'
  r2Endpoint: string
  r2Region: string
  r2AccessKeyEnv: string
  r2SecretKeyEnv: string
  r2Bucket: string
  r2CdnBase: string
  r2PathPrefix: string
}
