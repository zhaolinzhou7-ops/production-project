import { View, Text } from '@tarojs/components'
import { polyphoneOf } from '../core/polyphone'
import { playText } from '../lib/audio'
import './PolyphoneNote.scss'

/**
 * 多音字提示条。
 *
 * 识字卡每个字只带一个拼音,孩子学到「行 xíng」就以为这字只有一个读法,
 * 以后碰到「银行」必然读错。这里把其它读音一并摆出来,并且**每个读音可点**。
 *
 * 关键细节:点了之后读的是**组词**而不是单字 ——
 * 单字送给发音接口,回来的永远是最常用的那个读音,听不出区别;
 * 读「银行」才能真听到 háng。这也顺带教了孩子「读音跟着词走」。
 */
export interface PolyphoneNoteProps {
  /** 要查的汉字(单字) */
  ch: string
}

/** 组词字段形如「银行 / 一行字」,取第一个词来朗读 */
function speakable(word: string): string {
  const first = word.split('/')[0]
  return first.replace(/\s+/g, '')
}

export default function PolyphoneNote({ ch }: PolyphoneNoteProps) {
  const list = ch.length === 1 ? polyphoneOf(ch) : []
  if (list.length === 0) return null

  return (
    <View className='poly'>
      <Text className='poly__hd'>「{ch}」是多音字,有 {list.length} 个读音</Text>
      {list.map((r) => (
        <View
          key={r.py}
          className='poly__row'
          onClick={() => void playText(speakable(r.word), 'zh_CN')}
        >
          <Text className='poly__py'>{r.py}</Text>
          <Text className='poly__w'>{r.word}</Text>
          <Text className='poly__spk'>🔊</Text>
        </View>
      ))}
      <Text className='poly__tip'>点一行,听听这个读音用在什么词里</Text>
    </View>
  )
}
