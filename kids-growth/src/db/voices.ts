import { db } from './db'
import { voiceKeyOf, isValidVoiceKey } from '../lib/voiceKey'
import type { VoiceClip, VoiceOwner } from '../types'

/**
 * 家长/孩子自己录的句子 —— **网页版英语声音的真正解法**。
 *
 * 为什么必须有这个:英语**整句**没有可用的免费音源。单词能读,是因为
 * 有道词典对每个词都存了真人录音;整句它没有,其它免费接口要么不给整句,
 * 要么读出来是机器拼的。小程序那边换了七八个音源都绕不过去 ——
 * 这不是代码问题,是没有料。
 *
 * 而家长自己录一遍,一次解决全部问题:不依赖网络、不会被接口下线、
 * 发音是稳定的,而且是**爸爸的声音** —— 对一个 4 岁半的孩子来说,
 * 这比任何合成音都强,他会为了听那个声音而多点两遍。
 *
 * 录音以 Blob 存在本机 IndexedDB 里,**不上传任何地方**。
 *
 * 两种录音的用途完全不同,必须分开存(owner 字段):
 * - parent:家长的范读。**会顶替在线音源** —— 孩子点「听」放的就是它。
 * - kid:孩子自己的跟读。只用来回放和前后对比,**绝不能**被当成范读
 *   放给他听 —— 那等于拿他自己的发音去教他自己。
 */

/**
 * 「这句话有没有录音」必须能**同步**回答。
 *
 * 播放路径上到处都要问这个问题(点一下要立刻出声),而 IndexedDB 是异步的。
 * 所以在内存里维持一份**键的索引**:启动时加载一次,之后每次增删同步维护。
 * 真正的音频 Blob 仍然按需异步取 —— 索引只有几百个短字符串,不占地方。
 */
const index: Record<VoiceOwner, Set<string>> = { parent: new Set(), kid: new Set() }
let loaded = false

/** 启动时调用一次;重复调用是安全的 */
export async function loadVoiceIndex(): Promise<void> {
  try {
    const all = await db.voices.toArray()
    index.parent.clear()
    index.kid.clear()
    for (const v of all) index[v.owner]?.add(v.key)
    loaded = true
  } catch {
    /* 没有录音也要能正常用 */
  }
}

export function voiceIndexLoaded(): boolean {
  return loaded
}

/** 同步:这句话有没有录音(播放路径上用) */
export function hasMyVoice(text: string, owner: VoiceOwner = 'parent'): boolean {
  const k = voiceKeyOf(text)
  return isValidVoiceKey(k) && index[owner].has(k)
}

/** 异步:取出音频本体 */
export async function getMyVoice(text: string, owner: VoiceOwner = 'parent'): Promise<Blob | null> {
  const k = voiceKeyOf(text)
  if (!isValidVoiceKey(k)) return null
  const row = await db.voices.get([owner, k]).catch(() => undefined)
  return row?.blob ?? null
}

/**
 * 存一条。
 *
 * 家长要的录音逻辑就三条,这里全部落实:
 * 1. 不重新录 → 保持最后一次的存档(什么都不做,原记录还在)
 * 2. 重新录  → **直接覆盖**原存档(重录通常就是因为上一条不满意)
 * 3. 家长的和孩子的分开存,互不覆盖(owner)
 */
export async function saveMyVoice(
  text: string,
  blob: Blob,
  owner: VoiceOwner = 'parent',
): Promise<boolean> {
  const k = voiceKeyOf(text)
  if (!isValidVoiceKey(k) || !blob || blob.size === 0) return false
  /*
    时间戳必须**严格递增**,不能直接用 Date.now()。
    连着录两句很容易落在同一毫秒里,那样「最近录的排最前面」就成了随机的 ——
    家长录完一句想马上试听,却要在列表里找。比最大值再 +1 就没这个问题。
  */
  // 只取最大的那条时间戳,不要把所有录音的 Blob 都读进内存 —— 那是几十兆
  const latest = await db.voices.orderBy('at').last()
  const maxAt = latest?.at ?? 0
  const clip: VoiceClip = {
    owner,
    key: k,
    text: String(text),
    blob,
    at: Math.max(Date.now(), maxAt + 1),
  }
  await db.voices.put(clip)
  index[owner].add(k)
  return true
}

export async function deleteMyVoice(text: string, owner: VoiceOwner = 'parent'): Promise<void> {
  const k = voiceKeyOf(text)
  if (!isValidVoiceKey(k)) return
  await db.voices.delete([owner, k])
  index[owner].delete(k)
}

/** 全部录音,最近录的排前面 —— 家长中心里列出来管理 */
export async function listMyVoices(owner: VoiceOwner = 'parent'): Promise<VoiceClip[]> {
  const all = await db.voices.where('owner').equals(owner).toArray()
  return all.sort((a, b) => b.at - a.at)
}

export async function myVoiceCount(owner: VoiceOwner = 'parent'): Promise<number> {
  return db.voices.where('owner').equals(owner).count()
}
