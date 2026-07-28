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
// 音源表与音色清单都是纯数据,放在 core/ 才能被自测覆盖
// (见 core/audioSources.ts、core/voices.ts 的说明)
export { ZH_SOURCES, EN_SOURCES, type AudioSource } from '../core/audioSources'
export { ZH_VOICES, EN_VOICES, type VoiceOption } from '../core/voices'
import { ZH_SOURCES, EN_SOURCES, enc } from '../core/audioSources'
import type { AudioSource } from '../core/audioSources'

/** 家长选定的音色存在本地 —— 这部分要读写存储,所以留在 lib/ */
const VOICE_ZH_KEY = 'voiceZh'
const VOICE_EN_KEY = 'voiceEn'

export function getVoice(lang: 'zh' | 'en'): string {
  return readObject<string>(lang === 'zh' ? VOICE_ZH_KEY : VOICE_EN_KEY, '')
}

export function setVoice(lang: 'zh' | 'en', id: string): void {
  writeObject(lang === 'zh' ? VOICE_ZH_KEY : VOICE_EN_KEY, id)
}


/**
 * 最近一次真正出声的音源标签。
 *
 * ⚠️ 每次开播都要先清空。
 * 原先只写不清:上一次播放留下的旧值会一直挂着,新的一次还没出声时
 * 读到的是**上一次**的结果 —— 家长换了音色、看到的却还是老名字,
 * 于是得出「换了没用」的错误结论。这个诊断本身把人带偏了。
 */
let lastPlayedLabel = ''
export function getLastPlayedLabel(): string {
  return lastPlayedLabel
}
function clearLastPlayed(): void {
  lastPlayedLabel = ''
  lastFailedSentence = ''
}

/**
 * 最近一句「所有音源都读不出来」的英文。
 * 界面据此显示「整句读不出来,要逐词听吗?」—— 逐词由用户点,不自动播。
 */
let lastFailedSentence = ''
export function getFailedSentence(): string {
  return lastFailedSentence
}

/** 用户主动选择逐词听时才调这个 */
export function playWordByWord(text: string): void {
  const words = text.split(/[\s,.!?;:"']+/).filter((w) => /[A-Za-z]/.test(w))
  if (words.length === 0) return
  token += 1
  void playChunks(words, token, 'en')
}

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

/**
 * 「不通」的音源标记 —— 存的是**打标时间**,不是 true。
 *
 * 这是一个严重的设计错误,用户实际踩到了:原先标记一旦写下就**永不过期**。
 * 一次网络抖动(切 wifi、地铁里、家里路由重启)会让几家连着失败两次,
 * 于是被永久拉黑;等网络恢复了,程序也再不会去试它们。
 * 最后只剩一两家还「活着」,不管家长选哪个音色都用不上 ——
 * 用户看到的就是「选哪个都是同一个声音,而且都是百度翻译」。
 *
 * 现在标记 30 分钟后自动失效,重新给每家一次机会。
 * 代价只是偶尔多等一次超时,比永久哑掉划算得多。
 */
const DEAD_TTL = 30 * 60 * 1000

function deadSet(): Record<string, number> {
  const raw = readObject<Record<string, number | boolean>>(DEAD_KEY, {})
  const now = Date.now()
  const out: Record<string, number> = {}
  for (const k of Object.keys(raw)) {
    const v = raw[k]
    // 老版本存的是 true,没有时间信息 —— 一律当成已过期,给它们一次重生机会
    if (typeof v !== 'number') continue
    if (now - v < DEAD_TTL) out[k] = v
  }
  return out
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
  dead[k] = Date.now()
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
  if (isDead) dead[k] = Date.now()
  else delete dead[k]
  writeObject(DEAD_KEY, dead)
}

/**
 * 启动时把「不通」标记全清掉。
 *
 * 上一次用的时候网络什么样,和这一次没有关系 —— 可能上次在地铁里,
 * 这次在家连着 wifi。每次冷启动重新给所有音源一次机会。
 */
export function resetDeadOnLaunch(): void {
  writeObject(DEAD_KEY, {})
}

function ordered(list: AudioSource[], prefKey: string, bucket: LenBucket): AudioSource[] {
  const dead = deadSet()
  const chosen = getVoice(prefKey === PREF_KEY_ZH ? 'zh' : 'en')
  /*
   * 家长明确选过的音色**永远不被「不通」过滤掉**。
   *
   * 原先只要它被标记过一次,就直接从候选里消失,选择静默失效 ——
   * 用户的感受是「选了没反应」,比默认排序糟糕得多。
   * 现在始终把它留在名单里、排在最前:真连不上就往下走,
   * 但至少每次都试一下。
   */
  const alive = list.filter((s) => s.id === chosen || !dead[deadKey(s.id, bucket)])
  let use = alive.length > 0 ? alive : list

  const front = (id: string) => {
    const hit = use.find((s) => s.id === id)
    if (hit) use = [hit, ...use.filter((s) => s !== hit)]
  }

  // 先按「上次真出过声的」排,再让家长选的音色盖在最前面 —— 选择优先于历史。
  front(readObject<string>(`${prefKey}|${bucket}`, ''))
  front(chosen)

  /*
   * 英语要按「单词 / 整句」分流,这是「有些句子系统不读」的根因:
   * 有道 dictvoice 是**词典**发音 —— 单词是真人录音、质量最好,
   * 但整句它经常直接没有音频。所以整句一律先走百度的合成引擎(任意句子都能读),
   * 单词才优先有道真人。
   */
  // 同样只在**家长没挑过音色**时才强行改序 —— 挑了就得听他的,
  // 否则「选了没反应」比默认排序差得多(中文那个 bug 就是这么来的)。
  if (prefKey === PREF_KEY_EN && bucket === 'long' && !chosen) {
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
    lastPlayedLabel = s.label
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
  clearLastPlayed()
  buzz()
  token += 1
  const bucket = bucketOf(t, 'en')
  const list = ordered(EN_SOURCES, PREF_KEY_EN, bucket)
  // 指定英音时把英音提到最前
  const arranged =
    accent === 1 ? [...list].sort((a, b) => (a.id === 'youdao-en-uk' ? -1 : b.id === 'youdao-en-uk' ? 1 : 0)) : list
  const my = token
  playSequence(t, arranged, PREF_KEY_EN, 0, my, bucket, () => {
    // 同上:不自动逐词播,只记下来给界面用
    lastFailedSentence = t
  })
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
  clearLastPlayed()
  buzz()
  if (isSpeechAvailable()) {
    if (await playPluginText(t, lang)) return
  }
  token += 1
  if (lang === 'zh_CN') {
    const bucket = bucketOf(t, 'zh')
    let list = ordered(ZH_SOURCES, PREF_KEY_ZH, bucket)
    /*
     * 短词(识字的单字、词语)优先走有道词典 —— 词典查得到的词才有真人音。
     *
     * ⚠️ 但这条**只在家长没挑过音色时**才生效。
     * 原先是无条件顶到最前,后果很严重:家长中心的试听放的是「小朋友你好」
     * 这种短句,识字也是单字,全都 ≤4 字 —— 于是不管选哪个音色,
     * 播出来的永远是有道那一个声音,选择完全失效。
     * 用户反馈的「中文选哪个都是一个声音」就是这么来的。
     */
    if (t.length <= 4 && !getVoice('zh')) {
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
    const my = token
    playSequence(t, ordered(EN_SOURCES, PREF_KEY_EN, b), PREF_KEY_EN, 0, my, b, () => {
      /*
       * 整句一个音源都不出声。
       *
       * ⚠️ 这里**不能**自动改成逐词播 —— 用户明确否决过「一个一个字往外蹦」,
       * 说那比没声音更难受。上一版我加了自动逐词,结果就是他反馈的
       * 「英语怎么又开始一个一个字地蹦」。
       * 现在只记一笔状态,由界面决定要不要给一个「逐词听」的按钮,
       * 让用户自己选,而不是替他决定。
       */
      lastFailedSentence = t
    })
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
async function playChunks(chunks: string[], my: number, lang: 'zh' | 'en' = 'zh'): Promise<void> {
  // 英语逐词走有道美音(单词几乎必有真人录音);中文走有道中文通道
  const url = (t: string) =>
    lang === 'en'
      ? `https://dict.youdao.com/dictvoice?audio=${enc(t)}&type=2`
      : `https://dict.youdao.com/dictvoice?audio=${enc(t)}&le=zh`
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

/**
 * 检测「百度那几个音色是不是真的不同」。
 *
 * 用户反馈「选哪个中文音色听起来都一样」,而自检显示四个音色**全部连得上**。
 * 光靠耳朵没法下结论 —— 但可以下载同一句话的不同音色,比字节数:
 * 完全一样几乎必然是同一个音频,说明公开接口已经不认 `per` 参数了。
 * 这是个客观判据,把「是我耳朵的问题还是接口的问题」一次问清。
 */
async function probeSize(url: string): Promise<number> {
  return new Promise((resolve) => {
    let done = false
    const finish = (n: number) => {
      if (done) return
      done = true
      resolve(n)
    }
    try {
      Taro.downloadFile({
        url,
        success: (res) => {
          if (res.statusCode !== 200 || !res.tempFilePath) {
            finish(-1)
            return
          }
          try {
            Taro.getFileInfo({
              filePath: res.tempFilePath,
              success: (f) => finish(f.size),
              fail: () => finish(-1),
            })
          } catch {
            finish(-1)
          }
        },
        fail: () => finish(-1),
      })
    } catch {
      finish(-1)
    }
    setTimeout(() => finish(-1), 8000)
  })
}

export interface DiagLine {
  label: string
  ok: boolean
  /** 失败原因(能拿到就填)—— 只报「❌」等于什么都没说 */
  reason?: string
}

/**
 * 用 downloadFile 探一次,拿到**具体失败原因**。
 *
 * 为什么必须这么做:原先自检只播一下、报个 ✅/❌。全是 ❌ 的时候
 * 用户和我都不知道到底是「域名没加白名单」「接口返回 403」还是
 * 「返回的是网页不是音频」—— 这三种的解法完全不同,却长得一模一样。
 * downloadFile 的 errMsg 和 statusCode 能把它们分开。
 */
function probeReason(url: string): Promise<{ ok: boolean; reason: string }> {
  return new Promise((resolve) => {
    let done = false
    const finish = (ok: boolean, reason: string) => {
      if (done) return
      done = true
      resolve({ ok, reason })
    }
    try {
      Taro.downloadFile({
        url,
        success: (res) => {
          const code = res.statusCode
          if (code === 200) {
            finish(true, '')
            return
          }
          finish(false, `服务器返回 ${code}`)
        },
        fail: (e) => {
          const msg = String((e && (e as { errMsg?: string }).errMsg) || e)
          // 这句是微信在域名没配白名单时给的原话,单独挑出来说人话
          if (/not in domain list|域名/.test(msg)) {
            finish(false, '域名没加白名单(要在小程序后台配置)')
            return
          }
          if (/timeout|超时/.test(msg)) {
            finish(false, '连接超时(网络慢或对方拒绝)')
            return
          }
          finish(false, msg.replace('downloadFile:fail ', '').slice(0, 60))
        },
      })
    } catch (e) {
      finish(false, msgOf(e).slice(0, 60))
    }
    setTimeout(() => finish(false, '超过 8 秒没有响应'), 8000)
  })
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
  /*
   * 自检会重建整张「不通」表:每次自检都是一次重新认识,不带旧包袱。
   *
   * ⚠️ 值必须是**时间戳**。v30 把 deadSet() 改成了「只认 number、
   * 其余当成已过期」,而这里当时还在写 true —— 于是自检的结论
   * 每次都被静默丢弃,等于白测。
   */
  const dead: Record<string, number> = {}
  for (let i = 0; i < jobs.length; i++) {
    let ok = false
    let reason = ''
    try {
      // 先用 downloadFile 探原因;能下下来再用播放器确认「真的是音频」
      const probe = await probeReason(jobs[i].url)
      reason = probe.reason
      ok = probe.ok ? await probeUrl(jobs[i].url) : false
      if (probe.ok && !ok) reason = '下下来了但播不出(多半返回的是网页不是音频)'
    } catch (e) {
      ok = false
      reason = msgOf(e).slice(0, 60)
    }
    const job = jobs[i]
    out.push({ label: job.label, ok, reason: ok ? undefined : reason })
    // 只记「这个音源在这个长度档上不通」—— 长句不通不代表单字也不通
    if (job.id && job.bucket && !ok) dead[`${job.id}|${job.bucket}`] = Date.now()
    try {
      onProgress?.(i + 1, jobs.length)
    } catch {
      /* 忽略:进度提示失败不影响自检 */
    }
  }
  // 最后加一条:百度那几个音色到底是不是同一个声音
  try {
    const sample = '小朋友你好呀'
    const a = await probeSize(
      `https://tts.baidu.com/text2audio?lan=zh&text=${enc(sample)}&spd=4&pit=5&vol=5&per=4&cuid=kidsgrowth&ctp=1&idx=1`,
    )
    const b = await probeSize(
      `https://tts.baidu.com/text2audio?lan=zh&text=${enc(sample)}&spd=4&pit=5&vol=5&per=1&cuid=kidsgrowth&ctp=1&idx=1`,
    )
    if (a > 0 && b > 0) {
      const same = a === b
      out.push({
        label: '百度音色是否真的不同',
        ok: !same,
        reason: same
          ? `童声和男声下载到的是同样大小的文件(${a} 字节)—— 这个免费接口已经不认音色参数了,换哪个都一样。想换声音请选「搜狗·中文」或「有道·中文」`
          : undefined,
      })
    }
  } catch {
    /* 这一项测不了就不报,不影响主自检 */
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
