window.__ModuleLoader__.load({
  id: '@tokensapi/dsh-media-gen',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    var jsx = require('react/jsx-runtime')
    var React = require('react')

    function textLines(block) {
      if (!block || !Array.isArray(block.content)) return ''
      return block.content
        .filter((part) => part && part.type === 'text' && typeof part.text === 'string')
        .map((part) => part.text)
        .join('\n')
    }

    function remoteImageUrls(block) {
      var text = textLines(block)
      var matches = text.matchAll(/(?:Image\s+\d+|URL):\s*(https:\/\/\S+)/g)
      return Array.from(matches, (match) => match[1])
    }

    function imageAttachments(block) {
      if (!block || !Array.isArray(block.content)) return []
      return block.content
        .filter((part) => part && part.type === 'image' && part.attachment && typeof part.attachment.attachmentId === 'string')
        .map((part) => part.attachment)
    }

    function imageDownloadName(attachment, url, index) {
      var mediaType = attachment && typeof attachment.mediaType === 'string' ? attachment.mediaType : ''
      var extension = {
        'image/png': '.png',
        'image/jpeg': '.jpg',
        'image/webp': '.webp',
        'image/gif': '.gif',
      }[mediaType]
      if (!extension && typeof url === 'string' && /^https:\/\//i.test(url)) {
        try {
          var match = new URL(url).pathname.match(/\.(png|jpe?g|webp|gif)$/i)
          if (match) extension = `.${match[1].toLowerCase().replace('jpeg', 'jpg')}`
        } catch {}
      }
      return `tokensapi-image-${index + 1}${extension || '.png'}`
    }

    function imageDownloadUrl(url, filename) {
      if (typeof url !== 'string' || !url) return null
      if (url.startsWith('blob:') || url.startsWith('data:')) return url
      try {
        var source = new URL(url)
        if (source.protocol === 'https:' && source.hostname === 's3.tokensapi.ai') {
          return `/media-gen/download?url=${encodeURIComponent(url)}&name=${encodeURIComponent(filename)}`
        }
      } catch {}
      return url
    }

    function videoUrl(block) {
      if (!block || !Array.isArray(block.content)) return null
      for (var part of block.content) {
        if (part && part.type === 'video' && typeof part.url === 'string') return part.url
      }
      var match = textLines(block).match(/URL:\s*(https:\/\/\S+)/)
      return match ? match[1] : null
    }

    function savedPath(block) {
      var match = textLines(block).match(/Saved to:\s*(.+)/)
      return match ? match[1].trim() : null
    }

    function localVideoUrl(filePath) {
      if (!filePath) return null
      var filename = filePath.split(/[\\/]/).pop()
      return /^media_gen_[A-Za-z0-9_-]+\.mp4$/.test(filename || '')
        ? `/media-gen/videos/${encodeURIComponent(filename)}`
        : null
    }

    function videoAspectRatio(block) {
      var argsRaw = 'kind' in block ? block.call?.argsRaw : block.argsRaw
      if (typeof argsRaw === 'string' && argsRaw) {
        try {
          var ratio = JSON.parse(argsRaw).aspect_ratio
          if (typeof ratio === 'string' && /^\d+:\d+$/.test(ratio)) return ratio.replace(':', ' / ')
        } catch {}
      }
      return '16 / 9'
    }

    function warnings(block) {
      return textLines(block)
        .split('\n')
        .filter((line) => /warning:|failed|error/i.test(line))
    }

    function useSessionId(sessions) {
      return React.useSyncExternalStore(
        sessions.list.subscribe,
        () => sessions.list.getSnapshot().current,
        () => undefined,
      )
    }

    function useAttachmentUrls(attachments, fallbackUrls, sessions) {
      var sessionId = useSessionId(sessions)
      var key = attachments.map((item) => item.attachmentId).join('|')
      var fallbackKey = fallbackUrls.join('|')
      var [state, setState] = React.useState({ urls: fallbackUrls, loading: attachments.length > 0, error: null })

      React.useEffect(() => {
        var live = true
        var objectUrls = []
        setState({ urls: fallbackUrls, loading: attachments.length > 0, error: null })
        if (!attachments.length || !sessionId) return () => { live = false }
        var session = sessions.binding(sessionId)?.session
        if (!session) return () => { live = false }
        Promise.all(attachments.map((attachment) =>
          session.readAttachment(attachment.attachmentId).then((result) => {
            if (!result.ok) throw new Error(result.error?.message || 'Attachment read failed')
            var bytes = result.value.data
            var url = URL.createObjectURL(new Blob([bytes], { type: result.value.attachment.mediaType }))
            objectUrls.push(url)
            return url
          }),
        )).then((urls) => {
          if (live) setState({ urls, loading: false, error: null })
        }).catch((error) => {
          if (live) setState({ urls: fallbackUrls, loading: false, error: String(error?.message || error) })
        })
        return () => {
          live = false
          objectUrls.forEach((url) => URL.revokeObjectURL(url))
        }
      }, [key, fallbackKey, sessionId, sessions])
      return state
    }

    function Header({ title, status }) {
      return jsx.jsxs('div', {
        style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, lineHeight: '20px' },
        children: [
          jsx.jsx('span', { style: { fontWeight: 500, color: 'var(--dsw-alias-label-primary)' }, children: title }),
          jsx.jsx('span', { style: { color: 'var(--dsw-alias-label-tertiary)' }, children: status }),
        ],
      })
    }

    function Notice({ children, error }) {
      return jsx.jsx('div', {
        style: { color: error ? 'var(--dsw-alias-state-error-primary)' : 'var(--dsw-alias-label-tertiary)', fontSize: 13, whiteSpace: 'pre-wrap' },
        children,
      })
    }

    function MediaImageRow({ toolName, block, sessions }) {
      var done = 'kind' in block
      var attachments = done ? imageAttachments(block) : []
      var fallbacks = done ? remoteImageUrls(block) : []
      var images = useAttachmentUrls(attachments, fallbacks, sessions)
      var title = toolName === 'media_edit_image' ? 'Edit image' : toolName === 'media_task_status' ? 'Media task result' : 'Generate image'
      var status = !done ? 'generating…' : block.isError ? 'failed' : 'done'
      var warningLines = done ? warnings(block) : []

      return jsx.jsxs('div', {
        style: { display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 4px' },
        children: [
          jsx.jsx(Header, { title, status }),
          images.loading ? jsx.jsx(Notice, { children: 'Loading image attachments…' }) : null,
          images.urls.length ? jsx.jsx('div', {
            style: { display: 'grid', gridTemplateColumns: images.urls.length === 1 ? 'minmax(0, 1fr)' : 'repeat(2, minmax(0, 1fr))', gap: 8 },
            children: images.urls.map((url, index) => {
              var filename = imageDownloadName(attachments[index], url, index)
              var downloadUrl = imageDownloadUrl(url, filename)
              return jsx.jsxs('div', {
                style: { position: 'relative', minWidth: 0, overflow: 'hidden', borderRadius: 12, background: 'var(--dsw-alias-bg-layer-1)' },
                children: [
                  jsx.jsx('a', {
                    href: url,
                    target: '_blank',
                    rel: 'noreferrer',
                    style: { display: 'block', minWidth: 0 },
                    children: jsx.jsx('img', {
                      src: url,
                      alt: `Generated image ${index + 1}`,
                      loading: 'lazy',
                      style: { width: '100%', maxHeight: 480, borderRadius: 12, display: 'block', objectFit: 'contain', background: 'var(--dsw-alias-bg-layer-1)' },
                    }),
                  }),
                  downloadUrl ? jsx.jsx('a', {
                    href: downloadUrl,
                    download: filename,
                    title: '下载图片',
                    'aria-label': '下载图片',
                    style: { position: 'absolute', top: 10, right: 10, zIndex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, border: '1px solid rgba(255,255,255,.28)', borderRadius: 9, background: 'rgba(0,0,0,.58)', color: '#fff', boxShadow: '0 2px 10px rgba(0,0,0,.22)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', textDecoration: 'none' },
                    children: jsx.jsx('svg', {
                      width: 18,
                      height: 18,
                      viewBox: '0 0 24 24',
                      fill: 'none',
                      'aria-hidden': true,
                      children: jsx.jsx('path', {
                        d: 'M12 3v11m0 0 4-4m-4 4-4-4M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2',
                        stroke: 'currentColor',
                        strokeWidth: 1.8,
                        strokeLinecap: 'round',
                        strokeLinejoin: 'round',
                      }),
                    }),
                  }) : null,
                ],
              }, `${url}:${index}`)
            }),
          }) : !images.loading ? jsx.jsx(Notice, { error: done, children: done ? 'No generated image was returned.' : 'Generating image…' }) : null,
          images.error ? jsx.jsx(Notice, { error: true, children: `Attachment fallback: ${images.error}` }) : null,
          warningLines.length ? jsx.jsx(Notice, { error: true, children: warningLines.join('\n') }) : null,
        ],
      })
    }

    function MediaVideoRow({ block }) {
      var done = 'kind' in block
      var remoteUrl = done ? videoUrl(block) : null
      var filePath = done ? savedPath(block) : null
      var url = localVideoUrl(filePath) || remoteUrl
      var warningLines = done ? warnings(block) : []
      var aspectRatio = videoAspectRatio(block)
      var [playerState, setPlayerState] = React.useState('loading')
      React.useEffect(() => setPlayerState('loading'), [url])

      return jsx.jsxs('div', {
        style: { display: 'flex', flexDirection: 'column', gap: 8, width: '100%', minWidth: 0, padding: '8px 4px' },
        children: [
          jsx.jsx(Header, { title: 'Generate video', status: !done ? 'generating…' : block.isError ? 'failed' : 'done' }),
          url ? jsx.jsxs('div', {
            style: { position: 'relative', width: '100%', minHeight: 180, maxHeight: 560, aspectRatio, overflow: 'hidden', border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 12, background: '#000' },
            children: [
              jsx.jsx('video', {
                controls: true,
                playsInline: true,
                preload: 'metadata',
                onLoadedMetadata: () => setPlayerState('ready'),
                onCanPlay: () => setPlayerState('ready'),
                onError: () => setPlayerState('error'),
                style: { position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', objectFit: 'contain', background: '#000' },
                children: jsx.jsx('source', { src: url, type: 'video/mp4' }),
              }),
              playerState === 'loading' ? jsx.jsx('div', {
                style: { position: 'absolute', inset: 0, pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', background: 'rgba(0,0,0,.28)', fontSize: 13 },
                children: 'Loading video…',
              }) : null,
              playerState === 'error' ? jsx.jsxs('div', {
                style: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, color: '#fff', background: '#111', textAlign: 'center', fontSize: 13 },
                children: [
                  jsx.jsx('span', { children: 'Inline playback failed.' }),
                  remoteUrl ? jsx.jsx('a', { href: remoteUrl, target: '_blank', rel: 'noreferrer', style: { color: '#8ab4ff' }, children: 'Open source video' }) : null,
                ],
              }) : null,
            ],
          }) : null,
          !done ? jsx.jsx(Notice, { children: 'Generating video…' }) : null,
          done && !url ? jsx.jsx(Notice, { error: true, children: 'No playable video URL is available yet.' }) : null,
          remoteUrl ? jsx.jsx('a', { href: remoteUrl, target: '_blank', rel: 'noreferrer', style: { color: 'var(--dsw-alias-label-link)', fontSize: 13, overflowWrap: 'anywhere' }, children: 'Open source video in a new window' }) : null,
          filePath ? jsx.jsx(Notice, { children: `Saved locally: ${filePath}` }) : null,
          warningLines.length ? jsx.jsx(Notice, { error: true, children: warningLines.join('\n') }) : null,
        ],
      })
    }

    var inject = ['slots', 'sessions']

    function apply(ctx) {
      var sessions = ctx.get('sessions')
      var ImageRow = (props) => jsx.jsx(MediaImageRow, { ...props, sessions })
      ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({ name: 'tool.call.toolview', key: 'media_generate_image', locale: 'conversation' }, ImageRow))
      ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({ name: 'tool.call.toolview', key: 'media_edit_image', locale: 'conversation' }, ImageRow))
      ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({ name: 'tool.call.toolview', key: 'media_generate_video', locale: 'conversation' }, MediaVideoRow))
      ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({ name: 'tool.call.toolview', key: 'media_task_status', locale: 'conversation' }, (props) => {
        return imageAttachments('kind' in props.block ? props.block : null).length
          ? jsx.jsx(ImageRow, props)
          : jsx.jsx(MediaVideoRow, props)
      }))
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
