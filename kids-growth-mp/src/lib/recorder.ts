import Taro from '@tarojs/taro'
import { beginRecording, endRecording, isRecording } from './audioLock'

// 录音(用于「录我读的 → 回放」),与 WechatSI 的识别分开:
// - RecorderManager 负责录音并给出 tempFilePath 供回放/AB 对比
// - 识别打分走 src/lib/speech.ts(WechatSI)
// 隐私:录音只存本地临时文件,不上传;可随时被系统回收。

let manager: Taro.RecorderManager | null = null

/**
 * 当前这次录音的回调。
 *
 * ⚠️ 这里有个很隐蔽的坑:原先每次 startRecord() 都调一遍 `r.onStop(...)`。
 * RecorderManager 的 onStop 是**往监听列表里加**,不是替换 —— 录第 5 句时,
 * 前 4 次注册的回调会一起被触发,而每个回调都闭包着**自己那句话**。
 * 结果是录第 5 句时,前 4 句的录音路径全被改写成第 5 句的音频,
 * 家长会发现「录了一圈,点哪句放的都是最后录的那句」。
 *
 * 所以监听只在创建 manager 时注册一次,真正要跑的回调放在这两个变量里换。
 */
let pendingStop: ((tempFilePath: string) => void) | null = null
let pendingError: ((msg: string) => void) | null = null

function rec(): Taro.RecorderManager {
  if (!manager) {
    manager = Taro.getRecorderManager()
    manager.onStop((res) => {
      // 先开闸再回调:回调里往往紧接着就要放一遍刚录的,不开闸会被自己挡住
      endRecording()
      const cb = pendingStop
      // 先清再调:回调里如果又发起一次录音,新注册的不能被这次清理擦掉
      pendingStop = null
      pendingError = null
      if (cb) cb(res.tempFilePath)
    })
    manager.onError((res) => {
      endRecording()
      const cb = pendingError
      pendingStop = null
      pendingError = null
      cb?.((res && (res as { errMsg?: string }).errMsg) || '录音失败')
    })
  }
  return manager
}

let playCtx: Taro.InnerAudioContext | null = null
function player(): Taro.InnerAudioContext {
  if (!playCtx) playCtx = Taro.createInnerAudioContext()
  return playCtx
}

/** 开始录音;stopRecord() 后通过回调拿到本机临时文件路径 */
export function startRecord(onStop: (tempFilePath: string) => void, onError?: (msg: string) => void): void {
  const r = rec()
  pendingStop = onStop
  pendingError = onError ?? null
  // 上闸:正在响的声音立刻停掉,录音期间任何播放请求都不响应。
  // 不这么做的话喇叭里的范读会被麦克风一起录进去。
  beginRecording()
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
  // 正在录音时不放 —— 放了就会被录进去,而且两个声音叠着响
  if (isRecording()) return
  try {
    const p = player()
    p.stop()
    p.src = tempFilePath
    p.play()
  } catch {
    /* 忽略 */
  }
}

/**
 * 把录音从临时文件转成**长期文件**。
 *
 * RecorderManager 给的是 tempFilePath —— 小程序退出就可能被清掉。
 * 家长录了 50 句,第二天全没了,这个功能就白做了。
 * saveFile 之后拿到的路径才是能一直用的。
 */
export function keepRecording(
  tempFilePath: string,
  onDone: (savedPath: string) => void,
  onError?: (msg: string) => void,
): void {
  try {
    Taro.getFileSystemManager().saveFile({
      tempFilePath,
      success: (res) => onDone((res as { savedFilePath?: string }).savedFilePath || tempFilePath),
      fail: (e) => onError?.((e && (e as { errMsg?: string }).errMsg) || '保存失败'),
    })
  } catch (e) {
    onError?.(e instanceof Error ? e.message : String(e))
  }
}

/** 这个本机文件还在不在 —— 系统空间紧张时会回收长期文件 */
export function fileExists(path: string): boolean {
  if (!path) return false
  try {
    Taro.getFileSystemManager().accessSync(path)
    return true
  } catch {
    return false
  }
}

/**
 * 停掉本机文件的播放。
 *
 * 必须有这个:家长录音走的是**这里**的播放器,在线音源走 audio.ts 里的
 * 另一个。原先 stopAudio() 只停得了后者 —— 于是「正在放爸爸的录音时
 * 又点了别的词」,两个声音会叠在一起响。
 */
export function stopFile(): void {
  try {
    playCtx?.stop()
  } catch {
    /* 忽略 */
  }
}
