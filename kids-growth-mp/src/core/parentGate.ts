/**
 * 家长确认闸门的题目生成(纯逻辑,可被自测覆盖)。
 *
 * 为什么需要这道闸门:这台设备是交到 4 岁半的孩子手上的,而他会到处点。
 * 「全部重置」「清空贴纸册」「移除卡组」「清空本地数据」一旦被误点,
 * 没了的是他自己一题一题攒出来的东西 —— 弹一句「确定吗?」拦不住他,
 * 那个「确定」他照点不误。
 *
 * 所以用一道**他还做不了、而家长一眼就能算**的算术题。
 * 比 PIN 好在:家长不用记密码,也不会因为忘了密码把自己锁在门外。
 */

export interface GateQuestion {
  text: string
  answer: number
}

/** 两位数加两位数:4–6 岁答不上来,成年人不用想 */
export function makeGateQuestion(rand: () => number = Math.random): GateQuestion {
  const a = 11 + Math.floor(rand() * 78) // 11–88
  const b = 11 + Math.floor(rand() * 78)
  return { text: `${a} + ${b} = ?`, answer: a + b }
}

/** 答案是否正确。空白、非数字一律算错,不给「乱按也能过」的机会 */
export function gateAnswerOk(input: string, q: GateQuestion): boolean {
  const s = String(input ?? '').trim()
  if (!s) return false
  const n = Number(s)
  return Number.isFinite(n) && n === q.answer
}
