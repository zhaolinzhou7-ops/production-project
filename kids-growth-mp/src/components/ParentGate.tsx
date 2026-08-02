import { useState } from 'react'
import { View, Text } from '@tarojs/components'
import { makeGateQuestion, gateAnswerOk, type GateQuestion } from '../core/parentGate'
import './ParentGate.scss'

/**
 * 家长确认闸门。
 *
 * 为什么不用 `Taro.showModal({ editable: true })`:
 * 那个输入框在真机上很难用 —— 键盘常常挡住输入区、有时干脆点不进去,
 * 结果是「题会算,但填不进去」,家长被自己家的锁挡在门外。
 * 一个防误触的设计如果连正主都进不来,那它就是坏的。
 *
 * 所以改成页面内的大数字键盘:不调系统键盘、按钮做到 100rpx 以上,
 * 屏幕上一直看得见题目和已经输入的数字。
 *
 * 题目是两位数加法 —— 4–6 岁的孩子答不上来,成年人不用想。
 * 比 PIN 好在家长不用记密码,也不会因为忘了密码把自己锁在外面。
 */

interface Req {
  title: string
  detail: string
  onPass: () => void
}

export function useParentGate(): {
  ask: (title: string, detail: string, onPass: () => void) => void
  gate: JSX.Element | null
} {
  const [req, setReq] = useState<Req | null>(null)
  const [q, setQ] = useState<GateQuestion>(() => makeGateQuestion())
  const [input, setInput] = useState('')
  const [wrong, setWrong] = useState(false)

  const ask = (title: string, detail: string, onPass: () => void) => {
    setQ(makeGateQuestion())
    setInput('')
    setWrong(false)
    setReq({ title, detail, onPass })
  }

  const close = () => setReq(null)

  const submit = () => {
    if (!req) return
    if (gateAnswerOk(input, q)) {
      const run = req.onPass
      setReq(null)
      run()
      return
    }
    // 答错就换一道新题,并且清空 —— 不给「照着上一次微调」的机会
    setWrong(true)
    setQ(makeGateQuestion())
    setInput('')
  }

  const press = (d: string) => {
    setWrong(false)
    // 答案最多四位(88+88=176),再长必然是按错了
    if (input.length >= 4) return
    setInput(input + d)
  }

  const gate = req ? (
    <View className='pgate'>
      <View className='pgate__box'>
        <Text className='pgate__t'>{req.title}</Text>
        <Text className='pgate__d'>{req.detail}</Text>
        <Text className='pgate__q'>{q.text}</Text>
        <View className='pgate__screen'>
          <Text className='pgate__val'>{input || '—'}</Text>
        </View>
        {wrong ? <Text className='pgate__err'>不对,换了一道新的</Text> : null}
        <View className='pgate__pad'>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <View key={d} className='pgate__k' onClick={() => press(d)}>
              <Text className='pgate__kt'>{d}</Text>
            </View>
          ))}
          <View className='pgate__k' onClick={() => setInput('')}>
            <Text className='pgate__kt'>清空</Text>
          </View>
          <View className='pgate__k' onClick={() => press('0')}>
            <Text className='pgate__kt'>0</Text>
          </View>
          <View className='pgate__k' onClick={() => setInput(input.slice(0, -1))}>
            <Text className='pgate__kt'>⌫</Text>
          </View>
        </View>
        <View className='pgate__row'>
          <View className='pgate__btn pgate__btn--ghost' onClick={close}>
            <Text className='pgate__bt'>取消</Text>
          </View>
          <View className='pgate__btn' onClick={submit}>
            <Text className='pgate__bt'>确定</Text>
          </View>
        </View>
      </View>
    </View>
  ) : null

  return { ask, gate }
}
