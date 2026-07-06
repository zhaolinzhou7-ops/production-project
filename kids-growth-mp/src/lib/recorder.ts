import Taro from '@tarojs/taro'

// 录音(用于「录我读的 → 回放」),与 WechatSI 的识别分开:
// - RecorderManager 负责录音并给出 tempFilePath 供回放/AB 对比
// - 识别打分走 src/lib/speech.ts(WechatSI)
// 隐私:录音只存本地临时文件,不上传;可随时被系统回收。

let manager: Taro.RecorderManager | null = null
function rec(): Taro.RecorderManager {
  if (!manager) manager = Taro.getRecorderManager()
  return manager
}

let playCtx: Taro.InnerAudioContext | null = null
function player(): Taro.InnerAudioContext {
  if (!playCtx) playCtx = Taro.createInnerAudioContext()
  return playCtx
}

/** 开始录音;stopRecord() 后通过回调拿到本地临时文件路径 */
export function startRecord(onStop: (tempFilePath: string) => void, onError?: (msg: string) => void): void {
  const r = rec()
  r.onStop((res) => onStop(res.tempFilePath))
  r.onError((res) => onError?.((res && (res as { errMsg?: string }).errMsg) || '录音失败'))
  r.start({
    duration: 15000,
    format: 'mp3',
    sampleRate: 44100,
    numberOfChannels: 1,
    encodeBitRate: 96000,
  })
}

export function stopRecord(): void {
  try {
    rec().stop()
  } catch {
    /* 忽略 */
  }
}

/** 回放一个本地音频文件 */
export function playFile(tempFilePath: string): void {
  try {
    const p = player()
    p.stop()
    p.src = tempFilePath
    p.play()
  } catch {
    /* 忽略 */
  }
}
