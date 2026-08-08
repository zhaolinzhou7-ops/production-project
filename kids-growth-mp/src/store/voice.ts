import { readObject, writeObject } from './db'
import { voiceKeyOf, isValidVoiceKey } from '../core/voiceKey'

/**
 * 家长自己录的句子。
 *
 * 为什么要有这个功能:英语**整句**没有可用的免费音源。单词能读,是因为
 * 有道词典对每个词都存了真人录音;整句它没有,其它免费接口要么不给整句,
 * 要么读出来是机器拼的。换了七八个音源都绕不过去 —— 这不是代码问题,
 * 是没有料。
 *
 * 而家长自己录一遍,一次解决全部问题:不依赖网络、不会被接口下线、
 * 发音是稳定的,而且是**爸爸的声音** —— 对一个 4 岁半的孩子来说,
 * 这比任何合成音都强,他会为了听那个声音而多点两遍。
 *
 * 录音只存在本机,不上传任何地方。
 */

/**
 * 谁录的。
 *
 * 两种录音的用途完全不同,必须分开存:
 * - parent:家长的范读。**会顶替在线音源** —— 孩子点「听」放的就是它。
 * - kid:孩子自己的跟读/复述。只用来回放和 A/B 对比,**绝不能**被当成范读
 *   放给他听 —— 那等于拿他自己的发音去教他自己。
 *
 * 原先孩子那份根本没存:录完只拿到一个临时文件路径,退出小程序就没了。
 * 家长辛苦陪着录了一晚上,第二天想听听进步,什么都不剩。
 */
export type VoiceOwner = 'parent' | 'kid'

/** parent 沿用旧 key,老用户已经录好的不会因为这次改动丢掉 */
const KEY_BY_OWNER: Record<VoiceOwner, string> = { parent: 'myVoices', kid: 'kidVoices' }

export interface VoiceEntry {
  /** 归一化后的句子(索引用) */
  key: string
  /** 录的时候那句话的原文,列表里显示给家长看 */
  text: string
  /** 本机文件路径 */
  path: string
  at: number
}

type VoiceMap = Record<string, VoiceEntry>

function readAll(owner: VoiceOwner = 'parent'): VoiceMap {
  const m = readObject<VoiceMap>(KEY_BY_OWNER[owner], {})
  return m && typeof m === 'object' ? m : {}
}

/** 这句话有没有家长录音;有就返回本机文件路径 */
export function getMyVoice(text: string, owner: VoiceOwner = 'parent'): string {
  const k = voiceKeyOf(text)
  if (!isValidVoiceKey(k)) return ''
  const e = readAll(owner)[k]
  return e && typeof e.path === 'string' ? e.path : ''
}

/** 存一条。同一句再录一次直接覆盖 —— 家长重录通常就是因为上一条不满意 */
export function saveMyVoice(text: string, path: string, owner: VoiceOwner = 'parent'): boolean {
  const k = voiceKeyOf(text)
  if (!isValidVoiceKey(k) || !path) return false
  const all = readAll(owner)
  /*
    时间戳必须**严格递增**,不能直接用 Date.now()。

    连着录两句很容易落在同一毫秒里,那样「最近录的排最前面」就成了随机的 ——
    家长录完一句想马上试听,却要在列表里找。比最大值再 +1 就没这个问题。
  */
  let maxAt = 0
  for (const e of Object.values(all)) if (e && e.at > maxAt) maxAt = e.at
  const at = Math.max(Date.now(), maxAt + 1)
  all[k] = { key: k, text: String(text), path, at }
  writeObject(KEY_BY_OWNER[owner], all)
  return true
}

export function deleteMyVoice(text: string, owner: VoiceOwner = 'parent'): void {
  const k = voiceKeyOf(text)
  const all = readAll(owner)
  if (!all[k]) return
  delete all[k]
  writeObject(KEY_BY_OWNER[owner], all)
}

/** 全部录音,最近录的排前面 —— 家长中心里列出来管理 */
export function listMyVoices(owner: VoiceOwner = 'parent'): VoiceEntry[] {
  return Object.values(readAll(owner)).sort((a, b) => b.at - a.at)
}

export function myVoiceCount(owner: VoiceOwner = 'parent'): number {
  return Object.keys(readAll(owner)).length
}

/**
 * 清掉指向已失效文件的记录。
 *
 * 小程序的本机文件是有可能被系统回收的(空间紧张时)。留着一条指向
 * 不存在文件的记录,表现就是「显示已录音,点了不响」—— 那比没录还让人恼火。
 * exists 由调用方(能访问文件系统的那一层)提供,这里只做纯粹的筛选。
 */
export function pruneMissing(exists: (path: string) => boolean, owner: VoiceOwner = 'parent'): number {
  const all = readAll(owner)
  let dropped = 0
  for (const k of Object.keys(all)) {
    if (!exists(all[k].path)) {
      delete all[k]
      dropped += 1
    }
  }
  if (dropped > 0) writeObject(KEY_BY_OWNER[owner], all)
  return dropped
}
