/**
 * 中英文可选音色 —— **纯数据**,不碰任何小程序 API。
 *
 * 为什么单独放在 core/ 而不是留在 lib/audio.ts:
 * audio.ts 依赖 InnerAudioContext、requirePlugin 这些只有小程序运行时才有的
 * 东西,在 Node 里编不动,于是这份清单也就没法自动校验。
 * 而它恰恰是最需要校验的 —— 「音色 id 在音源表里根本不存在」这种错,
 * 表现出来就是「选了没反应」,肉眼极难发现。
 * 抽出来之后,自测能直接验它和 ZH_SOURCES / EN_SOURCES 对得上。
 */

/**
 * 可选音色。家长可以在家长中心挑,选完记在本地,朗读时排到最前。
 *
 * 为什么要给选择:好不好听很主观 —— 有的孩子喜欢童声(度丫丫),
 * 有的家长觉得女声更清楚、更适合读古诗。与其我替他定,不如让他听一遍自己挑。
 */
export interface VoiceOption {
  id: string
  label: string
  desc: string
}

/*
 * 中文音色。
 *
 * ⚠️ 按**引擎**排在前面,百度内部的音色细分排在后面 —— 这是有原因的:
 * 真机自检显示百度那四个音色全都连得上,但用户听着一模一样。
 * 最可能的解释是这个免费接口早就不认 `per` 参数了(自检里有一项
 * 专门下载两个音色比字节数,一样就直接告诉你「换哪个都一样」)。
 *
 * 所以把**确实是另一套引擎**的搜狗和有道放到最前面:
 * 想换个声音,选这两个才真的会变。
 */
export const ZH_VOICES: VoiceOption[] = [
  { id: 'sogou-zh', label: '搜狗 · 中文', desc: '另一套引擎,和百度明显不同 —— 想换声音先试它' },
  { id: 'youdao-zh-le', label: '有道 · 中文', desc: '词典真人音,单字和词最自然;整句它没有' },
  { id: 'baidu-zh-child', label: '百度 · 童声(度丫丫)', desc: '合成音,整句最稳' },
  { id: 'baidu-zh-female', label: '百度 · 女声(度小美)', desc: '同一引擎,可能和上面听不出区别' },
  { id: 'baidu-zh-male', label: '百度 · 男声(度小宇)', desc: '同一引擎,可能和上面听不出区别' },
  { id: 'baidu-zh-yao', label: '百度 · 度逍遥', desc: '同一引擎,可能和上面听不出区别' },
]

export const EN_VOICES: VoiceOption[] = [
  { id: 'youdao-en-us', label: '美音 · 真人', desc: '有道真人录音,单词最自然' },
  { id: 'youdao-en-uk', label: '英音 · 真人', desc: '英式发音' },
  { id: 'baidu-en-child', label: '英语童声', desc: '合成音,句子更连贯' },
]
