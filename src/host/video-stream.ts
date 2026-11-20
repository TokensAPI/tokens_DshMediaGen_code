import { request as httpsRequest } from 'node:https'

const VIDEO_STREAM_ROUTE = '/media-gen/video-stream'

// Stream generated videos through the Host: Electron's direct S3 connection can
// reset during TLS negotiation. No credentials or files are needed for playback.
export function registerVideoStreamRoute(ctx: any, request = httpsRequest): void {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: VIDEO_STREAM_ROUTE,
    handler(req: any, res: any) {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return
      }
      let source: URL
      try {
        source = new URL(new URL(req.url, 'http://dsh.local').searchParams.get('url') || '')
      } catch { res.writeHead(400); res.end(); return }
      if (source.protocol !== 'https:' || source.hostname !== 's3.tokensapi.ai' || source.port || source.username || source.password) {
        res.writeHead(403); res.end(); return
      }
      const range = req.headers?.range
      if (range !== undefined && (typeof range !== 'string' || !/^bytes=(?:\d+-\d*|-\d+)$/.test(range))) {
        res.writeHead(416); res.end(); return
      }
      const upstream = request(source, {
        method: req.method,
        minVersion: 'TLSv1.2', maxVersion: 'TLSv1.2',
        headers: { Accept: 'video/mp4,video/webm,application/octet-stream', ...(range ? { Range: range } : {}) },
      }, (response) => {
        const status = response.statusCode ?? 502
        const headers: Record<string, string | string[]> = { 'Cache-Control': 'private, max-age=300' }
        // Do not follow redirects or forward cookies/authentication headers.
        if (![200, 206, 416].includes(status)) {
          response.resume(); res.writeHead(status >= 400 ? status : 502); res.end(); return
        }
        for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
          const value = response.headers[name]
          if (value !== undefined) headers[name] = value
        }
        res.writeHead(status, headers)
        if (req.method === 'HEAD' || status === 416) { response.resume(); res.end(); return }
        response.on('error', () => res.destroy())
        response.on('aborted', () => res.destroy())
        response.pipe(res)
      })
      upstream.setTimeout(30_000, () => upstream.destroy(new Error('Video stream timed out')))
      upstream.on('error', () => {
        if (res.destroyed) return
        if (res.headersSent) res.destroy()
        else { res.writeHead(502); res.end() }
      })
      const stop = () => upstream.destroy()
      req.once('aborted', stop)
      res.once('close', stop)
      upstream.end()
    },
  }), 'media-gen: generated video stream')
}
