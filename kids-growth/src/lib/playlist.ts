/**
 * 「把跟读串成一段完整对话」的排期。
 *
 * 为什么值得单独做:现在的口语练习是**一句一句割裂**的 ——
 * 机器人说一句、他跟一句、翻页、再来一句。练完他脑子里留下的是十个碎片,
 * 而不是「我和人说了一段话」。
 *
 * 而语言真正的成就感来自**连起来那一刻**:
 * 机器的声音和他自己的声音一来一回地放出来,他会发现
 * 「原来这一整段是我说的」。这一下比十次正确率反馈都管用。
 *
 * 这个文件只管**排出播放顺序**(谁说、说什么、用哪份音频、间隔多久),
 * 真正播放交给页面 —— 排期是纯逻辑,可以被自测钉死;播放依赖浏览器 API。
 */

export type Speaker = 'bot' | 'kid'

export interface PlayItem {
  speaker: Speaker
  /** 这一句的文本 */
  text: string
  /**
   * 孩子那一句的录音路径;没录过就是空串。
   * 空串时页面会退回用机器音念一遍 —— **不能跳过**:
   * 跳过会让整段对话缺一半,听起来像机器在自言自语。
   */
  voice: string
  /** 这一句读完之后停多久再放下一句(毫秒) */
  gapMs: number
  /** 他这一句到底是自己的声音,还是没录过用机器音顶上的 */
  isOwnVoice: boolean
}

/** 一来一回之间的停顿:比句内停顿长一点,听起来才像两个人在对话 */
const GAP_TURN = 700
/** 同一个人连着说时的停顿 */
const GAP_SAME = 380

export interface DialogLine {
  speaker: Speaker
  text: string
}

export interface PlaylistOpts {
  /**
   * 「自问自答」:两边的句子都优先用他自己的录音。
   *
   * 为什么单独做一档:平时回放是「机器一句、他一句」,他听到的是
   * **一半自己**。而他在角色互换里把问句也录过之后,整段其实两边都有他的声音 ——
   * 这时候连起来放,他听到的是自己在跟自己一问一答。
   * 对 4 岁半的孩子来说这件事本身就足够好玩,好玩就会多听几遍,
   * 多听几遍就是多输入几遍 —— 趣味在这里不是包装,是复读机。
   *
   * 没录过的那句照样用机器音顶上,不跳过(理由同 PlayItem.voice)。
   */
  ownAll?: boolean
}

/**
 * 排出播放顺序。
 *
 * `voiceOf` 由调用方提供:给一句话,返回孩子录音的本地路径(没有就空串)。
 */
export function buildPlaylist(
  lines: DialogLine[],
  voiceOf: (text: string) => string,
  opts: PlaylistOpts = {},
): PlayItem[] {
  const out: PlayItem[] = []
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    const text = String(l?.text ?? '').trim()
    if (!text) continue
    const useOwn = l.speaker === 'kid' || !!opts.ownAll
    const voice = useOwn ? String(voiceOf(text) ?? '') : ''
    const next = lines[i + 1]
    out.push({
      speaker: l.speaker,
      text,
      voice,
      isOwnVoice: !!voice,
      gapMs: next && next.speaker !== l.speaker ? GAP_TURN : GAP_SAME,
    })
  }
  return out
}

/**
 * 这一段里他自己的声音占了几句 / 一共几句。
 * 界面用它说一句「这段里有 3 句是你自己说的」—— 那个数字本身就是动力。
 */
export function ownVoiceCount(items: PlayItem[]): { own: number; kid: number } {
  const kid = items.filter((i) => i.speaker === 'kid')
  return { own: kid.filter((i) => i.isOwnVoice).length, kid: kid.length }
}

/**
 * 自问自答能不能放得起来。
 *
 * 判据不是「录满了」而是**两边各有至少一句** ——
 * 全录满才给听会把这个功能推到很远的以后,而他需要的是尽快听到一次
 * 「咦这两个都是我」。差的那几句用机器音顶着,不影响那个瞬间。
 */
export function selfTalkReady(
  lines: DialogLine[],
  voiceOf: (text: string) => string,
): { ok: boolean; own: number; total: number; askOwn: boolean; answerOwn: boolean } {
  const items = buildPlaylist(lines, voiceOf, { ownAll: true })
  const askOwn = items.some((i) => i.speaker === 'bot' && i.isOwnVoice)
  const answerOwn = items.some((i) => i.speaker === 'kid' && i.isOwnVoice)
  return {
    ok: askOwn && answerOwn,
    own: items.filter((i) => i.isOwnVoice).length,
    total: items.length,
    askOwn,
    answerOwn,
  }
}

/**
 * 角色互换:把「谁说哪一句」对调。
 *
 * 为什么要有:一直是机器问、他答,他练的只有「回答」。
 * 而真实对话里**提问和回答是两种能力**,提问还更难 ——
 * 它要求他先想清楚自己想知道什么。
 * 对调之后同一段内容能再练一遍,而且练的是完全不同的那一半。
 */
export function swapRoles(lines: DialogLine[]): DialogLine[] {
  return lines.map((l) => ({ ...l, speaker: l.speaker === 'bot' ? 'kid' : 'bot' }))
}
