// 微信同声传译插件(WechatSI)封装:语音识别(用于本地打分)+ 文字转语音(中文/英文 TTS)。
// 需在 src/app.config.ts 的 plugins 里注册 WechatSI,并在 mp 后台添加该插件。

export type SpeechLang = 'zh_CN' | 'en_US'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _plugin: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function plugin(): any {
  if (!_plugin) {
    _plugin = requirePlugin('WechatSI')
  }
  return _plugin
}

/**
 * 插件是否真的可用。
 * 后台没添加「微信同声传译」时 requirePlugin 会抛错 —— 这里把结果缓存下来,
 * 避免每次朗读都抛一次异常;上层据此回退到网络音源(见 lib/audio.ts)。
 */
let _available: boolean | null = null
export function isSpeechAvailable(): boolean {
  if (_available !== null) return _available
  try {
    _available = !!plugin() && typeof plugin().textToSpeech === 'function'
  } catch {
    _available = false
  }
  return _available
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _mgr: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function manager(): any {
  if (!_mgr) _mgr = plugin().getRecordRecognitionManager()
  return _mgr
}

export interface RecognizeCallbacks {
  /** 识别结束,返回识别到的文本 */
  onResult: (text: string) => void
  onError: (msg: string) => void
}

/** 开始「录音 + 识别」(WechatSI 一体):读完后调用 stopRecognize()。 */
export function startRecognize(lang: SpeechLang, cb: RecognizeCallbacks): boolean {
  try {
    const m = manager()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    m.onStop = (res: any) => cb.onResult((res && res.result) || '')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    m.onError = (res: any) => cb.onError((res && res.msg) || '识别失败')
    m.start({ duration: 30000, lang })
    return true
  } catch {
    cb.onError('设备不支持语音识别')
    return false
  }
}

export function stopRecognize(): void {
  try {
    manager().stop()
  } catch {
    /* 忽略 */
  }
}

/** 文字转语音,返回可播放的临时文件路径(用 InnerAudioContext 播放)。 */
export function textToSpeech(content: string, lang: SpeechLang): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      plugin().textToSpeech({
        lang,
        tts: true,
        content,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        success: (res: any) => resolve(res.filename as string),
        fail: (e: unknown) => reject(e),
      })
    } catch (e) {
      reject(e)
    }
  })
}
