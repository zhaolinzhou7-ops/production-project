/**
 * 录音和放音的互斥闸。
 *
 * 为什么要有:麦克风和喇叭在同一台设备上**是一件事**。
 * 一边录自己的声音、一边点朗读,结果是两个声音同时往外放,
 * 而且喇叭里的范读还会被麦克风录进去 —— 回放时听到的是自己念一半、
 * 机器念一半糊在一起。用户报的原话是「两个声音会打架」。
 *
 * 页面上把按钮灰掉是第一道防线,但不够 ——
 * 连播定时器、自动朗读、上一页残留的播放链都不经过按钮。
 * 所以真正的闸门放在这里:**录音一开始,所有在放的声音立刻停,
 * 录音期间任何播放请求直接不响应。**
 *
 * 为什么单独一个文件:pronounce 需要「开录之前把音停掉」,
 * audio/tts 需要「放之前问一句是不是在录」—— 两边互相 import 会成环。
 * 这个文件谁都不依赖,双方各依赖它一次,环就断了。
 */

let recording = false

/** 各个播放器注册进来的「停止」动作 */
const stoppers: Array<() => void> = []

/** 兜底解锁:开录后最多锁这么久 */
const MAX_LOCK_MS = 120000
let unlockTimer: ReturnType<typeof setTimeout> | null = null

/** 播放器把自己的停止函数登记进来(只登记一次,不重复堆积) */
export function registerAudioStopper(fn: () => void): void {
  if (!stoppers.includes(fn)) stoppers.push(fn)
}

/** 把所有正在响的声音停掉(逐个 try:一个抛错不能让后面的漏掉) */
export function stopAllAudio(): void {
  for (const f of stoppers) {
    try {
      f()
    } catch {
      /* 忽略 */
    }
  }
}

/** 是不是正在录音 —— 播放前问这一句 */
export function isRecording(): boolean {
  return recording
}

/**
 * 开始录音。先停声再上锁,顺序不能反 ——
 * 反过来的话停止里如果有异步收尾,尾音仍可能漏出半秒被录进去。
 */
export function beginRecording(): void {
  stopAllAudio()
  recording = true
  if (unlockTimer) clearTimeout(unlockTimer)
  /*
    为什么要兜底:录音开着的时候直接关标签页 / 切走,
    结束回调有可能永远不来。那时候锁如果不自动开,
    整个应用从此一点声音都没有 —— 这种坏法比声音打架严重得多。
    浏览器这边录音没有硬性时长上限,所以给到两分钟。
  */
  unlockTimer = setTimeout(() => {
    recording = false
    unlockTimer = null
  }, MAX_LOCK_MS)
}

/** 录音结束(正常停止或出错都要调),把闸门放开 */
export function endRecording(): void {
  recording = false
  if (unlockTimer) clearTimeout(unlockTimer)
  unlockTimer = null
}
