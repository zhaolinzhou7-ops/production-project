import { useState } from 'react'
import { View, Text, Input } from '@tarojs/components'
import './Prompt.scss'

/**
 * 页面内的输入框。
 *
 * 为什么不用 `Taro.showModal({ editable: true })`:那个输入框在真机上很难用 ——
 * 键盘常常挡住输入区、有时干脆点不进去。表现就是「知道要填什么,但填不进去」。
 * 一个功能如果卡在输入这一步,后面做得再好都到不了用户手上。
 *
 * 这里用真正的 `<Input>` 放在页面里:键盘弹起时页面会自己让位,
 * 输入过程全程看得见,还能指定数字键盘。
 */

interface Req {
  title: string
  hint: string
  /** 数字键盘(改密码这类) */
  numeric?: boolean
  /** 打开时预填的内容 */
  initial?: string
  onOk: (value: string) => void
}

export function usePrompt(): {
  prompt: (opts: Req) => void
  promptNode: JSX.Element | null
} {
  const [req, setReq] = useState<Req | null>(null)
  const [val, setVal] = useState('')

  const prompt = (opts: Req) => {
    setVal(opts.initial ?? '')
    setReq(opts)
  }

  const promptNode = req ? (
    <View className='prm'>
      <View className='prm__box'>
        <Text className='prm__t'>{req.title}</Text>
        <Input
          className='prm__in'
          type={req.numeric ? 'number' : 'text'}
          placeholder={req.hint}
          value={val}
          focus
          onInput={(e) => setVal(String(e.detail.value))}
        />
        <View className='prm__row'>
          <View className='prm__btn prm__btn--ghost' onClick={() => setReq(null)}>
            <Text className='prm__bt'>取消</Text>
          </View>
          <View
            className='prm__btn'
            onClick={() => {
              const v = val.trim()
              const run = req.onOk
              setReq(null)
              run(v)
            }}
          >
            <Text className='prm__bt'>确定</Text>
          </View>
        </View>
      </View>
    </View>
  ) : null

  return { prompt, promptNode }
}
