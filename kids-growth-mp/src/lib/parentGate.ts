import Taro from '@tarojs/taro'
import { makeGateQuestion, gateAnswerOk } from '../core/parentGate'

/**
 * 弹出家长确认。答对才执行 onPass。
 *
 * 答错不重试、不提示正确答案 —— 直接当作取消,
 * 免得孩子把它当成一个「多试几次就能过」的猜数字游戏。
 */
export function askParent(title: string, detail: string, onPass: () => void): void {
  const q = makeGateQuestion()
  Taro.showModal({
    title,
    content: `${detail}\n\n请家长确认:${q.text}`,
    editable: true,
    placeholderText: '在这里填答案',
    success: (res) => {
      if (!res.confirm) return
      if (gateAnswerOk(String(res.content ?? ''), q)) {
        onPass()
        return
      }
      Taro.showModal({
        title: '没有改动',
        content: '答案不对,什么都没有变。如果是家长在操作,再点一次重新算一道。',
        showCancel: false,
      })
    },
  })
}
