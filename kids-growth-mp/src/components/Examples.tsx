import { useState } from 'react'
import { View, Text } from '@tarojs/components'
import { examplesFor, pluralPhrase } from '../core/examples'
import { playWordAudio } from '../lib/audio'
import { startRecord, stopRecord, playFile, keepRecording } from '../lib/recorder'
import { saveMyVoice, getMyVoice } from '../store/voice'
import './Examples.scss'

/**
 * 例句面板 —— 一个词学完之后,给他这个词**待在句子里的样子**。
 *
 * 为什么必须有:孤立地背单词是效率最低的一种学法。孩子记住 "apple" 之后
 * 并不会用它 —— 他没见过它在句子里长什么样。而
 * **"an apple" → "I see an apple." → "The apple is here."** 这一串,
 * 才是他真正能开口说出来的东西。
 *
 * 三件事都在这一块里:
 * 1. **听**:每一条都能点着读(家长录过的优先放家长的声音)
 * 2. **说**:每一条都能录下来
 * 3. **回放**:录过的随时能再听 —— 录音是存下来的,退出重进还在
 *
 * 全程纯英文:不显示中文释义。这个年纪先建立「英语—画面」的直接联系,
 * 中间插一道中文翻译反而会让他养成「先翻译再理解」的习惯。
 */
export default function Examples(props: {
  /** 要学的那个英文词 */
  word: string
  /** 内容包 key —— 决定这个词按哪一类套句型(见 core/examples) */
  packKey: string
  /** 字母卡专用:A 对应的那个词(Apple) */
  topic?: string
  /** 这张卡的大图,放在例句上方帮他把句子和画面对上 */
  emoji?: string
  /** 中文意思 —— 只给家长看(默认藏起来) */
  zh?: string
}) {
  const { word, packKey, topic, emoji, zh } = props
  const [recordingOf, setRecordingOf] = useState('')
  /*
    纯英文有一个副作用:**家长也看不懂了**。

    而这个年纪判「读对了没有」的人是家长 —— 他得知道这个词是什么意思。
    所以给家长一个小开关,默认关着:孩子看到的还是纯英文,
    家长要确认的时候点一下。这比在孩子眼前一直摆着中文好得多。
  */
  const [showZh, setShowZh] = useState(false)
  /** 改一下就重新渲染:录音索引是同步读的,不会自己通知 */
  const [tick, setTick] = useState(0)

  const lines: string[] = []
  const phrase = pluralPhrase(word, packKey)
  for (const l of examplesFor(word, packKey, topic)) lines.push(l)
  // 可数名词额外给一条复数组词(two cats)—— 单复数是这个年纪最容易漏掉的一环
  if (phrase && lines.length < 4) lines.splice(1, 0, phrase)

  if (lines.length === 0) return null

  const toggle = (line: string) => {
    if (recordingOf === line) {
      stopRecord()
      return
    }
    if (recordingOf) return
    setRecordingOf(line)
    startRecord(
      (path) => {
        keepRecording(
          path,
          (saved) => {
            // 存成长期文件:退出小程序还在。同一句再录直接覆盖 —— 重录就是因为上一条不满意
            saveMyVoice(line, saved, 'kid')
            setRecordingOf('')
            setTick((n) => n + 1)
          },
          () => {
            setRecordingOf('')
            setTick((n) => n + 1)
          },
        )
      },
      () => setRecordingOf(''),
    )
  }

  /** 三条连起来读一遍:短语 → 句子,一次听完整 */
  const playAll = () => {
    lines.forEach((line, i) => {
      // 每条之间留够时间,不然会互相打断
      setTimeout(() => void playWordAudio(line), i * 2200)
    })
  }

  return (
    <View className='ex' key={tick}>
      <View className='ex__top'>
        <Text className='ex__h'>Read it 读一读</Text>
        <View className='ex__tops'>
          <Text className='ex__all' onClick={playAll}>
            ▶ 连读
          </Text>
          {zh ? (
            <Text className='ex__zh' onClick={() => setShowZh((v) => !v)}>
              {showZh ? zh : '中文(家长)'}
            </Text>
          ) : null}
        </View>
      </View>
      {emoji ? <Text className='ex__emoji'>{emoji}</Text> : null}
      {lines.map((line) => {
        const mine = getMyVoice(line, 'kid')
        const busy = recordingOf === line
        return (
          <View key={line} className='ex__row'>
            <Text className='ex__t' onClick={() => void playWordAudio(line)}>
              {line}
            </Text>
            <View className='ex__acts'>
              <Text className='ex__b' onClick={() => void playWordAudio(line)}>
                🔊
              </Text>
              {busy ? (
                <Text className='ex__b ex__b--rec' onClick={() => toggle(line)}>
                  ⏹
                </Text>
              ) : null}
              {!busy ? (
                <Text className='ex__b' onClick={() => toggle(line)}>
                  🎤
                </Text>
              ) : null}
              {mine && !busy ? (
                <Text className='ex__b' onClick={() => playFile(mine)}>
                  ▶
                </Text>
              ) : null}
            </View>
          </View>
        )
      })}
      <Text className='ex__hint'>点句子听一遍,🎤 录下自己读的,▶ 放出来比一比</Text>
    </View>
  )
}
