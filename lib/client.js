window.__ModuleLoader__.load({
  id: '@tokensapi/dsh-media-gen',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    var jsx = require('react/jsx-runtime')
    var React = require('react')

    var MEDIA_LOCALE_NS = 'tokensapi.media-gen'
    var MEDIA_MESSAGES = {
      zh: {
        'ui.selectAnswer': '请选择一个选项，或输入其他答案。',
        'ui.noDefault': '当前问题没有默认选项，不能跳过。',
        'ui.close': '关闭',
        'ui.other': '其他（请输入）',
        'ui.previous': '上一步',
        'ui.skip': '跳过',
        'ui.skipHint': '使用默认值并跳过当前选择',
        'ui.next': '下一步',
        'ui.confirm': '确定',
        'card.generateImage': '生成图片',
        'card.editImage': '编辑图片',
        'card.taskResult': '媒体任务结果',
        'card.generateVideo': '生成视频',
        'card.generating': '生成中…',
        'card.failed': '失败',
        'card.done': '完成',
        'card.loadingImages': '正在加载图片附件…',
        'card.generatedImage': '生成的图片 {index}',
        'card.downloadImage': '下载图片',
        'card.noImage': '没有返回生成的图片。',
        'card.generatingImage': '正在生成图片…',
        'card.attachmentFallback': '附件回退：{error}',
        'card.loadingVideo': '正在加载视频…',
        'card.playbackFailed': '内联播放失败。',
        'card.openSourceVideo': '打开源视频',
        'card.generatingVideo': '正在生成视频…',
        'card.noVideo': '暂时没有可播放的视频地址。',
        'card.openSourceVideoWindow': '在新窗口打开源视频',
        'card.savedLocally': '已保存到本地：{path}',
        'marker.recommended': '（推荐）',
        'unit.seconds': '{value} 秒',
        'unit.image': '{value} 张',
        'unit.images': '{value} 张',
        'wire.历史 Prompt': '历史 Prompt',
        'wire.是否复用上一次任务的 Prompt？': '是否复用上一次任务的 Prompt？',
        'wire.历史参考素材': '历史参考素材',
        'wire.是否复用上一次任务的参考图或首尾帧？': '是否复用上一次任务的参考图或首尾帧？',
        'wire.历史生成参数': '历史生成参数',
        'wire.是否复用上一次任务的生成参数？': '是否复用上一次任务的生成参数？',
        'wire.不复用': '不复用',
        'wire.复用': '复用',
        'wire.按本次新任务重新填写 Prompt': '按本次新任务重新填写 Prompt',
        'wire.沿用上一次任务的 Prompt': '沿用上一次任务的 Prompt',
        'wire.本次不使用历史参考素材': '本次不使用历史参考素材',
        'wire.沿用上一次任务的参考素材': '沿用上一次任务的参考素材',
        'wire.重新选择模型和输出参数': '重新选择模型和输出参数',
        'wire.沿用可兼容的模型和输出参数': '沿用可兼容的模型和输出参数',
        'wire.参考图': '参考图',
        'wire.当前对话中没有用户上传的图片。请输入 HTTPS URL / 本地图片路径': '当前对话中没有用户上传的图片。请输入 HTTPS URL / 本地图片路径',
        'wire.视频类型': '视频类型',
        'wire.选择视频生成方式': '选择视频生成方式',
        'wire.纯文生视频': '纯文生视频',
        'wire.使用首帧图片': '使用首帧图片',
        'wire.使用首帧和尾帧图片': '使用首帧和尾帧图片',
        'wire.首帧图片': '首帧图片',
        'wire.尾帧图片': '尾帧图片',
        'wire.请选择已附加的首帧图片，或输入 dsh-attachment 选择器 / HTTPS URL / 本地图片路径': '请选择已附加的首帧图片，或输入 dsh-attachment 选择器 / HTTPS URL / 本地图片路径',
        'wire.请选择首帧图片，或输入 dsh-attachment 选择器 / HTTPS URL / 本地图片路径': '请选择首帧图片，或输入 dsh-attachment 选择器 / HTTPS URL / 本地图片路径',
        'wire.请选择尾帧图片，或输入 dsh-attachment 选择器 / HTTPS URL / 本地图片路径': '请选择尾帧图片，或输入 dsh-attachment 选择器 / HTTPS URL / 本地图片路径',
        'wire.原始 Prompt': '原始 Prompt',
        'wire.请描述你想怎么修改图片': '请描述你想怎么修改图片',
        'wire.请描述你想生成的视频': '请描述你想生成的视频',
        'wire.请描述你想生成的图片': '请描述你想生成的图片',
        'wire.Prompt 增强': 'Prompt 增强',
        'wire.是否增强下面的 Prompt？': '是否增强下面的 Prompt？',
        'wire.增强 Prompt': '增强 Prompt',
        'wire.保持原始 Prompt': '保持原始 Prompt',
        'wire.优化视觉、镜头和质量细节': '优化视觉、镜头和质量细节',
        'wire.不修改内容描述': '不修改内容描述',
        'wire.当前未启用提示词增强服务': '当前未启用提示词增强服务',
        'wire.确认增强后 Prompt': '确认增强后 Prompt',
        'wire.Prompt 已被增强，是否使用增强后的内容？': 'Prompt 已被增强，是否使用增强后的内容？',
        'wire.取消': '取消',
        'wire.模型': '模型',
        'wire.选择模型': '选择模型',
        'wire.使用插件当前配置的默认模型': '使用插件当前配置的默认模型',
        'wire.画面比例': '画面比例',
        'wire.选择画面比例': '选择画面比例',
        'wire.时长': '时长',
        'wire.选择视频时长': '选择视频时长',
        'wire.分辨率': '分辨率',
        'wire.选择视频分辨率': '选择视频分辨率',
        'wire.生成音频': '生成音频',
        'wire.是否生成视频音频？': '是否生成视频音频？',
        'wire.开启音频': '开启音频',
        'wire.关闭音频': '关闭音频',
        'wire.视频将包含模型生成的音频': '视频将包含模型生成的音频',
        'wire.生成无音频视频': '生成无音频视频',
        'wire.数量': '数量',
        'wire.生成几张？': '生成几张？',
        'wire.最终确认': '最终确认',
        'wire.按以下完整配置创建任务吗？': '按以下完整配置创建任务吗？',
        'wire.确认生成': '确认生成',
        'wire.adaptive（模型自动选择画面比例）': 'adaptive（模型自动选择画面比例）',
        'wire.adaptive（自动匹配输入图片比例）': 'adaptive（自动匹配输入图片比例）',
        'wire.根据当前请求推断': '根据当前请求推断',
        'wire.向导中填写': '向导中填写',
        'wire.历史任务复用': '历史任务复用',
        'wire.本次输入': '本次输入',
        'wire.图片生成': '图片生成',
        'wire.图片编辑': '图片编辑',
        'wire.视频生成': '视频生成',
        'wire.已增强': '已增强',
        'wire.未增强': '未增强',
        'wire.开启': '开启',
        'wire.关闭': '关闭',
        'wire.自动生成音频（模型固定开启）': '自动生成音频（模型固定开启）',
        'wire.由模型工作流决定': '由模型工作流决定',
        'wire.推荐模型': '推荐模型',
        'wire.固定音频': '固定音频',
        'wire.音频可选': '音频可选',
        'wire.音频不可配置': '音频不可配置',
        'wire.modelSpec': '{duration} 秒 · {resolution} · {audio}',
        'wire.defaultModelPrefix': '使用插件当前配置的默认模型；',
        'wire.imageHistoryRange': '历史图片不会自动复用。请明确输入 dsh-attachment:1 至 dsh-attachment:{count}，或提供 HTTPS URL / 本地图片路径',
        'wire.currentLatestImage': '当前对话最近一张用户上传图片',
        'wire.currentIndexedImage': '当前对话第 {index} 张用户上传图片',
        'wire.currentAttachment': '当前对话附件 {id}',
        'detail.previousPrompt': '上次 Prompt：',
        'detail.currentPrompt': '当前 Prompt',
        'detail.source': '来源：',
        'detail.originalPrompt': '原始 Prompt:',
        'detail.enhancedPrompt': '增强后 Prompt:',
        'detail.referenceImage': '参考图：',
        'detail.firstFrame': '首帧：',
        'detail.lastFrame': '尾帧：',
        'detail.model': '模型：',
        'detail.aspectRatio': '画面比例：',
        'detail.count': '数量：',
        'detail.duration': '时长：',
        'detail.resolution': '分辨率：',
        'detail.audio': '音频：',
        'detail.task': '- 任务: ',
        'detail.content': '- 内容: ',
        'detail.promptSource': '- Prompt 来源: ',
        'detail.promptEnhancement': '- Prompt 增强: ',
        'detail.finalModel': '- 模型: ',
        'detail.finalAspectRatio': '- 画面比例: ',
        'detail.finalDuration': '- 时长: ',
        'detail.finalResolution': '- 分辨率: ',
        'detail.finalAudio': '- 音频: ',
        'detail.finalCount': '- 数量: ',
        'detail.finalReferenceImage': '- 参考图: ',
        'detail.finalFirstFrame': '- 首帧图片: ',
        'detail.finalLastFrame': '- 尾帧图片: ',
        'detail.finalReferenceImages': '- 参考图片: ',
      },
      en: {
        'ui.selectAnswer': 'Select an option or enter another answer.',
        'ui.noDefault': 'This question has no default option and cannot be skipped.',
        'ui.close': 'Close',
        'ui.other': 'Other (enter a value)',
        'ui.previous': 'Previous',
        'ui.skip': 'Skip',
        'ui.skipHint': 'Use the default value and skip this choice',
        'ui.next': 'Next',
        'ui.confirm': 'Confirm',
        'card.generateImage': 'Generate image',
        'card.editImage': 'Edit image',
        'card.taskResult': 'Media task result',
        'card.generateVideo': 'Generate video',
        'card.generating': 'generating…',
        'card.failed': 'failed',
        'card.done': 'done',
        'card.loadingImages': 'Loading image attachments…',
        'card.generatedImage': 'Generated image {index}',
        'card.downloadImage': 'Download image',
        'card.noImage': 'No generated image was returned.',
        'card.generatingImage': 'Generating image…',
        'card.attachmentFallback': 'Attachment fallback: {error}',
        'card.loadingVideo': 'Loading video…',
        'card.playbackFailed': 'Inline playback failed.',
        'card.openSourceVideo': 'Open source video',
        'card.generatingVideo': 'Generating video…',
        'card.noVideo': 'No playable video URL is available yet.',
        'card.openSourceVideoWindow': 'Open source video in a new window',
        'card.savedLocally': 'Saved locally: {path}',
        'marker.recommended': ' (Recommended)',
        'unit.seconds': '{value} seconds',
        'unit.image': '{value} image',
        'unit.images': '{value} images',
        'wire.历史 Prompt': 'Previous prompt',
        'wire.是否复用上一次任务的 Prompt？': 'Reuse the prompt from the previous task?',
        'wire.历史参考素材': 'Previous reference media',
        'wire.是否复用上一次任务的参考图或首尾帧？': 'Reuse reference images or first/last frames from the previous task?',
        'wire.历史生成参数': 'Previous generation settings',
        'wire.是否复用上一次任务的生成参数？': 'Reuse generation settings from the previous task?',
        'wire.不复用': 'Do not reuse',
        'wire.复用': 'Reuse',
        'wire.按本次新任务重新填写 Prompt': 'Enter a new prompt for this task',
        'wire.沿用上一次任务的 Prompt': 'Use the previous task prompt',
        'wire.本次不使用历史参考素材': 'Do not use previous reference media',
        'wire.沿用上一次任务的参考素材': 'Use the previous reference media',
        'wire.重新选择模型和输出参数': 'Choose the model and output settings again',
        'wire.沿用可兼容的模型和输出参数': 'Reuse compatible model and output settings',
        'wire.参考图': 'Reference image',
        'wire.当前对话中没有用户上传的图片。请输入 HTTPS URL / 本地图片路径': 'There is no user-uploaded image in this conversation. Enter an HTTPS URL or local image path.',
        'wire.视频类型': 'Video type',
        'wire.选择视频生成方式': 'Choose a video generation mode',
        'wire.纯文生视频': 'Text to video',
        'wire.使用首帧图片': 'Use a first-frame image',
        'wire.使用首帧和尾帧图片': 'Use first- and last-frame images',
        'wire.首帧图片': 'First-frame image',
        'wire.尾帧图片': 'Last-frame image',
        'wire.请选择已附加的首帧图片，或输入 dsh-attachment 选择器 / HTTPS URL / 本地图片路径': 'Choose an attached first-frame image, or enter a dsh-attachment selector, HTTPS URL, or local image path.',
        'wire.请选择首帧图片，或输入 dsh-attachment 选择器 / HTTPS URL / 本地图片路径': 'Choose a first-frame image, or enter a dsh-attachment selector, HTTPS URL, or local image path.',
        'wire.请选择尾帧图片，或输入 dsh-attachment 选择器 / HTTPS URL / 本地图片路径': 'Choose a last-frame image, or enter a dsh-attachment selector, HTTPS URL, or local image path.',
        'wire.原始 Prompt': 'Original prompt',
        'wire.请描述你想怎么修改图片': 'Describe how you want to edit the image',
        'wire.请描述你想生成的视频': 'Describe the video you want to generate',
        'wire.请描述你想生成的图片': 'Describe the image you want to generate',
        'wire.Prompt 增强': 'Prompt enhancement',
        'wire.是否增强下面的 Prompt？': 'Enhance the prompt below?',
        'wire.增强 Prompt': 'Enhance prompt',
        'wire.保持原始 Prompt': 'Keep original prompt',
        'wire.优化视觉、镜头和质量细节': 'Improve visual, camera, and quality details',
        'wire.不修改内容描述': 'Keep the content description unchanged',
        'wire.当前未启用提示词增强服务': 'Prompt enhancement is currently disabled',
        'wire.确认增强后 Prompt': 'Use enhanced prompt',
        'wire.Prompt 已被增强，是否使用增强后的内容？': 'The prompt was enhanced. Use the enhanced version?',
        'wire.取消': 'Cancel',
        'wire.模型': 'Model',
        'wire.选择模型': 'Choose a model',
        'wire.使用插件当前配置的默认模型': 'Use the plugin\'s configured default model',
        'wire.画面比例': 'Aspect ratio',
        'wire.选择画面比例': 'Choose an aspect ratio',
        'wire.时长': 'Duration',
        'wire.选择视频时长': 'Choose video duration',
        'wire.分辨率': 'Resolution',
        'wire.选择视频分辨率': 'Choose video resolution',
        'wire.生成音频': 'Generate audio',
        'wire.是否生成视频音频？': 'Generate audio for the video?',
        'wire.开启音频': 'Enable audio',
        'wire.关闭音频': 'Disable audio',
        'wire.视频将包含模型生成的音频': 'The video will include model-generated audio',
        'wire.生成无音频视频': 'Generate a video without audio',
        'wire.数量': 'Quantity',
        'wire.生成几张？': 'How many images?',
        'wire.最终确认': 'Final confirmation',
        'wire.按以下完整配置创建任务吗？': 'Create the task with the complete configuration below?',
        'wire.确认生成': 'Confirm generation',
        'wire.adaptive（模型自动选择画面比例）': 'adaptive (model selects the aspect ratio)',
        'wire.adaptive（自动匹配输入图片比例）': 'adaptive (matches the input image ratio)',
        'wire.根据当前请求推断': 'Inferred from the current request',
        'wire.向导中填写': 'Entered in the wizard',
        'wire.历史任务复用': 'Reused from a previous task',
        'wire.本次输入': 'Current input',
        'wire.图片生成': 'Image generation',
        'wire.图片编辑': 'Image editing',
        'wire.视频生成': 'Video generation',
        'wire.已增强': 'Enhanced',
        'wire.未增强': 'Not enhanced',
        'wire.开启': 'Enabled',
        'wire.关闭': 'Disabled',
        'wire.自动生成音频（模型固定开启）': 'Audio generated automatically (required by the model)',
        'wire.由模型工作流决定': 'Determined by the model workflow',
        'wire.推荐模型': 'Recommended model',
        'wire.固定音频': 'audio required',
        'wire.音频可选': 'optional audio',
        'wire.音频不可配置': 'audio not configurable',
        'wire.modelSpec': '{duration} sec · {resolution} · {audio}',
        'wire.defaultModelPrefix': 'Use the plugin\'s configured default model; ',
        'wire.imageHistoryRange': 'Previous images are not reused automatically. Enter dsh-attachment:1 through dsh-attachment:{count}, or provide an HTTPS URL or local image path.',
        'wire.currentLatestImage': 'Latest user-uploaded image in this conversation',
        'wire.currentIndexedImage': 'User-uploaded image {index} in this conversation',
        'wire.currentAttachment': 'Conversation attachment {id}',
        'detail.previousPrompt': 'Previous prompt: ',
        'detail.currentPrompt': 'Current prompt',
        'detail.source': 'Source: ',
        'detail.originalPrompt': 'Original prompt:',
        'detail.enhancedPrompt': 'Enhanced prompt:',
        'detail.referenceImage': 'Reference image: ',
        'detail.firstFrame': 'First frame: ',
        'detail.lastFrame': 'Last frame: ',
        'detail.model': 'Model: ',
        'detail.aspectRatio': 'Aspect ratio: ',
        'detail.count': 'Quantity: ',
        'detail.duration': 'Duration: ',
        'detail.resolution': 'Resolution: ',
        'detail.audio': 'Audio: ',
        'detail.task': '- Task: ',
        'detail.content': '- Content: ',
        'detail.promptSource': '- Prompt source: ',
        'detail.promptEnhancement': '- Prompt enhancement: ',
        'detail.finalModel': '- Model: ',
        'detail.finalAspectRatio': '- Aspect ratio: ',
        'detail.finalDuration': '- Duration: ',
        'detail.finalResolution': '- Resolution: ',
        'detail.finalAudio': '- Audio: ',
        'detail.finalCount': '- Quantity: ',
        'detail.finalReferenceImage': '- Reference image: ',
        'detail.finalFirstFrame': '- First-frame image: ',
        'detail.finalLastFrame': '- Last-frame image: ',
        'detail.finalReferenceImages': '- Reference images: ',
      },
    }

    function interpolateMediaMessage(template, params) {
      if (!params) return template
      return template.replace(/\{(\w+)\}/g, (match, name) => name in params ? String(params[name]) : match)
    }

    function mediaText(t, key, params) {
      if (typeof t === 'function') return t(key, params)
      return interpolateMediaMessage(MEDIA_MESSAGES.zh[key] || key, params)
    }

    function translateWireText(t, value) {
      if (typeof value !== 'string' || !value) return value
      var exactKey = `wire.${value}`
      var exact = mediaText(t, exactKey)
      if (exact !== exactKey) return exact
      var imageHistory = /^历史图片不会自动复用。请明确输入 dsh-attachment:1 至 dsh-attachment:(\d+)，或提供 HTTPS URL \/ 本地图片路径$/.exec(value)
      if (imageHistory) return mediaText(t, 'wire.imageHistoryRange', { count: imageHistory[1] })
      var indexedImage = /^当前对话第 (\d+) 张用户上传图片$/.exec(value)
      if (indexedImage) return mediaText(t, 'wire.currentIndexedImage', { index: indexedImage[1] })
      var attachment = /^当前对话附件 (.+)$/.exec(value)
      if (attachment) return mediaText(t, 'wire.currentAttachment', { id: attachment[1] })
      if (/^当前对话最近一张用户上传图片$/.test(value)) return mediaText(t, 'wire.currentLatestImage')
      var recommended = /^(.*)（推荐）$/.exec(value)
      if (recommended) return `${recommended[1]}${mediaText(t, 'marker.recommended')}`
      var duration = /^(\d+) 秒$/.exec(value)
      if (duration) return mediaText(t, 'unit.seconds', { value: duration[1] })
      var count = /^(\d+) 张$/.exec(value)
      if (count) return mediaText(t, Number(count[1]) === 1 ? 'unit.image' : 'unit.images', { value: count[1] })
      var usesDefaultModel = value.startsWith('使用插件当前配置的默认模型；')
      var modelDescription = /^(?:使用插件当前配置的默认模型；)?([\d/]+) 秒 · ([^·]+) · (固定音频|音频可选|音频不可配置)$/.exec(value)
      if (modelDescription) {
        return `${usesDefaultModel ? mediaText(t, 'wire.defaultModelPrefix') : ''}${mediaText(t, 'wire.modelSpec', {
          duration: modelDescription[1],
          resolution: modelDescription[2].trim(),
          audio: translateWireText(t, modelDescription[3]),
        })}`
      }
      return value
    }

    var MEDIA_DETAIL_PREFIXES = [
      ['上次 Prompt：', 'detail.previousPrompt'],
      ['来源：', 'detail.source'],
      ['参考图：', 'detail.referenceImage'],
      ['首帧：', 'detail.firstFrame'],
      ['尾帧：', 'detail.lastFrame'],
      ['模型：', 'detail.model'],
      ['画面比例：', 'detail.aspectRatio'],
      ['数量：', 'detail.count'],
      ['时长：', 'detail.duration'],
      ['分辨率：', 'detail.resolution'],
      ['音频：', 'detail.audio'],
      ['- 任务: ', 'detail.task'],
      ['- 内容: ', 'detail.content'],
      ['- Prompt 来源: ', 'detail.promptSource'],
      ['- Prompt 增强: ', 'detail.promptEnhancement'],
      ['- 模型: ', 'detail.finalModel'],
      ['- 画面比例: ', 'detail.finalAspectRatio'],
      ['- 时长: ', 'detail.finalDuration'],
      ['- 分辨率: ', 'detail.finalResolution'],
      ['- 音频: ', 'detail.finalAudio'],
      ['- 数量: ', 'detail.finalCount'],
      ['- 参考图: ', 'detail.finalReferenceImage'],
      ['- 首帧图片: ', 'detail.finalFirstFrame'],
      ['- 尾帧图片: ', 'detail.finalLastFrame'],
      ['- 参考图片: ', 'detail.finalReferenceImages'],
    ]

    function translateMediaDetail(t, value) {
      if (typeof value !== 'string' || !value) return value
      return value.split('\n').map((line) => {
        if (line === '当前 Prompt') return mediaText(t, 'detail.currentPrompt')
        if (line === '原始 Prompt:') return mediaText(t, 'detail.originalPrompt')
        if (line === '增强后 Prompt:') return mediaText(t, 'detail.enhancedPrompt')
        for (var [prefix, key] of MEDIA_DETAIL_PREFIXES) {
          if (line.startsWith(prefix)) return `${mediaText(t, key)}${translateWireText(t, line.slice(prefix.length))}`
        }
        return line
      }).join('\n')
    }

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
      var match = /^tokensapi_media__q\d+__d(-?\d+)__(.+)$/.exec(id)
      return match ? { defaultIndex: Number(match[1]), logicalId: match[2] } : null
    }

    function isMediaOptionQuestionPending(pending) {
      return Boolean(
        pending &&
        Array.isArray(pending.questions) &&
        pending.questions.length > 0 &&
        pending.questions.every((question) => (
          mediaQuestionMeta(question && question.id) !== null &&
          (question.options === undefined || Array.isArray(question.options))
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

    function MediaQuestionComposer({ matched, t }) {
      return jsx.jsx(MediaQuestionFlow, { pending: matched, t }, matched.key)
    }

    function MediaQuestionFlow({ pending, t }) {
      var questions = pending.questions
      var [index, setIndex] = React.useState(0)
      var [drafts, setDrafts] = React.useState(() => questions.map(initialMediaQuestionDraft))
      var [busy, setBusy] = React.useState(false)
      var [error, setError] = React.useState('')
      var cardRef = React.useRef(null)
      var question = questions[index]
      var draft = drafts[index]
      var translatedHeader = translateWireText(t, question.header)
      var translatedQuestion = translateWireText(t, question.question)
      var translatedDetail = translateMediaDetail(t, question.detail)
      var hasDefault = answered(initialMediaQuestionDraft(question))

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
          setError(mediaText(t, 'ui.selectAnswer'))
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
          setError(mediaText(t, 'ui.selectAnswer'))
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
          setError(mediaText(t, 'ui.noDefault'))
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
          'aria-label': translatedQuestion,
          style: { boxSizing: 'border-box', display: 'flex', flexDirection: 'column', width: '100%', maxWidth: 'var(--dsh-chat-content-width, 760px)', maxHeight: 'min(60vh, 520px)', overflow: 'hidden', outline: 'none', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 20, background: 'var(--dsw-specific-input-major)', color: 'var(--dsw-alias-label-primary)', boxShadow: 'var(--dsw-elevation-panel)' },
          children: [
            jsx.jsxs('header', {
              style: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, padding: '18px 16px 8px 22px' },
              children: [
                jsx.jsxs('div', {
                  style: { minWidth: 0 },
                  children: [
                    translatedHeader ? jsx.jsx('div', { style: { marginBottom: 4, color: 'var(--dsw-alias-label-tertiary)', fontSize: 11, lineHeight: '16px' }, children: translatedHeader }) : null,
                    jsx.jsx('h3', { style: { margin: 0, fontSize: 16, fontWeight: 500, lineHeight: '22px' }, children: translatedQuestion }),
                  ],
                }),
                jsx.jsx('button', {
                  type: 'button',
                  disabled: busy,
                  onClick: cancelFlow,
                  title: mediaText(t, 'ui.close'),
                  'aria-label': mediaText(t, 'ui.close'),
                  style: { flex: '0 0 auto', width: 28, height: 28, padding: 0, border: 0, borderRadius: 14, cursor: busy ? 'default' : 'pointer', background: 'transparent', color: 'var(--dsw-alias-label-tertiary)', fontSize: 22, lineHeight: '26px' },
                  children: '×',
                }),
              ],
            }),
            jsx.jsxs('div', {
              style: { minHeight: 0, overflowY: 'auto', padding: '0 12px 4px' },
              children: [
                translatedDetail ? jsx.jsx('div', { style: { margin: '0 10px 8px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: 'var(--dsw-alias-label-secondary)', fontSize: 13, lineHeight: '20px' }, children: translatedDetail }) : null,
                jsx.jsx('div', {
                  style: { display: 'flex', flexDirection: 'column', gap: 3 },
                  children: (question.options || []).map((option, optionIndex) => {
                    var selected = draft.selected.includes(option.label)
                    var translatedLabel = translateWireText(t, option.label)
                    var translatedDescription = translateWireText(t, option.description)
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
                            jsx.jsx('span', { style: { display: 'block', fontSize: 14, fontWeight: 500, lineHeight: '22px' }, children: translatedLabel }),
                            translatedDescription ? jsx.jsx('span', { style: { display: 'block', color: 'var(--dsw-alias-label-tertiary)', fontSize: 13, fontWeight: 400, lineHeight: '20px' }, children: translatedDescription }) : null,
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
                  placeholder: mediaText(t, 'ui.other'),
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
                    index > 0 ? jsx.jsx('button', { type: 'button', disabled: busy, onClick: () => { setIndex(index - 1); setError('') }, style: { minHeight: 34, padding: '0 12px', border: '1px solid var(--dsw-alias-border-l3)', borderRadius: 9, background: 'transparent', color: 'inherit', cursor: busy ? 'default' : 'pointer' }, children: mediaText(t, 'ui.previous') }) : null,
                    hasDefault ? jsx.jsx('button', { type: 'button', disabled: busy, onClick: skipQuestion, title: mediaText(t, 'ui.skipHint'), 'aria-label': mediaText(t, 'ui.skipHint'), style: { minHeight: 34, padding: '0 12px', border: 0, borderRadius: 9, background: 'transparent', color: 'var(--dsw-alias-label-secondary)', cursor: busy ? 'default' : 'pointer' }, children: mediaText(t, 'ui.skip') }) : null,
                    jsx.jsx('button', { type: 'button', disabled: busy, onClick: continueFlow, style: { minHeight: 34, padding: '0 15px', border: 0, borderRadius: 9, background: 'var(--dsw-alias-button-primary-fill, var(--dsw-alias-label-primary))', color: 'var(--dsw-alias-button-primary-label, var(--dsw-alias-label-primary-foreground))', cursor: busy ? 'default' : 'pointer', fontWeight: 500 }, children: index < questions.length - 1 ? mediaText(t, 'ui.next') : mediaText(t, 'ui.confirm') }),
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

    function MediaImageRow({ toolName, block, sessions, sessionId: scopedSessionId, t, promoted = false }) {
      var done = 'kind' in block
      var attachments = done ? imageAttachments(block) : []
      var fallbacks = done ? remoteImageUrls(block) : []
      var images = useAttachmentUrls(attachments, fallbacks, sessions, scopedSessionId)
      var taskId = done ? imageTaskId(block) : ''
      var downloadTimestamp = compactDownloadTimestamp(new Date())
      var title = toolName === 'media_edit_image' ? mediaText(t, 'card.editImage') : toolName === 'media_task_status' ? mediaText(t, 'card.taskResult') : mediaText(t, 'card.generateImage')
      var status = !done ? mediaText(t, 'card.generating') : block.isError ? mediaText(t, 'card.failed') : mediaText(t, 'card.done')
      var warningLines = done ? warnings(block) : []

      if (promoted && done && attachments.length > 0) {
        return jsx.jsxs('div', {
          style: { display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 4px' },
          children: [
            jsx.jsx(Header, { title, status }),
            warningLines.length ? jsx.jsx(Notice, { error: true, children: warningLines.join('\n') }) : null,
          ],
        })
      }

      return jsx.jsxs('div', {
        style: { display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 4px' },
        children: [
          jsx.jsx(Header, { title, status }),
          images.loading ? jsx.jsx(Notice, { children: mediaText(t, 'card.loadingImages') }) : null,
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
                      alt: mediaText(t, 'card.generatedImage', { index: index + 1 }),
                      loading: 'lazy',
                      style: { width: '100%', maxHeight: 480, borderRadius: 12, display: 'block', objectFit: 'contain', background: 'var(--dsw-alias-bg-layer-1)' },
                    }),
                  }),
                  downloadUrl ? jsx.jsx('a', {
                    href: downloadUrl,
                    download: filename,
                    title: mediaText(t, 'card.downloadImage'),
                    'aria-label': mediaText(t, 'card.downloadImage'),
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
          }) : !images.loading ? jsx.jsx(Notice, { error: done, children: done ? mediaText(t, 'card.noImage') : mediaText(t, 'card.generatingImage') }) : null,
          images.error ? jsx.jsx(Notice, { error: true, children: mediaText(t, 'card.attachmentFallback', { error: images.error }) }) : null,
          warningLines.length ? jsx.jsx(Notice, { error: true, children: warningLines.join('\n') }) : null,
        ],
      })
    }

    var MEDIA_IMAGE_RESULT_NODE = 'tokensapi-media-image-result'
    var MEDIA_IMAGE_TOOL_NAMES = new Set(['media_generate_image', 'media_edit_image', 'media_task_status'])

    function mediaImageResultDefinition() {
      return {
        kind: MEDIA_IMAGE_RESULT_NODE,
        target: 'chat',
        match(event) {
          if (event.type === 'tool/call' && MEDIA_IMAGE_TOOL_NAMES.has(event.data?.name)) {
            return { id: String(event.data.callId), role: 'start' }
          }
          if (event.type === 'tool/result' && (!event.surfaceOp || event.surfaceOp === 'append')) {
            var content = event.data?.message?.content
            if (!Array.isArray(content) || !content.some((block) => block?.type === 'image' && block.attachment)) return null
            var callId = event.data?.message?.source?.callId
            return callId === undefined ? null : { id: String(callId), role: 'update' }
          }
          return null
        },
        start(_context, match) {
          var event = match.event
          return {
            toolName: event.data.name,
            argsRaw: event.data.arguments,
            callTime: event.time,
            result: null,
          }
        },
        update(context, match) {
          if (match.event.type !== 'tool/result') return context.state
          var event = match.event
          var message = event.data.message
          return {
            ...context.state,
            result: {
              kind: 'tool-result',
              seq: event.seq,
              time: event.time,
              callId: String(message.source.callId),
              name: context.state.toolName,
              call: { name: context.state.toolName, argsRaw: context.state.argsRaw },
              callTime: context.state.callTime,
              content: Array.isArray(message.content) ? message.content : [],
              isError: message.isError === true,
              ...(event.data.error === undefined ? {} : { error: event.data.error }),
              meta: event.data.meta,
              subCalls: [],
            },
          }
        },
        buildViewNode(context) {
          var current = context.current.get('chat')
          var result = context.state?.result
          var hasImages = result && imageAttachments(result).length > 0
          if (!hasImages) return current == null ? null : { ...current, visibility: 'hidden' }
          var location = context.matches.at(-1)?.location ?? context.start?.location ?? { kind: 'unresolved' }
          return {
            key: context.key,
            kind: MEDIA_IMAGE_RESULT_NODE,
            id: context.id,
            target: 'chat',
            anchorSeq: result.seq,
            location,
            visibility: 'visible',
            groupTree: 'turn',
            data: { toolName: context.state.toolName, block: result },
          }
        },
      }
    }

    var MEDIA_VIDEO_RESULT_NODE = 'tokensapi-media-video-result'
    var MEDIA_VIDEO_TOOL_NAMES = new Set(['media_generate_video', 'media_task_status'])

    function mediaVideoResultDefinition() {
      return {
        kind: MEDIA_VIDEO_RESULT_NODE,
        target: 'chat',
        match(event) {
          if (event.type === 'tool/call' && MEDIA_VIDEO_TOOL_NAMES.has(event.data?.name)) {
            return { id: String(event.data.callId), role: 'start' }
          }
          if (event.type === 'tool/result' && (!event.surfaceOp || event.surfaceOp === 'append')) {
            var content = event.data?.message?.content
            if (!Array.isArray(content) || !videoUrl({ kind: 'tool-result', content })) return null
            var callId = event.data?.message?.source?.callId
            return callId === undefined ? null : { id: String(callId), role: 'update' }
          }
          return null
        },
        start(_context, match) {
          var event = match.event
          return {
            toolName: event.data.name,
            argsRaw: event.data.arguments,
            callTime: event.time,
            result: null,
          }
        },
        update(context, match) {
          if (match.event.type !== 'tool/result') return context.state
          var event = match.event
          var message = event.data.message
          return {
            ...context.state,
            result: {
              kind: 'tool-result',
              seq: event.seq,
              time: event.time,
              callId: String(message.source.callId),
              name: context.state.toolName,
              call: { name: context.state.toolName, argsRaw: context.state.argsRaw },
              callTime: context.state.callTime,
              content: Array.isArray(message.content) ? message.content : [],
              isError: message.isError === true,
              ...(event.data.error === undefined ? {} : { error: event.data.error }),
              meta: event.data.meta,
              subCalls: [],
            },
          }
        },
        buildViewNode(context) {
          var current = context.current.get('chat')
          var result = context.state?.result
          if (!result || !videoUrl(result)) return current == null ? null : { ...current, visibility: 'hidden' }
          var location = context.matches.at(-1)?.location ?? context.start?.location ?? { kind: 'unresolved' }
          return {
            key: context.key,
            kind: MEDIA_VIDEO_RESULT_NODE,
            id: context.id,
            target: 'chat',
            anchorSeq: result.seq,
            location,
            visibility: 'visible',
            groupTree: 'turn',
            data: { toolName: context.state.toolName, block: result },
          }
        },
      }
    }

    function MediaVideoRow({ block, t, promoted = false }) {
      var done = 'kind' in block
      var remoteUrl = done ? videoUrl(block) : null
      var filePath = done ? savedPath(block) : null
      var url = localVideoUrl(filePath) || remoteUrl
      var warningLines = done ? warnings(block) : []
      var aspectRatio = videoAspectRatio(block)
      var [playerState, setPlayerState] = React.useState('loading')
      React.useEffect(() => setPlayerState('loading'), [url])

      if (promoted && done && url) {
        return jsx.jsxs('div', {
          style: { display: 'flex', flexDirection: 'column', gap: 8, width: '100%', minWidth: 0, padding: '8px 4px' },
          children: [
            jsx.jsx(Header, { title: mediaText(t, 'card.generateVideo'), status: block.isError ? mediaText(t, 'card.failed') : mediaText(t, 'card.done') }),
            warningLines.length ? jsx.jsx(Notice, { error: true, children: warningLines.join('\n') }) : null,
          ],
        })
      }

      return jsx.jsxs('div', {
        style: { display: 'flex', flexDirection: 'column', gap: 8, width: '100%', minWidth: 0, padding: '8px 4px' },
        children: [
          jsx.jsx(Header, { title: mediaText(t, 'card.generateVideo'), status: !done ? mediaText(t, 'card.generating') : block.isError ? mediaText(t, 'card.failed') : mediaText(t, 'card.done') }),
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
                children: mediaText(t, 'card.loadingVideo'),
              }) : null,
              playerState === 'error' ? jsx.jsxs('div', {
                style: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, color: '#fff', background: '#111', textAlign: 'center', fontSize: 13 },
                children: [
                  jsx.jsx('span', { children: mediaText(t, 'card.playbackFailed') }),
                  remoteUrl ? jsx.jsx('a', { href: remoteUrl, target: '_blank', rel: 'noreferrer', style: { color: '#8ab4ff' }, children: mediaText(t, 'card.openSourceVideo') }) : null,
                ],
              }) : null,
            ],
          }) : null,
          !done ? jsx.jsx(Notice, { children: mediaText(t, 'card.generatingVideo') }) : null,
          done && !url ? jsx.jsx(Notice, { error: true, children: mediaText(t, 'card.noVideo') }) : null,
          remoteUrl ? jsx.jsx('a', { href: remoteUrl, target: '_blank', rel: 'noreferrer', style: { color: 'var(--dsw-alias-label-link)', fontSize: 13, overflowWrap: 'anywhere' }, children: mediaText(t, 'card.openSourceVideoWindow') }) : null,
          filePath ? jsx.jsx(Notice, { children: mediaText(t, 'card.savedLocally', { path: filePath }) }) : null,
          warningLines.length ? jsx.jsx(Notice, { error: true, children: warningLines.join('\n') }) : null,
        ],
      })
    }

    var inject = ['slots', 'sessions', 'locale', 'uiConversation']

    function apply(ctx) {
      var sessions = ctx.get('sessions')
      var locale = ctx.get('locale')
      var uiConversation = ctx.get('uiConversation')
      var promotedImageResults = false
      var promotedVideoResults = false
      ctx.effect(() => locale.register(MEDIA_LOCALE_NS, MEDIA_MESSAGES), 'media-gen: locale dictionaries')
      var ImageRow = (props) => jsx.jsx(MediaImageRow, { ...props, sessions, promoted: promotedImageResults })
      var VideoRow = (props) => jsx.jsx(MediaVideoRow, { ...props, promoted: promotedVideoResults })
      var PromotedImageNode = ({ node, sessionId, t }) => jsx.jsx(MediaImageRow, {
        toolName: node.data.toolName,
        block: node.data.block,
        sessions,
        sessionId,
        t,
      })
      var PromotedVideoNode = ({ node, t }) => jsx.jsx(MediaVideoRow, {
        block: node.data.block,
        t,
      })
      if (uiConversation?.events && typeof uiConversation.events.register === 'function') {
        try {
          ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
            name: 'conversation.chat.node',
            key: MEDIA_IMAGE_RESULT_NODE,
            locale: MEDIA_LOCALE_NS,
          }, PromotedImageNode))
          uiConversation.events.register(mediaImageResultDefinition())
          promotedImageResults = true
        } catch (error) {
          console.warn('[dsh-media-gen] inline image promotion is unavailable; keeping images inside the tool card', error)
        }
        try {
          ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
            name: 'conversation.chat.node',
            key: MEDIA_VIDEO_RESULT_NODE,
            locale: MEDIA_LOCALE_NS,
          }, PromotedVideoNode))
          uiConversation.events.register(mediaVideoResultDefinition())
          promotedVideoResults = true
        } catch (error) {
          console.warn('[dsh-media-gen] inline video promotion is unavailable; keeping videos inside the tool card', error)
        }
      }
      ctx.slots.inject('conversation.composer', () => ctx.slots.register({
        name: 'conversation.composer',
        priority: -100,
        select: ({ pendingInteraction }) => isMediaOptionQuestionPending(pendingInteraction) ? pendingInteraction : null,
        locale: MEDIA_LOCALE_NS,
      }, MediaQuestionComposer))
      ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({ name: 'tool.call.toolview', key: 'media_generate_image', locale: MEDIA_LOCALE_NS }, ImageRow))
      ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({ name: 'tool.call.toolview', key: 'media_edit_image', locale: MEDIA_LOCALE_NS }, ImageRow))
      ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({ name: 'tool.call.toolview', key: 'media_generate_video', locale: MEDIA_LOCALE_NS }, VideoRow))
      ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({ name: 'tool.call.toolview', key: 'media_task_status', locale: MEDIA_LOCALE_NS }, (props) => {
        return imageAttachments('kind' in props.block ? props.block : null).length
          ? jsx.jsx(ImageRow, props)
          : jsx.jsx(VideoRow, props)
      }))
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
