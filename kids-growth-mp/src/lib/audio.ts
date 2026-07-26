import Taro from '@tarojs/taro'
import { readObject, writeObject } from '../store/db'
import { textToSpeech, isSpeechAvailable, type SpeechLang } from './speech'

/** 口音:1=英式 2=美式(有道 dictvoice 约定) */
export type Accent = 1 | 2

/**
 * 多音源朗读管线(与网页版同思路)。
 *
 * 为什么要好几个音源:这些公开接口没有稳定性承诺,某一家随时可能
 * 「连得上但返回的不是音频」(中文有道就是这样)。所以按顺序一个个试,
 * 第一个真能出声的就用它,并把它记下来,下次优先用 —— 用户不用管。
 *
 * 小程序限制:InnerAudioContext 播放网络音频,**真机**需要在小程序后台
 * 把这些域名加入「downloadFile 合法域名」;开发者工具里关掉域名校验即可。
 */
export interface AudioSource {
  id: string
  label: string
  /** 超过这个字数就跳过该音源 */
  maxLen: number
  url: (t: string) => string
}

const enc = encodeURIComponent

/** 百度语音公开接口:per=4 是童声「度丫丫」,对小朋友最友好 */
const baidu = (lan: 'zh' | 'en', per: number, id: string, label: string): AudioSource => ({
  id,
  label,
  maxLen: 300,
  url: (t) =>
    `https://tts.baidu.com/text2audio?lan=${lan}&text=${enc(t)}&spd=4&pit=5&vol=9&per=${per}&cuid=kidsgrowth&ctp=1&idx=1&aue=6`,
})

export const ZH_SOURCES: AudioSource[] = [
  baidu('zh', 4, 'baidu-zh-child', '百度·童声(度丫丫)'),
  baidu('zh', 0, 'baidu-zh-female', '百度·女声'),
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
  baidu('en', 4, 'baidu-en-child', '百度·英语童声'),
  {
    id: 'baidu-en-plain',
    label: '百度·英语简版',
    maxLen: 300,
    url: (t) => `https://tts.baidu.com/text2audio?lan=en&ie=UTF-8&spd=5&text=${enc(t)}`,
  },
]

/** 记住上次真正出过声的音源,下次优先用它(省掉重复试错的等待) */
const PREF_KEY_ZH = '_prefZh'
const PREF_KEY_EN = '_prefEn'

function ordered(list: AudioSource[], prefKey: string): AudioSource[] {
  const pref = readObject<string>(prefKey, '')
  if (!pref) return list
  const hit = list.find((s) => s.id === pref)
  return hit ? [hit, ...list.filter((s) => s !== hit)] : list
}

// ---------------------------------------------------------------- 播放

let current: Taro.InnerAudioContext | null = null
/** 每次新的朗读都会 +1,老的播放链看到号变了就自己停手,避免几段声音抢着播 */
let token = 0

function dispose(a: Taro.InnerAudioContext): void {
  // 逐个 try:前一步抛错不能让后面的清理被跳过(否则会漏掉 destroy)
  try {
    a.offError()
  } catch {
    /* 忽略 */
  }
  try {
    a.stop()
  } catch {
    /* 忽略 */
  }
  try {
    a.destroy()
  } catch {
    /* 忽略 */
  }
}

export function stopAudio(): void {
  token += 1
  if (current) {
    dispose(current)
    current = null
  }
}

/** 逐个音源尝试播放,第一个真能出声的就留下 */
function playSequence(text: string, list: AudioSource[], prefKey: string, i: number, my: number): void {
  if (my !== token) return
  if (i >= list.length) return
  const s = list[i]
  if (text.length > s.maxLen) {
    playSequence(text, list, prefKey, i + 1, my)
    return
  }

  const a = Taro.createInnerAudioContext()
  try {
    // 手机静音键打开时也要能听见(小朋友的机器常年静音)
    a.obeyMuteSwitch = false
  } catch {
    /* 老版本基础库没有这个属性 */
  }
  current = a

  let moved = false
  let started = false
  const next = () => {
    if (moved) return
    moved = true
    dispose(a)
    playSequence(text, list, prefKey, i + 1, my)
  }
  const succeeded = () => {
    if (started) return
    started = true
    writeObject(prefKey, s.id)
  }

  try {
    a.onCanplay(succeeded)
  } catch {
    /* 老基础库没有 onCanplay */
  }
  try {
    a.onPlay(succeeded)
    a.onEnded(() => {
      moved = true
    })
    a.onError(() => {
      // 有的源会「先能播、再报错」(返回的其实是网页不是音频),照样往下试
      started = false
      next()
    })
  } catch {
    /* 忽略:事件注册失败时靠超时兜底 */
  }

  try {
    a.src = s.url(text)
    a.play()
  } catch {
    next()
    return
  }

  // 迟迟没有动静 = 这家不通,换下一家
  setTimeout(() => {
    if (my !== token) return
    if (!started) next()
  }, 4500)
}

/** 播放单词的真人发音(英语) */
export function playWordAudio(word: string, accent: Accent = 2): void {
  const t = word.trim()
  if (!t) return
  token += 1
  const list = ordered(EN_SOURCES, PREF_KEY_EN)
  // 指定英音时把英音提到最前
  const arranged =
    accent === 1 ? [...list].sort((a, b) => (a.id === 'youdao-en-uk' ? -1 : b.id === 'youdao-en-uk' ? 1 : 0)) : list
  playSequence(t, arranged, PREF_KEY_EN, 0, token)
}

/** 用「微信同声传译」插件合成音朗读(后台添加了插件才有) */
async function playPluginText(text: string, lang: SpeechLang): Promise<boolean> {
  try {
    const file = await textToSpeech(text, lang)
    token += 1
    const my = token
    const a = Taro.createInnerAudioContext()
    try {
      a.obeyMuteSwitch = false
    } catch {
      /* 忽略 */
    }
    if (my !== token) return true
    current = a
    a.src = file
    a.play()
    return true
  } catch {
    return false
  }
}

/**
 * 朗读一段文字。插件优先(中文最自然),没有插件就走多音源真人管线。
 */
export async function playText(text: string, lang: SpeechLang): Promise<void> {
  const t = text.trim()
  if (!t) return
  if (isSpeechAvailable()) {
    if (await playPluginText(t, lang)) return
  }
  token += 1
  if (lang === 'zh_CN') {
    let list = ordered(ZH_SOURCES, PREF_KEY_ZH)
    // 短词(识字的单字、词语)优先走有道词典 —— 词典查得到的词才有真人音,
    // 而有道是目前唯一确认可达的音源。长句子则按常规顺序试。
    if (t.length <= 4) {
      const yd = list.find((s) => s.id === 'youdao-zh-le')
      if (yd) list = [yd, ...list.filter((s) => s !== yd)]
    }
    playSequence(t, list, PREF_KEY_ZH, 0, token)
  } else {
    playSequence(t, ordered(EN_SOURCES, PREF_KEY_EN), PREF_KEY_EN, 0, token)
  }
}

// ---------------------------------------------------------------- 自检

function msgOf(e: unknown): string {
  if (e instanceof Error) return e.message || String(e)
  try {
    return typeof e === 'string' ? e : JSON.stringify(e)
  } catch {
    return String(e)
  }
}

/**
 * 单个音源探活:能不能真的取到音频(静音探测,不出声)。
 *
 * ⚠️ 这里每一步都单独 try/catch:不同版本基础库对 InnerAudioContext 的
 * 属性/方法支持不一样(比如老版本没有 onCanplay),任何一步抛错都不能
 * 让整个自检崩掉 —— 崩了用户就只剩一个看不懂的堆栈。
 */
function probeUrl(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false
    let a: Taro.InnerAudioContext | null = null
    const finish = (ok: boolean) => {
      if (done) return
      done = true
      if (a) dispose(a)
      resolve(ok)
    }
    try {
      a = Taro.createInnerAudioContext()
    } catch {
      resolve(false)
      return
    }
    try {
      a.volume = 0
    } catch {
      /* 忽略:静音探测失败就让它出声,不影响结果 */
    }
    try {
      a.onCanplay(() => finish(true))
    } catch {
      /* 老基础库没有 onCanplay,靠 onPlay/超时判断 */
    }
    try {
      a.onPlay(() => finish(true))
    } catch {
      /* 忽略 */
    }
    try {
      a.onError(() => finish(false))
    } catch {
      /* 忽略 */
    }
    try {
      a.src = url
      a.play()
    } catch {
      finish(false)
      return
    }
    setTimeout(() => finish(false), 4000)
  })
}

export interface DiagLine {
  label: string
  ok: boolean
}

/** 声音自检:把中英文各音源挨个试一遍,如实返回哪家能用 */
export async function diagnoseAudio(onProgress?: (done: number, total: number) => void): Promise<DiagLine[]> {
  try {
    stopAudio()
  } catch {
    /* 忽略 */
  }
  // 有道是**词典**发音:查得到的词才有音频。所以中文要按「单字/词/整句」
  // 分档测,才能知道哪些内容(识字=单字、古诗=整句)真的能出声。
  const youdaoZh = (t: string) => `https://dict.youdao.com/dictvoice?audio=${enc(t)}&le=zh`
  const jobs: Array<{ label: string; url: string }> = [
    ...EN_SOURCES.map((s) => ({ label: s.label, url: s.url('apple') })),
    { label: '有道·中文 单字「好」', url: youdaoZh('好') },
    { label: '有道·中文 词「你好」', url: youdaoZh('你好') },
    { label: '有道·中文 四字「春眠不觉」', url: youdaoZh('春眠不觉') },
    { label: '有道·中文 整句「白日依山尽」', url: youdaoZh('白日依山尽') },
    ...ZH_SOURCES.filter((s) => s.id !== 'youdao-zh-le').map((s) => ({
      label: s.label,
      url: s.url('白日依山尽'),
    })),
  ]
  const out: DiagLine[] = []
  for (let i = 0; i < jobs.length; i++) {
    let ok = false
    try {
      ok = await probeUrl(jobs[i].url)
    } catch {
      ok = false
    }
    out.push({ label: jobs[i].label, ok })
    try {
      onProgress?.(i + 1, jobs.length)
    } catch {
      /* 忽略:进度提示失败不影响自检 */
    }
  }
  return out
}

/**
 * 快速自检:只回答「能不能取到英文音频」,失败时给出原因。
 * 'ok' = 正常,其他字符串是可以直接显示给用户的失败说明。
 */
export function probeAudio(text = 'apple'): Promise<string> {
  return new Promise((resolve) => {
    let done = false
    let a: Taro.InnerAudioContext
    const finish = (m: string) => {
      if (done) return
      done = true
      try {
        dispose(a)
      } catch {
        /* 忽略 */
      }
      resolve(m)
    }
    try {
      a = Taro.createInnerAudioContext()
      a.volume = 0
      a.onCanplay(() => finish('ok'))
      a.onError((e: unknown) => finish('播放失败:' + msgOf(e)))
      a.src = EN_SOURCES[0].url(text)
      a.play()
    } catch (e) {
      finish('异常:' + msgOf(e))
      return
    }
    setTimeout(() => finish('超时:4 秒内没有取到音频(多半是域名校验或网络问题)'), 4000)
  })
}

export function disposeAudio(): void {
  stopAudio()
}
