import Taro from '@tarojs/taro'
import { textToSpeech, type SpeechLang } from './speech'

/** 口音:1=英式 2=美式(有道 dictvoice 约定) */
export type Accent = 1 | 2

let ctx: Taro.InnerAudioContext | null = null
function audioCtx(): Taro.InnerAudioContext {
  if (!ctx) ctx = Taro.createInnerAudioContext()
  return ctx
}

/**
 * 播放单词的真人发音(有道 dictvoice),InnerAudioContext 直接播 URL。
 * 需在 mp 后台把 dict.youdao.com 加入「downloadFile 合法域名」(开发者工具可勾「不校验合法域名」)。
 * 取不到时回退 WechatSI 合成音。
 */
export function playWordAudio(word: string, accent: Accent = 2): void {
  const url = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=${accent}`
  try {
    const a = audioCtx()
    a.offError()
    a.stop()
    a.src = url
    a.onError(() => {
      // 有道取不到 → 合成音兜底
      void playText(word, 'en_US')
    })
    a.play()
  } catch {
    void playText(word, 'en_US')
  }
}

/** 用 WechatSI 合成音朗读(中文古诗/识字、或英语兜底) */
export async function playText(text: string, lang: SpeechLang): Promise<void> {
  try {
    const file = await textToSpeech(text, lang)
    const a = audioCtx()
    a.offError()
    a.stop()
    a.src = file
    a.play()
  } catch {
    /* 忽略:合成音失败 */
  }
}

export function disposeAudio(): void {
  try {
    ctx?.destroy()
  } catch {
    /* 忽略 */
  }
  ctx = null
}
