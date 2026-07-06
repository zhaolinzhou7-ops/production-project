import Taro from '@tarojs/taro'

/** 口音:1=英式 2=美式(有道 dictvoice 约定) */
export type Accent = 1 | 2

let ctx: Taro.InnerAudioContext | null = null
function audioCtx(): Taro.InnerAudioContext {
  if (!ctx) {
    ctx = Taro.createInnerAudioContext()
  }
  return ctx
}

/**
 * 播放单词的真人发音(有道 dictvoice),用 InnerAudioContext 直接播 URL。
 * 注意:小程序需在 mp 后台把 dict.youdao.com 加入「downloadFile 合法域名」;
 * 开发者工具里勾选「不校验合法域名」也可调试。取不到时静默(批次 B 接 WechatSI 合成音兜底)。
 */
export function playWordAudio(word: string, accent: Accent = 2): void {
  const url = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=${accent}`
  try {
    const a = audioCtx()
    a.stop()
    a.src = url
    a.play()
  } catch {
    /* 忽略:音频播放失败 */
  }
}

/** 释放音频上下文(页面卸载时可调用) */
export function disposeAudio(): void {
  try {
    ctx?.destroy()
  } catch {
    /* 忽略 */
  }
  ctx = null
}
