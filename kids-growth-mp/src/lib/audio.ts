import Taro from '@tarojs/taro'
import { textToSpeech, isSpeechAvailable, type SpeechLang } from './speech'

/** 口音:1=英式 2=美式(有道 dictvoice 约定) */
export type Accent = 1 | 2

let ctx: Taro.InnerAudioContext | null = null
function audioCtx(): Taro.InnerAudioContext {
  if (!ctx) ctx = Taro.createInnerAudioContext()
  return ctx
}

/** 网络真人音源(有道词典发音):小程序里用 InnerAudioContext 直接播 URL */
function youdaoUrl(text: string, accent: Accent = 2): string {
  return `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(text)}&type=${accent}`
}

/** 播一个 URL,失败时执行兜底 */
function playUrl(url: string, onFail?: () => void): void {
  try {
    const a = audioCtx()
    a.offError()
    a.stop()
    a.src = url
    a.onError(() => onFail?.())
    a.play()
  } catch {
    onFail?.()
  }
}

/**
 * 播放单词的真人发音(有道 dictvoice)。
 * 需在 mp 后台把 dict.youdao.com 加入「downloadFile 合法域名」;
 * 开发阶段 project.config.json 已关掉域名校验。取不到时回退插件合成音。
 */
export function playWordAudio(word: string, accent: Accent = 2): void {
  playUrl(youdaoUrl(word, accent), () => {
    if (isSpeechAvailable()) void playPluginText(word, 'en_US')
  })
}

/** 用「微信同声传译」插件合成音朗读 */
async function playPluginText(text: string, lang: SpeechLang): Promise<void> {
  try {
    const file = await textToSpeech(text, lang)
    const a = audioCtx()
    a.offError()
    a.stop()
    a.src = file
    a.play()
  } catch {
    /* 忽略:合成失败 */
  }
}

/**
 * 朗读一段文字(中文古诗/识字,或英语兜底)。
 *
 * 插件优先——「微信同声传译」的中文最自然。但该插件并非每个账号都能添加
 * (后台可能搜不到,或受主体/类目限制),所以**插件不可用时自动回退到网络
 * 真人音源**,保证没有插件时中文不会整个哑掉。
 */
export async function playText(text: string, lang: SpeechLang): Promise<void> {
  const t = text.trim()
  if (!t) return
  if (isSpeechAvailable()) {
    await playPluginText(t, lang)
    return
  }
  playUrl(youdaoUrl(t, 2))
}

export function disposeAudio(): void {
  try {
    ctx?.destroy()
  } catch {
    /* 忽略 */
  }
  ctx = null
}
