/**
 * 朗读音源表 —— **纯数据 + 纯字符串拼接**,不碰任何小程序 API。
 *
 * 和 core/voices.ts 一样,放在 core/ 是为了能被自测覆盖:
 * 「家长中心列出的音色,在音源表里根本没有对应项」这种错,
 * 表现出来就是「选了没反应」,肉眼极难发现,但机器一秒就能查出来。
 */

export interface AudioSource {
  id: string
  label: string
  /** 超过这个字数就跳过该音源 */
  maxLen: number
  url: (t: string) => string
}

export const enc = encodeURIComponent

/**
 * 百度语音公开接口。
 *
 * 参数是踩过坑的:
 * - 原来带 `aue=6`(输出 wav)。公开接口的 wav 码率低、底噪明显 —— 用户反馈的
 *   「有杂音、不清晰」多半来自这里。去掉后走默认 mp3,干净得多。
 * - `vol` 原来给到 9(最大),容易削顶失真,回到 5。
 * - `spd=4` 比正常语速稍慢半档,小朋友听得清。
 */
export const baiduUrl = (lan: 'zh' | 'en', per: number, id: string, label: string): AudioSource => ({
  id,
  label,
  maxLen: 300,
  url: (t) =>
    `https://tts.baidu.com/text2audio?lan=${lan}&text=${enc(t)}&spd=4&pit=5&vol=5&per=${per}&cuid=kidsgrowth&ctp=1&idx=1`,
})

export const ZH_SOURCES: AudioSource[] = [
  baiduUrl('zh', 4, 'baidu-zh-child', '百度·童声(度丫丫)'),
  baiduUrl('zh', 0, 'baidu-zh-female', '百度·女声(度小美)'),
  baiduUrl('zh', 1, 'baidu-zh-male', '百度·男声(度小宇)'),
  baiduUrl('zh', 3, 'baidu-zh-yao', '百度·度逍遥'),
  {
    id: 'baidu-zh-plain',
    label: '百度·简版(参数最少)',
    maxLen: 300,
    url: (t) => `https://tts.baidu.com/text2audio?lan=zh&ie=UTF-8&spd=5&text=${enc(t)}`,
  },
  {
    id: 'youdao-zh-t2',
    label: '有道·中文(通道1)',
    maxLen: 120,
    url: (t) => `https://dict.youdao.com/dictvoice?audio=${enc(t)}&type=2`,
  },
  {
    id: 'youdao-zh-le',
    label: '有道·中文(le=zh)',
    maxLen: 120,
    url: (t) => `https://dict.youdao.com/dictvoice?audio=${enc(t)}&le=zh`,
  },
  {
    id: 'sogou-zh',
    label: '搜狗·中文',
    maxLen: 200,
    url: (t) =>
      `https://fanyi.sogou.com/reventondc/synthesis?text=${enc(t)}&speed=1&lang=zh-CHS&from=translateweb&speaker=1`,
  },
  {
    id: 'baidu-fanyi-zh',
    label: '百度翻译·中文',
    maxLen: 200,
    url: (t) => `https://fanyi.baidu.com/gettts?lan=zh&text=${enc(t)}&spd=3&source=web`,
  },
]

export const EN_SOURCES: AudioSource[] = [
  {
    id: 'youdao-en-us',
    label: '有道·美音(真人词库)',
    maxLen: 120,
    url: (t) => `https://dict.youdao.com/dictvoice?audio=${enc(t)}&type=2`,
  },
  {
    id: 'youdao-en-uk',
    label: '有道·英音(真人词库)',
    maxLen: 120,
    url: (t) => `https://dict.youdao.com/dictvoice?audio=${enc(t)}&type=1`,
  },
  baiduUrl('en', 4, 'baidu-en-child', '百度·英语童声'),
  {
    id: 'baidu-en-plain',
    label: '百度·英语简版',
    maxLen: 300,
    url: (t) => `https://tts.baidu.com/text2audio?lan=en&ie=UTF-8&spd=5&text=${enc(t)}`,
  },
]
