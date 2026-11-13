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

    function compactDownloadTimestamp(date) {
      var pad = (value) => String(value).padStart(2, '0')
      return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
    }

    function imageTaskId(block) {
      var match = textLines(block).match(/\btask\s+([A-Za-z0-9_-]+)\)/i)
      return match ? match[1] : ''
    }

    function imageDownloadName(attachment, url, index, taskId, timestamp) {
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
      var identity = taskId || (attachment && typeof attachment.attachmentId === 'string' ? attachment.attachmentId : '')
      var taskSuffix = String(identity).replace(/[^A-Za-z0-9_-]/g, '').slice(-10)
      return `tokensapi-image-${index + 1}-${timestamp}${taskSuffix ? `-${taskSuffix}` : ''}${extension || '.png'}`
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

    function useSessionId(sessions, scopedSessionId) {
      return React.useSyncExternalStore(
        sessions.list.subscribe,
        () => scopedSessionId ?? sessions.list.getSnapshot().current,
        () => undefined,
      )
    }

    function useAttachmentUrls(attachments, fallbackUrls, sessions, scopedSessionId) {
      var sessionId = useSessionId(sessions, scopedSessionId)
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

    var MEDIA_QUESTION_ID_PREFIX = 'tokensapi_media__'

    function mediaQuestionMeta(id) {
      if (typeof id !== 'string' || !id.startsWith(MEDIA_QUESTION_ID_PREFIX)) return null
      var match = /^tokensapi_media__q\d+__d(-?\d+)__/.exec(id)
      return match ? { defaultIndex: Number(match[1]) } : null
    }

    function isMediaOptionQuestionPending(pending) {
      return Boolean(
        pending &&
        Array.isArray(pending.questions) &&
        pending.questions.length > 0 &&
        pending.questions.every((question) => (
          mediaQuestionMeta(question && question.id) !== null &&
          Array.isArray(question.options) &&
          question.options.length > 0
        )) &&
        typeof pending.answer === 'function' &&
        typeof pending.cancel === 'function'
      )
    }

    function initialMediaQuestionDraft(question) {
      var labels = (question.options || []).map((option) => option.label)
      var selected = Array.isArray(question.initialSelected)
        ? question.initialSelected.filter((label, index, values) => (
          typeof label === 'string' && labels.includes(label) && values.indexOf(label) === index
        ))
        : []
      if (!selected.length) {
        var fallbackIndex = mediaQuestionMeta(question.id)?.defaultIndex ?? -1
        if (fallbackIndex >= 0 && fallbackIndex < labels.length) selected = [labels[fallbackIndex]]
      }
      return {
        selected: question.multiSelect === true ? selected : selected.slice(0, 1),
        custom: '',
        skipped: false,
      }
    }

    function MediaQuestionComposer({ matched }) {
      return jsx.jsx(MediaQuestionFlow, { pending: matched }, matched.key)
    }

    function MediaQuestionFlow({ pending }) {
      var questions = pending.questions
      var [index, setIndex] = React.useState(0)
      var [drafts, setDrafts] = React.useState(() => questions.map(initialMediaQuestionDraft))
      var [busy, setBusy] = React.useState(false)
      var [error, setError] = React.useState('')
      var cardRef = React.useRef(null)
      var question = questions[index]
      var draft = drafts[index]

      React.useEffect(() => {
        cardRef.current?.focus()
      }, [index])

      function updateDraft(update) {
        setDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? update(item) : item))
        setError('')
      }

      function choose(label) {
        updateDraft((current) => {
          if (question.multiSelect === true) {
            return {
              ...current,
              selected: current.selected.includes(label)
                ? current.selected.filter((item) => item !== label)
                : [...current.selected, label],
              custom: '',
              skipped: false,
            }
          }
          return { selected: [label], custom: '', skipped: false }
        })
        if (question.multiSelect !== true && index < questions.length - 1) setIndex(index + 1)
      }

      function editCustom(event) {
        var value = event.target.value
        updateDraft((current) => ({
          ...current,
          selected: question.multiSelect === true ? current.selected : [],
          custom: value,
          skipped: false,
        }))
      }

      function answered(item) {
        return item.selected.length > 0 || item.custom.trim() !== ''
      }

      function submitDrafts(values) {
        var missing = values.findIndex((item) => !answered(item) && !item.skipped)
        if (missing >= 0) {
          setIndex(missing)
          setError('请选择一个选项，或输入其他答案。')
          return
        }
        var answer = {
          answers: questions.map((item, itemIndex) => {
            var value = values[itemIndex]
            if (value.skipped) return { id: item.id, selected: [] }
            var custom = value.custom.trim()
            return {
              id: item.id,
              selected: custom === '' || item.multiSelect === true ? value.selected : [],
              ...(custom === '' ? {} : { custom }),
            }
          }),
        }
        setBusy(true)
        setError('')
        Promise.resolve().then(() => pending.answer(answer)).catch((cause) => {
          setBusy(false)
          setError(String(cause?.message || cause))
        })
      }

      function continueFlow() {
        if (!answered(draft) && !draft.skipped) {
          setError('请选择一个选项，或输入其他答案。')
          return
        }
        if (index < questions.length - 1) {
          setIndex(index + 1)
          setError('')
          return
        }
        submitDrafts(drafts)
      }

      function skipQuestion() {
        var defaultDraft = initialMediaQuestionDraft(question)
        if (!answered(defaultDraft)) {
          setError('当前问题没有默认选项，不能跳过。')
          return
        }
        var nextDrafts = drafts.map((item, itemIndex) => itemIndex === index
          ? { ...defaultDraft, skipped: false }
          : item)
        setDrafts(nextDrafts)
        setError('')
        if (index < questions.length - 1) setIndex(index + 1)
        else submitDrafts(nextDrafts)
      }

      function cancelFlow() {
        setBusy(true)
        setError('')
        Promise.resolve().then(() => pending.cancel()).catch((cause) => {
          setBusy(false)
          setError(String(cause?.message || cause))
        })
      }

      function onCardKeyDown(event) {
        if (event.target !== event.currentTarget || busy) return
        if (event.key !== ' ' && event.key !== 'Enter') return
        event.preventDefault()
        continueFlow()
      }

      return jsx.jsx('div', {
        style: { display: 'flex', justifyContent: 'center', padding: '6px calc(var(--dsh-composer-side-clearance, 0px) + 16px) 10px' },
        children: jsx.jsxs('section', {
          ref: cardRef,
          tabIndex: 0,
          onKeyDown: onCardKeyDown,
          'aria-label': question.question,
          style: { boxSizing: 'border-box', display: 'flex', flexDirection: 'column', width: '100%', maxWidth: 'var(--dsh-chat-content-width, 760px)', maxHeight: 'min(60vh, 520px)', overflow: 'hidden', outline: 'none', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 20, background: 'var(--dsw-specific-input-major)', color: 'var(--dsw-alias-label-primary)', boxShadow: 'var(--dsw-elevation-panel)' },
          children: [
            jsx.jsxs('header', {
              style: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, padding: '18px 16px 8px 22px' },
              children: [
                jsx.jsxs('div', {
                  style: { minWidth: 0 },
                  children: [
                    question.header ? jsx.jsx('div', { style: { marginBottom: 4, color: 'var(--dsw-alias-label-tertiary)', fontSize: 11, lineHeight: '16px' }, children: question.header }) : null,
                    jsx.jsx('h3', { style: { margin: 0, fontSize: 16, fontWeight: 500, lineHeight: '22px' }, children: question.question }),
                  ],
                }),
                jsx.jsx('button', {
                  type: 'button',
                  disabled: busy,
                  onClick: cancelFlow,
                  title: '关闭',
                  'aria-label': '关闭',
                  style: { flex: '0 0 auto', width: 28, height: 28, padding: 0, border: 0, borderRadius: 14, cursor: busy ? 'default' : 'pointer', background: 'transparent', color: 'var(--dsw-alias-label-tertiary)', fontSize: 22, lineHeight: '26px' },
                  children: '×',
                }),
              ],
            }),
            jsx.jsxs('div', {
              style: { minHeight: 0, overflowY: 'auto', padding: '0 12px 4px' },
              children: [
                question.detail ? jsx.jsx('div', { style: { margin: '0 10px 8px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: 'var(--dsw-alias-label-secondary)', fontSize: 13, lineHeight: '20px' }, children: question.detail }) : null,
                jsx.jsx('div', {
                  style: { display: 'flex', flexDirection: 'column', gap: 3 },
                  children: question.options.map((option, optionIndex) => {
                    var selected = draft.selected.includes(option.label)
                    return jsx.jsxs('button', {
                      type: 'button',
                      disabled: busy,
                      onClick: () => choose(option.label),
                      'aria-pressed': selected,
                      style: { display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%', minHeight: 44, padding: '9px 12px', border: selected ? '1px solid var(--dsw-alias-border-l2)' : '1px solid transparent', borderRadius: 12, cursor: busy ? 'default' : 'pointer', textAlign: 'left', background: selected ? 'var(--dsw-alias-interactive-bg-hover)' : 'transparent', color: 'inherit' },
                      children: [
                        jsx.jsx('span', { style: { display: 'grid', placeItems: 'center', flex: '0 0 22px', width: 22, height: 22, marginTop: 1, border: selected ? '1px solid var(--dsw-alias-label-primary)' : '1px solid var(--dsw-alias-border-l4)', borderRadius: question.multiSelect === true ? 5 : 11, background: selected ? 'var(--dsw-alias-label-primary)' : 'transparent', color: 'var(--dsw-alias-label-primary-foreground)', fontSize: 13, lineHeight: 1 }, children: selected ? '✓' : String(optionIndex + 1) }),
                        jsx.jsxs('span', {
                          style: { minWidth: 0, flex: 1 },
                          children: [
                            jsx.jsx('span', { style: { display: 'block', fontSize: 14, fontWeight: 500, lineHeight: '22px' }, children: option.label }),
                            option.description ? jsx.jsx('span', { style: { display: 'block', color: 'var(--dsw-alias-label-tertiary)', fontSize: 13, fontWeight: 400, lineHeight: '20px' }, children: option.description }) : null,
                          ],
                        }),
                      ],
                    }, option.label)
                  }),
                }),
                jsx.jsx('input', {
                  value: draft.custom,
                  disabled: busy,
                  onChange: editCustom,
                  placeholder: '其他（请输入）',
                  style: { boxSizing: 'border-box', width: 'calc(100% - 12px)', minHeight: 38, margin: '6px 6px 0', padding: '8px 11px', border: '1px solid var(--dsw-alias-border-l4)', borderRadius: 10, outline: 'none', background: 'var(--dsw-alias-bg-module-platform)', color: 'var(--dsw-alias-label-primary)', font: 'inherit', fontSize: 13 },
                }),
              ],
            }),
            jsx.jsxs('footer', {
              style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '9px 12px 12px 18px' },
              children: [
                jsx.jsx('div', { role: 'status', style: { minHeight: 16, flex: 1, color: 'var(--dsw-alias-state-error-primary)', fontSize: 11, lineHeight: '16px' }, children: error }),
                jsx.jsxs('div', {
                  style: { display: 'flex', alignItems: 'center', gap: 8 },
                  children: [
                    questions.length > 1 ? jsx.jsx('span', { style: { color: 'var(--dsw-alias-label-tertiary)', fontSize: 12 }, children: `${index + 1}/${questions.length}` }) : null,
                    index > 0 ? jsx.jsx('button', { type: 'button', disabled: busy, onClick: () => { setIndex(index - 1); setError('') }, style: { minHeight: 34, padding: '0 12px', border: '1px solid var(--dsw-alias-border-l3)', borderRadius: 9, background: 'transparent', color: 'inherit', cursor: busy ? 'default' : 'pointer' }, children: '上一步' }) : null,
                    jsx.jsx('button', { type: 'button', disabled: busy, onClick: skipQuestion, title: '使用默认值并跳过当前选择', 'aria-label': '使用默认值并跳过当前选择', style: { minHeight: 34, padding: '0 12px', border: 0, borderRadius: 9, background: 'transparent', color: 'var(--dsw-alias-label-secondary)', cursor: busy ? 'default' : 'pointer' }, children: '跳过' }),
                    jsx.jsx('button', { type: 'button', disabled: busy, onClick: continueFlow, style: { minHeight: 34, padding: '0 15px', border: 0, borderRadius: 9, background: 'var(--dsw-alias-button-primary-fill, var(--dsw-alias-label-primary))', color: 'var(--dsw-alias-button-primary-label, var(--dsw-alias-label-primary-foreground))', cursor: busy ? 'default' : 'pointer', fontWeight: 500 }, children: index < questions.length - 1 ? '下一步' : '确定' }),
                  ],
                }),
              ],
            }),
          ],
        }),
      })
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

    function MediaImageRow({ toolName, block, sessions, sessionId: scopedSessionId }) {
      var done = 'kind' in block
      var attachments = done ? imageAttachments(block) : []
      var fallbacks = done ? remoteImageUrls(block) : []
      var images = useAttachmentUrls(attachments, fallbacks, sessions, scopedSessionId)
      var taskId = done ? imageTaskId(block) : ''
      var downloadTimestamp = compactDownloadTimestamp(new Date())
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
              var filename = imageDownloadName(attachments[index], url, index, taskId, downloadTimestamp)
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
      ctx.slots.inject('conversation.composer', () => ctx.slots.register({
        name: 'conversation.composer',
        priority: -100,
        select: ({ pendingInteraction }) => isMediaOptionQuestionPending(pendingInteraction) ? pendingInteraction : null,
      }, MediaQuestionComposer))
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
