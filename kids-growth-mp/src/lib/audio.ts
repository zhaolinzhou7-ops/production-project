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

/**
 * 百度语音公开接口。
 *
 * 参数是踩过坑的:
 * - 原来带 `aue=6`(输出 wav)。公开接口的 wav 码率低、底噪明显 —— 用户反馈的
 *   「有杂音、不清晰」多半来自这里。去掉后走默认 mp3,干净得多。
 * - `vol` 原来给到 9(最大),容易削顶失真,回到 5。
 * - `spd=4` 比正常语速稍慢半档,小朋友听得清。
 */
const baidu = (lan: 'zh' | 'en', per: number, id: string, label: string): AudioSource => ({
  id,
  label,
  maxLen: 300,
  url: (t) =>
    `https://tts.baidu.com/text2audio?lan=${lan}&text=${enc(t)}&spd=4&pit=5&vol=5&per=${per}&cuid=kidsgrowth&ctp=1&idx=1`,
})

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

export const ZH_VOICES: VoiceOption[] = [
  { id: 'baidu-zh-child', label: '童声 · 度丫丫', desc: '活泼的小朋友声音' },
  { id: 'baidu-zh-female', label: '女声 · 度小美', desc: '温和清晰,读古诗更耐听' },
  { id: 'baidu-zh-male', label: '男声 · 度小宇', desc: '沉稳' },
  { id: 'baidu-zh-yao', label: '磁性 · 度逍遥', desc: '语气舒缓' },
  // 有道走的是完全不同的合成引擎,音质路子和百度不一样 —— 百度那几个如果
  // 听起来差不多,这个多半能听出明显区别。
  { id: 'youdao-zh-le', label: '有道 · 中文', desc: '另一套引擎,和上面几个音质不同' },
]

export const EN_VOICES: VoiceOption[] = [
  { id: 'youdao-en-us', label: '美音 · 真人', desc: '有道真人录音,单词最自然' },
  { id: 'youdao-en-uk', label: '英音 · 真人', desc: '英式发音' },
  { id: 'baidu-en-child', label: '英语童声', desc: '合成音,句子更连贯' },
]

const VOICE_ZH_KEY = 'voiceZh'
const VOICE_EN_KEY = 'voiceEn'

export function getVoice(lang: 'zh' | 'en'): string {
  return readObject<string>(lang === 'zh' ? VOICE_ZH_KEY : VOICE_EN_KEY, '')
}

export function setVoice(lang: 'zh' | 'en', id: string): void {
  writeObject(lang === 'zh' ? VOICE_ZH_KEY : VOICE_EN_KEY, id)
}

export const ZH_SOURCES: AudioSource[] = [
  baidu('zh', 4, 'baidu-zh-child', '百度·童声(度丫丫)'),
  baidu('zh', 0, 'baidu-zh-female', '百度·女声(度小美)'),
  baidu('zh', 1, 'baidu-zh-male', '百度·男声(度小宇)'),
  baidu('zh', 3, 'baidu-zh-yao', '百度·度逍遥'),
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
/** 自检里确认「连不上/不返回音频」的音源,之后直接跳过,不再让用户干等 */
const DEAD_KEY = '_deadSources'

/**
 * 「不通」要按**文本长短**分开记。
 *
 * 这是一个真实踩过的坑:有道是词典发音,单字/词有音、整句没有。
 * 之前不分长短地把它标成「不通」,结果读一次古诗(失败)之后,
 * 连识字的单字也不再走这个音源 —— 中文就整个哑了。
 * 现在长句失败只拉黑「长句档」,短词照常用。
 */
export type LenBucket = 'short' | 'long'

export function bucketOf(text: string, lang: 'zh' | 'en'): LenBucket {
  if (lang === 'zh') return text.length <= 6 ? 'short' : 'long'
  // 英语:带空格的当成句子
  return /\s/.test(text.trim()) ? 'long' : 'short'
}

function deadKey(id: string, bucket: LenBucket): string {
  return `${id}|${bucket}`
}

function deadSet(): Record<string, boolean> {
  return readObject<Record<string, boolean>>(DEAD_KEY, {})
}

/**
 * 播放时连续失败的音源也记为「不通」。
 *
 * 不然每读一句都要把连不上的几家重试一遍:每家等 4.5 秒超时,还会在控制台
 * 刷一堆「Unable to decode audio data」。连着失败两次就不再试它。
 */
const failStreak = new Map<string, number>()
const FAIL_LIMIT = 2

function noteFail(id: string, bucket: LenBucket): void {
  const k = deadKey(id, bucket)
  const n = (failStreak.get(k) ?? 0) + 1
  failStreak.set(k, n)
  if (n < FAIL_LIMIT) return
  const dead = deadSet()
  if (dead[k]) return
  dead[k] = true
  writeObject(DEAD_KEY, dead)
}

function noteOk(id: string, bucket: LenBucket): void {
  const k = deadKey(id, bucket)
  failStreak.delete(k)
  const dead = deadSet()
  if (!dead[k]) return
  delete dead[k]
  writeObject(DEAD_KEY, dead)
}

export function markDead(id: string, bucket: LenBucket, isDead: boolean): void {
  const dead = deadSet()
  const k = deadKey(id, bucket)
  if (isDead) dead[k] = true
  else delete dead[k]
  writeObject(DEAD_KEY, dead)
}

function ordered(list: AudioSource[], prefKey: string, bucket: LenBucket): AudioSource[] {
  const dead = deadSet()
  const alive = list.filter((s) => !dead[deadKey(s.id, bucket)])
  let use = alive.length > 0 ? alive : list

  const front = (id: string) => {
    const hit = use.find((s) => s.id === id)
    if (hit) use = [hit, ...use.filter((s) => s !== hit)]
  }

  // 先按「上次真出过声的」排,再让家长选的音色盖在最前面 —— 选择优先于历史。
  front(readObject<string>(`${prefKey}|${bucket}`, ''))
  front(getVoice(prefKey === PREF_KEY_ZH ? 'zh' : 'en'))

  /*
   * 英语要按「单词 / 整句」分流,这是「有些句子系统不读」的根因:
   * 有道 dictvoice 是**词典**发音 —— 单词是真人录音、质量最好,
   * 但整句它经常直接没有音频。所以整句一律先走百度的合成引擎(任意句子都能读),
   * 单词才优先有道真人。
   */
  if (prefKey === PREF_KEY_EN && bucket === 'long') {
    front('youdao-en-us')
    front('baidu-en-plain')
    front('baidu-en-child')
  }
  return use
}

/**
 * 中文长句读不出来时的兜底:按标点切成短句,一句一句读。
 *
 * 顺序很重要:**先整段、再分句**,绝不主动逐字。
 * (曾经切到 2 字一段自动连播,实测是「一个字一个字往外蹦」,已否决。
 *  真机上百度童声整句是通的,所以正常路径根本走不到这里。)
 */
export function zhChunks(text: string): string[] {
  return text.split(/[，,。.！!？?、;；:：\s\n]+/).filter(Boolean)
}

/**
 * 轻微震动。
 * 点了发音按钮却要等半秒才出声时,孩子不知道自己点上没有 ——
 * 触觉反馈比视觉更快到达,这一下能消掉大半「没反应」的感觉。
 */
function buzz(): void {
  try {
    Taro.vibrateShort({ type: 'light' })
  } catch {
    /* 忽略:部分设备不支持 */
  }
}

// ---------------------------------------------------------------- 本地缓存

/**
 * 音频本地缓存:URL → 本机临时文件路径。
 *
 * 「点了要等一下才响」的根子是**每次都从网络现取**。这里把取回来的音频落到
 * 本机临时文件,同一句第二次播就是读本地文件 —— 基本是瞬间出声。
 * 配合预取(见 prefetchAudio),孩子第一次点某句时往往也已经缓存好了。
 *
 * 只在内存里记映射:微信的临时文件本来就是按需清理的,不必自己管配额。
 */
const fileCache = new Map<string, string>()
/** 正在下载中的 URL,避免同一句被重复下载 */
const downloading = new Set<string>()

function cachedFile(url: string): string | undefined {
  return fileCache.get(url)
}

/** 下载并缓存,完成后回调本地路径。失败就回调 undefined(上层退回直接播 URL)。 */
function fetchToCache(url: string, done?: (path?: string) => void): void {
  const hit = fileCache.get(url)
  if (hit) {
    done?.(hit)
    return
  }
  if (downloading.has(url)) {
    done?.(undefined)
    return
  }
  downloading.add(url)
  try {
    Taro.downloadFile({
      url,
      success: (res) => {
        downloading.delete(url)
        // statusCode 不是 200 的多半是返回了错误页,别当音频缓存
        if (res.statusCode === 200 && res.tempFilePath) {
          fileCache.set(url, res.tempFilePath)
          done?.(res.tempFilePath)
        } else {
          done?.(undefined)
        }
      },
      fail: () => {
        downloading.delete(url)
        done?.(undefined)
      },
    })
  } catch {
    downloading.delete(url)
    done?.(undefined)
  }
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

/**
 * 换上新的播放上下文,并把上一个销毁掉。
 *
 * ⚠️ 这是一个真实的泄漏:原先只在**播放失败**时 dispose,成功播完的上下文
 * 一个都没销毁。一节课下来会攒下几十个 InnerAudioContext ——
 * 微信对同时存在的音频实例有上限,超了之后新的播放会变慢、甚至播一半就断。
 * 「反应慢」和「有时候没读完」都有它的份。
 */
function setCurrent(a: Taro.InnerAudioContext | null): void {
  if (current && current !== a) dispose(current)
  current = a
}

/**
 * 逐个音源尝试播放,第一个真能出声的就留下。
 * 全部试完仍不出声时调用 onExhausted(中文用它转入「拆词逐段读」的兜底)。
 */
function playSequence(
  text: string,
  list: AudioSource[],
  prefKey: string,
  i: number,
  my: number,
  bucket: LenBucket,
  onExhausted?: () => void,
): void {
  if (my !== token) return
  if (i >= list.length) {
    onExhausted?.()
    return
  }
  const s = list[i]
  if (text.length > s.maxLen) {
    playSequence(text, list, prefKey, i + 1, my, bucket, onExhausted)
    return
  }

  const a = Taro.createInnerAudioContext()
  try {
    // 手机静音键打开时也要能听见(小朋友的机器常年静音)
    a.obeyMuteSwitch = false
  } catch {
    /* 老版本基础库没有这个属性 */
  }
  setCurrent(a)

  let moved = false
  let started = false
  const next = () => {
    if (moved) return
    moved = true
    noteFail(s.id, bucket)
    dispose(a)
    playSequence(text, list, prefKey, i + 1, my, bucket, onExhausted)
  }
  const succeeded = () => {
    if (started) return
    started = true
    noteOk(s.id, bucket)
    writeObject(`${prefKey}|${bucket}`, s.id)
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
      // 播完就把上下文交还系统,不然会一直占着
      if (current === a) current = null
      dispose(a)
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
    const url = s.url(text)
    // 有缓存就直接放本地文件(秒响);没有就放网络地址,同时后台缓存下来供下次用
    const local = cachedFile(url)
    a.src = local ?? url
    a.play()
    if (!local) fetchToCache(url)
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

/**
 * 慢速朗读(英语跟读用)。
 * InnerAudioContext 支持 playbackRate,0.75 倍速对小朋友刚好 —— 比听不清再重放有效得多。
 */
export function playEnglishSlow(text: string, rate = 0.75): void {
  const t = text.trim()
  if (!t) return
  token += 1
  const my = token
  const a = Taro.createInnerAudioContext()
  try {
    a.obeyMuteSwitch = false
  } catch {
    /* 忽略 */
  }
  try {
    a.playbackRate = rate
  } catch {
    /* 老基础库不支持变速,按原速播 */
  }
  if (my !== token) return
  setCurrent(a)
  try {
    a.onEnded(() => {
      if (current === a) current = null
      dispose(a)
    })
    a.onError(() => dispose(a))
    a.src = ordered(EN_SOURCES, PREF_KEY_EN, bucketOf(t, 'en'))[0].url(t)
    a.play()
  } catch {
    dispose(a)
  }
}

/**
 * 预取:提前把某段文字的音频下载下来(静音、不出声)。
 *
 * 「点了要等一下才响」的主要成分是**网络**:建连 + 下载。等孩子点下去再开始
 * 下载,那段等待就完整暴露给他。所以在当前这题显示出来时,就顺手把下一题的
 * 音频拉一遍 —— 微信会缓存同一个 URL 的响应,真正播的时候基本是秒响。
 *
 * 用完即弃,不占播放通道,也不动 token(不会打断正在播的声音)。
 */
export function prefetchAudio(text: string, lang: 'zh' | 'en'): void {
  const t = text.trim()
  if (!t) return
  const bucket = bucketOf(t, lang)
  const list =
    lang === 'zh' ? ordered(ZH_SOURCES, PREF_KEY_ZH, bucket) : ordered(EN_SOURCES, PREF_KEY_EN, bucket)
  const first = list[0]
  if (!first || t.length > first.maxLen) return
  // 直接下到本地文件缓存,不占播放通道、不出声
  fetchToCache(first.url(t))
}

/** 播放单词的真人发音(英语) */
export function playWordAudio(word: string, accent: Accent = 2): void {
  const t = word.trim()
  if (!t) return
  buzz()
  token += 1
  const bucket = bucketOf(t, 'en')
  const list = ordered(EN_SOURCES, PREF_KEY_EN, bucket)
  // 指定英音时把英音提到最前
  const arranged =
    accent === 1 ? [...list].sort((a, b) => (a.id === 'youdao-en-uk' ? -1 : b.id === 'youdao-en-uk' ? 1 : 0)) : list
  playSequence(t, arranged, PREF_KEY_EN, 0, token, bucket)
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
    setCurrent(a)
    try {
      a.onEnded(() => {
        if (current === a) current = null
        dispose(a)
      })
    } catch {
      /* 忽略 */
    }
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
  buzz()
  if (isSpeechAvailable()) {
    if (await playPluginText(t, lang)) return
  }
  token += 1
  if (lang === 'zh_CN') {
    const bucket = bucketOf(t, 'zh')
    let list = ordered(ZH_SOURCES, PREF_KEY_ZH, bucket)
    // 短词(识字的单字、词语)优先走有道词典 —— 词典查得到的词才有真人音,
    // 而有道是目前唯一确认可达的音源。长句子则按常规顺序试。
    if (t.length <= 4) {
      const yd = list.find((s) => s.id === 'youdao-zh-le')
      if (yd) list = [yd, ...list.filter((s) => s !== yd)]
    }
    const my = token
    playSequence(t, list, PREF_KEY_ZH, 0, my, bucket, () => {
      // 整句读不出来(有道是词典,查不到整句)→ 拆成词逐段读,总比没有声音好
      const chunks = zhChunks(t)
      if (chunks.length > 1) void playChunks(chunks, my)
    })
  } else {
    const b = bucketOf(t, 'en')
    playSequence(t, ordered(EN_SOURCES, PREF_KEY_EN, b), PREF_KEY_EN, 0, token, b)
  }
}

/** 播完一个 URL 再播下一个(播完/失败/超时都算这一段结束) */
function playOnce(url: string, my: number): Promise<void> {
  return new Promise((resolve) => {
    if (my !== token) {
      resolve()
      return
    }
    let done = false
    let a: Taro.InnerAudioContext
    const finish = () => {
      if (done) return
      done = true
      try {
        dispose(a)
      } catch {
        /* 忽略 */
      }
      resolve()
    }
    try {
      a = Taro.createInnerAudioContext()
    } catch {
      resolve()
      return
    }
    try {
      a.obeyMuteSwitch = false
    } catch {
      /* 忽略 */
    }
    current = a
    try {
      a.onEnded(finish)
      a.onError(finish)
    } catch {
      /* 忽略 */
    }
    try {
      a.src = url
      a.play()
    } catch {
      finish()
      return
    }
    setTimeout(finish, 5000)
  })
}

/** 逐段朗读(中文长句兜底):一段读完再读下一段,中间留一点点停顿 */
async function playChunks(chunks: string[], my: number): Promise<void> {
  const url = (t: string) => `https://dict.youdao.com/dictvoice?audio=${enc(t)}&le=zh`
  for (const c of chunks) {
    if (my !== token) return
    await playOnce(url(c), my)
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
  const jobs: Array<{ label: string; url: string; id?: string; bucket?: LenBucket }> = [
    ...EN_SOURCES.map((s) => ({ label: s.label, url: s.url('apple'), id: s.id, bucket: 'short' as LenBucket })),
    {
      label: '有道·英语整句',
      url: `https://dict.youdao.com/dictvoice?audio=${enc('This is a red apple.')}&type=2`,
      id: 'youdao-en-us',
      bucket: 'long' as LenBucket,
    },
    { label: '有道·中文 单字「好」', url: youdaoZh('好'), id: 'youdao-zh-le', bucket: 'short' as LenBucket },
    { label: '有道·中文 词「你好」', url: youdaoZh('你好') },
    { label: '有道·中文 四字「春眠不觉」', url: youdaoZh('春眠不觉') },
    {
      label: '有道·中文 整句「白日依山尽」',
      url: youdaoZh('白日依山尽'),
      id: 'youdao-zh-le',
      bucket: 'long' as LenBucket,
    },
    ...ZH_SOURCES.filter((s) => s.id !== 'youdao-zh-le').map((s) => ({
      label: s.label,
      url: s.url('白日依山尽'),
      id: s.id,
      bucket: 'long' as LenBucket,
    })),
  ]
  const out: DiagLine[] = []
  // 自检会重建整张「不通」表:每次自检都是一次重新认识,不带旧包袱
  const dead: Record<string, boolean> = {}
  for (let i = 0; i < jobs.length; i++) {
    let ok = false
    try {
      ok = await probeUrl(jobs[i].url)
    } catch {
      ok = false
    }
    const job = jobs[i]
    out.push({ label: job.label, ok })
    // 只记「这个音源在这个长度档上不通」—— 长句不通不代表单字也不通
    if (job.id && job.bucket && !ok) dead[`${job.id}|${job.bucket}`] = true
    try {
      onProgress?.(i + 1, jobs.length)
    } catch {
      /* 忽略:进度提示失败不影响自检 */
    }
  }
  writeObject(DEAD_KEY, dead)
  return out
}

/** 忘掉所有「不通」的记忆(换了网络环境时用) */
export function resetAudioMemory(): void {
  writeObject(DEAD_KEY, {})
  failStreak.clear()
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
