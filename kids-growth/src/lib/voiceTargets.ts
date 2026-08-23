import { DIALOGS, CARTOONS, RHYMES, retellSentencesFor, dialogsFor, cartoonsFor } from './talkContent'
import { rankForRecording, type Candidate, type RankedSentence } from './voicePriority'
import type { AgeStage } from '../types'

/**
 * 「该录哪些句子」的清单。
 *
 * 现实是这样的:英语内容有几百句,而家长真正会坐下来录的大概二十句。
 * 如果让他自己从几百句里挑,结果通常是录了开头几段就放弃 ——
 * 而开头几段未必是孩子最常碰到的。所以由程序排好序端上来。
 *
 * 只收**英语**句子:中文有可用的在线音源,英语整句没有 —— 家长有限的
 * 耐心应该全部花在真正没有替代品的地方。
 */

/** 这个学段会碰到的所有英语句子(带出处,用于告诉家长「这句在哪儿会用到」) */
export function englishCandidates(stage: AgeStage): Candidate[] {
  const out: Candidate[] = []
  const push = (text: string, level: string, where: string) => {
    const t = String(text ?? '').trim()
    if (t) out.push({ text: t, level, where })
  }

  const dialogs = dialogsFor(stage).length > 0 ? dialogsFor(stage) : DIALOGS
  for (const d of dialogs) {
    for (const t of d.turns) {
      push(t.bot, d.level === 'easy' ? 'easy' : 'hard', `对话·${d.title}`)
      push(t.expect, d.level === 'easy' ? 'easy' : 'hard', `对话·${d.title}`)
    }
  }
  for (const r of retellSentencesFor(stage)) push(r.en, 'easy', '复述练习')
  const cartoons = cartoonsFor(stage).length > 0 ? cartoonsFor(stage) : CARTOONS
  for (const c of cartoons) {
    for (const l of c.lines) push(l.en, c.level === 'easy' ? 'easy' : 'hard', `动画·${c.titleZh}`)
  }
  for (const r of RHYMES) {
    for (const l of r.lines) push(l, 'medium', `儿歌·${r.titleZh}`)
  }
  return out
}

/** 排好序的「先录这些」;默认 20 句 —— 一次坐下来大约十分钟录得完 */
export function topEnglishSentences(stage: AgeStage, limit = 20): RankedSentence[] {
  return rankForRecording(englishCandidates(stage), limit)
}
