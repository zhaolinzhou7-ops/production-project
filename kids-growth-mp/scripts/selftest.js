/* eslint-disable */
/**
 * 逻辑层自测。
 *
 * 小程序页面必须在微信开发者工具里才能跑,但**业务逻辑**(存储、积分、SRS、
 * 习惯、奖励、周报、内容包)全是纯 TypeScript,可以在 Node 里直接验证。
 * 这里把 core/ 与 store/ 编译出来,喂一个假的 wx 存储,跑一遍真实场景。
 *
 * 有了它,像「取消打卡把分扣成负数」「内容包更新后进度丢失」这类问题
 * 在推给孩子之前就能发现,而不是等用户点出来。
 *
 * 用法:npm run selftest
 */
const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const Module = require('module')

const ROOT = path.join(__dirname, '..')
const OUT = path.join(ROOT, '.selftest')

// ---------------------------------------------------------------- 编译

function build() {
  fs.rmSync(OUT, { recursive: true, force: true })
  const files = []
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f)
      if (fs.statSync(p).isDirectory()) walk(p)
      else if (p.endsWith('.ts') && !p.endsWith('.d.ts')) files.push(p)
    }
  }
  walk(path.join(ROOT, 'src', 'core'))
  walk(path.join(ROOT, 'src', 'store'))
  files.push(path.join(ROOT, 'src', 'types.ts'))
  // lib/ 里大多要用小程序专有 API,不整目录编;errlog 只用存储 API,可以测
  files.push(path.join(ROOT, 'src', 'lib', 'errlog.ts'))
  files.push(path.join(ROOT, 'src', 'lib', 'version.ts'))

  // 直接用 node 跑 tsc 的入口,不经过 shell —— 经 shell 传参在 Node 22 上会打
  // 「security vulnerabilities」弃用警告,在 Windows 控制台里看着像出了错。
  const tsc = path.join(ROOT, 'node_modules', 'typescript', 'lib', 'tsc.js')
  const r = spawnSync(
    process.execPath,
    [
      tsc,
      ...files,
      '--outDir', OUT,
      '--module', 'commonjs',
      '--target', 'es2020',
      '--moduleResolution', 'node',
      '--esModuleInterop',
      '--resolveJsonModule',
      '--skipLibCheck',
      '--types', 'node',
    ],
    { cwd: ROOT, encoding: 'utf8' },
  )
  if (r.status !== 0) {
    console.error(r.stdout || '')
    console.error(r.stderr || '')
    throw new Error('自测编译失败')
  }
  // tsc 不搬 JSON,内容包是 require 进来的,得自己复制过去
  fs.cpSync(path.join(ROOT, 'src', 'data'), path.join(OUT, 'data'), { recursive: true })
}

// ---------------------------------------------------------------- 假的 wx 存储

const storage = new Map()
const fakeTaro = {
  getStorageSync: (k) => (storage.has(k) ? storage.get(k) : ''),
  setStorageSync: (k, v) => {
    // 微信会做一次序列化,这里照做 —— 能顺带查出「存了不可序列化的东西」
    storage.set(k, JSON.parse(JSON.stringify(v)))
  },
  clearStorageSync: () => storage.clear(),
  // errlog 用它记「出错时在哪个页面」
  getCurrentPages: () => [{ route: 'pages/index/index' }],
}

const origResolve = Module._resolveFilename
Module._resolveFilename = function (request, ...rest) {
  if (request === '@tarojs/taro') return '@tarojs/taro'
  return origResolve.call(this, request, ...rest)
}
require.cache['@tarojs/taro'] = {
  id: '@tarojs/taro',
  filename: '@tarojs/taro',
  loaded: true,
  exports: { default: fakeTaro, ...fakeTaro },
}

// ---------------------------------------------------------------- 断言

let pass = 0
const fails = []
function ok(cond, label) {
  if (cond) {
    pass++
  } else {
    fails.push(label)
  }
}
function eq(a, b, label) {
  ok(JSON.stringify(a) === JSON.stringify(b), `${label} — 期望 ${JSON.stringify(b)},实际 ${JSON.stringify(a)}`)
}

// ---------------------------------------------------------------- 场景

function run() {
  const L = (p) => require(path.join(OUT, p))
  const content = L('core/learningContent.js')
  const study = L('store/study.js')
  const fun = L('store/fun.js')
  const habits = L('store/habits.js')
  const rewards = L('store/rewards.js')
  const progress = L('store/progress.js')
  const weekly = L('store/weekly.js')
  const srs = L('core/srs.js')
  const levels = L('core/levels.js')
  const talk = L('core/talkContent.js')
  const db = L('store/db.js')

  // 存储层现在有内存缓存,清空存储时必须连缓存一起清,否则旧值会被「复活」
  const reset = () => {
    storage.clear()
    db.__resetCache()
  }

  // ---- 存储层:缓存读写一致 + 合并落盘 ----
  reset()
  db.writeTable('t', [1, 2, 3])
  eq(db.readTable('t'), [1, 2, 3], '写完立刻读应拿到新值(走缓存)')
  ok(storage.get('t') === undefined, '写入应先只进缓存,不立刻落盘')
  db.flushNow()
  eq(storage.get('t'), [1, 2, 3], 'flush 之后应真正落盘')
  db.writeObject('o', { a: 1 })
  eq(db.readObject('o', null), { a: 1 }, '对象写完立刻读应一致')
  db.flushNow()
  eq(storage.get('o'), { a: 1 }, '对象 flush 后应落盘')
  db.clearAll()
  eq(db.readTable('t'), [], 'clearAll 之后缓存和存储都应为空')

  // ---- 内容包完整性:每个包都能载入,且卡片形状与 itemType 对得上 ----
  for (const meta of content.BUILTIN_PACKS) {
    let pack
    try {
      pack = meta.load()
    } catch (e) {
      fails.push(`内容包 ${meta.key} 载入失败:${e.message}`)
      continue
    }
    ok(Array.isArray(pack.cards) && pack.cards.length > 0, `内容包 ${meta.key} 应有卡片`)
    ok(pack.itemType === meta.itemType, `内容包 ${meta.key} 的 itemType 应与注册表一致`)
    const c = pack.cards[0]
    if (meta.itemType === 'pic') ok(c.front && c.en && c.emoji, `${meta.key} pic 卡应有 front/en/emoji`)
    if (meta.itemType === 'fact') ok(c.q && c.a, `${meta.key} fact 卡应有 q/a`)
    if (meta.itemType === 'word') ok(c.w && c.tr, `${meta.key} word 卡应有 w/tr`)
    if (meta.itemType === 'hanzi') ok(c.c && c.py, `${meta.key} hanzi 卡应有 c/py`)
    if (meta.itemType === 'poem') ok(c.title && Array.isArray(c.lines), `${meta.key} poem 卡应有 title/lines`)
  }
  // 每个学段都得有默认包,否则首页会是空的
  for (const st of ['toddler', 'primary', 'junior']) {
    ok(content.defaultPacksForStage(st).length > 0, `学段 ${st} 应有默认内容包`)
  }
  // key 不能重复(重复会导致卡组张冠李戴)
  const keys = content.BUILTIN_PACKS.map((p) => p.key)
  eq(keys.length, new Set(keys).size, '内容包 key 不能重复')

  // ---- 口语内容 ----
  ok(talk.DIALOGS.length > 0, '应有情景对话')
  ok(talk.CARTOONS.length > 0, '应有动画短片')
  ok(talk.RHYMES.length > 0, '应有英文儿歌')
  for (const d of talk.DIALOGS) {
    ok(d.turns.length > 0 && d.turns.every((t) => t.bot && t.expect), `对话 ${d.key} 每轮都要有 bot/expect`)
  }
  for (const st of ['toddler', 'primary', 'junior']) {
    ok(talk.dialogsFor(st).length > 0, `学段 ${st} 应有对话`)
    ok(talk.cartoonsFor(st).length > 0, `学段 ${st} 应有动画`)
    ok(talk.retellSentencesFor(st).length > 0, `学段 ${st} 应有复述句`)
  }

  // ---- 卡组实例化 + 内容更新不丢进度 ----
  reset()
  const childId = study.getCurrentChildId()
  const deckId = study.ensureBuiltinDeck(childId, 'hanzi-toddler')
  const cards0 = study.getDeckCards(deckId)
  ok(cards0.length > 0, '装包后应有卡片')
  eq(study.ensureBuiltinDeck(childId, 'hanzi-toddler'), deckId, '重复装同一个包应幂等')

  // 练一张卡,再触发内容同步,进度必须还在
  const due = study.getSessionCards(childId, deckId, 1)
  ok(due.length === 1, '应能取到待学卡片')
  study.applyGrade(due[0].state.id, 'good')
  const beforeIds = study.getDeckCards(deckId).map((c) => c.id)
  study.syncDeckContent(childId, 'hanzi-toddler')
  const afterIds = study.getDeckCards(deckId).map((c) => c.id)
  eq(afterIds, beforeIds, '内容同步后卡片 id 必须保持不变(否则复习进度会丢)')

  // ---- 坏数据体检:装好的数据不能被误伤,脏数据必须被清掉 ----
  // 先确认「干净数据跑一遍体检不掉东西」—— 体检误删比不体检更糟。
  const cleanDecks = db.readTable('decks').length
  const cleanCards = db.readTable('cards').length
  const cleanStates = db.readTable('states').length
  study.sanitizeData(childId)
  eq(db.readTable('decks').length, cleanDecks, '体检不该动正常卡组')
  eq(db.readTable('cards').length, cleanCards, '体检不该动正常卡片')
  eq(db.readTable('states').length, cleanStates, '体检不该动正常复习状态')

  // 再塞进四类脏数据,每一类都得被摘干净
  const cards = db.readTable('cards')
  const states = db.readTable('states')
  db.writeTable('decks', [...db.readTable('decks'), { id: 'bad-deck', itemType: 'nope' }])
  db.writeTable('cards', [
    ...cards,
    { id: 'orphan', deckId: 'deck-gone', front: '孤', back: '儿' }, // 卡组已不存在
    { id: 'noface', deckId, back: '没有正面' }, // front 缺失
    { ...cards[0] }, // id 重复
  ])
  db.writeTable('states', [
    ...states,
    { id: 'st-orphan', deckId, cardId: 'card-gone', status: 'new', due: '2020-01-01' },
  ])
  study.sanitizeData(childId)
  const ids = db.readTable('cards').map((c) => c.id)
  ok(!ids.includes('orphan'), '体检应清掉孤儿卡片')
  ok(!ids.includes('noface'), '体检应清掉 front 缺失的卡片')
  eq(ids.length, new Set(ids).size, '体检后卡片 id 不能有重复')
  ok(
    !db.readTable('decks').some((d) => d.id === 'bad-deck'),
    '体检应清掉 itemType 非法的卡组',
  )
  ok(
    !db.readTable('states').some((s) => s.id === 'st-orphan'),
    '体检应清掉指向已删卡片的复习状态',
  )
  eq(db.readTable('cards').length, cleanCards, '体检后正常卡片应一张不少')

  // ---- 多音字表 ----
  const poly = L('core/polyphone.js')
  for (const [ch, list] of Object.entries(poly.POLYPHONES)) {
    // 表是手写的,最容易混进来的就是空条目和非汉字的键
    ok(ch.length === 1 && /[一-龥]/.test(ch), `多音字表的键必须是单个汉字,发现「${ch}」`)
    ok(Array.isArray(list) && list.length >= 2, `多音字「${ch}」至少要有两个读音`)
    ok(
      list.every((r) => r && r.py && r.word),
      `多音字「${ch}」每个读音都要有拼音和组词`,
    )
    eq(list.map((r) => r.py).length, new Set(list.map((r) => r.py)).size, `多音字「${ch}」读音不能重复`)
  }
  ok(poly.polyphoneOf('行').length === 2, '「行」应查到两个读音')
  eq(poly.polyphoneOf('我'), [], '非多音字应返回空数组')
  ok(poly.isPolyphone('长') === true, '「长」应判为多音字')
  ok(poly.isPolyphone('我') === false, '「我」不该判为多音字')





  // ---- 习惯 ↔ 积分:这条链子断过,必须验 ----
  reset()
  study.getCurrentChildId()
  habits.ensureHabits()
  const hlist = habits.listHabits()
  ok(hlist.length > 0, '应装上默认习惯')
  // 每条都要有分类和分值 —— 页面上要显示,缺了就是空白
  for (const h of hlist) {
    ok(typeof h.points === 'number' && h.points > 0, `习惯「${h.name}」应有正的分值`)
    ok(['生活', '学习', '运动', '品德', '家务'].indexOf(h.category) >= 0, `习惯「${h.name}」应有合法分类`)
  }
  eq(habits.todayHabitPoints(), 0, '还没打卡时今日习惯分应为 0')
  const h1 = hlist[0]
  const xp0 = study.getPoints().xp
  habits.toggleHabit(h1.id)
  eq(habits.todayHabitPoints(), h1.points, '打卡后今日习惯分应等于该条分值')
  eq(study.getPoints().xp, xp0 + h1.points, '打卡应真的加到成长值上')
  habits.toggleHabit(h1.id)
  eq(habits.todayHabitPoints(), 0, '取消打卡后今日习惯分应归零')
  eq(study.getPoints().xp, xp0, '取消打卡应把分退回去(否则反复勾就能刷分)')

  // 分类统计
  const byCat = habits.todayByCategory()
  ok(byCat.length > 0, '应能按分类统计')
  eq(
    byCat.reduce((n, c) => n + c.total, 0),
    hlist.length,
    '各分类的总数加起来应等于习惯总数',
  )
  habits.toggleHabit(h1.id)
  const catOf = byCat.find((c) => c.category === h1.category)
  ok(catOf, '打卡的那条应能在分类统计里找到')
  ok(
    habits.todayByCategory().find((c) => c.category === h1.category).done >= 1,
    '打卡后对应分类的完成数应 +1',
  )

  // 周任务:小学及以上应该有
  const hab = L('core/habits.js')
  for (const st of ['primary', 'junior', 'senior']) {
    ok(
      hab.HABIT_TEMPLATES[st].some((t) => t.weekly),
      `学段 ${st} 应有周任务(整理错题、周复盘这类)`,
    )
  }
  for (const st of ['toddler', 'primary', 'junior', 'senior']) {
    for (const t of hab.HABIT_TEMPLATES[st]) {
      ok(t.category && hab.CATEGORY_COLOR[t.category], `模板 ${t.key} 的分类应有配色`)
      ok(t.points > 0, `模板 ${t.key} 分值应为正`)
      ok(['morning', 'noon', 'evening'].indexOf(t.period) >= 0, `模板 ${t.key} 时段应合法`)
    }
    const ks = hab.HABIT_TEMPLATES[st].map((t) => t.key)
    eq(ks.length, new Set(ks).size, `学段 ${st} 的习惯 key 不能重复`)
  }

  // ---- 自由对话引擎 ----
  const chat = L('core/chatEngine.js')

  // 话题识别:整词匹配,长关键词优先
  let cs = chat.newChatState()
  ok(chat.detectTopic('I like my dog', cs).key === 'pet', '「dog」应识别成宠物话题')
  ok(chat.detectTopic('my mom is nice', cs).key === 'family', '「mom」应识别成家人话题')
  ok(chat.detectTopic('I am fine', cs).key === 'feeling-good', '「I am fine」应识别成心情好')
  ok(chat.detectTopic('I am sad', cs).key === 'feeling-bad', '「I am sad」应识别成心情不好')
  ok(chat.detectTopic('blah blah zzz', cs) === null, '完全不沾边的应识别不出话题')
  ok(chat.detectTopic('', cs) === null, '空输入应识别不出话题')
  // 这条最关键:子串匹配会让 "know" 里的 "no" 命中否定话题
  const kt = chat.detectTopic('I know my teacher', cs)
  ok(kt && kt.key === 'school', `「I know my teacher」应识别成学校而不是否定,实际 ${kt && kt.key}`)
  // 长关键词优先:「i do not like」要胜过里面孤立的「no」
  const dl = chat.detectTopic('I do not like it', cs)
  ok(dl && dl.key === 'dislike', `「I do not like」应识别成不喜欢,实际 ${dl && dl.key}`)

  // 回应:必须「接住 + 抛回」,而且不能重复
  cs = chat.newChatState()
  const r1 = chat.respond('I like my dog', cs)
  ok(r1.reply.en.length > 0 && r1.reply.zh.length > 0, '回应应有中英文')
  ok(!r1.reply.fallback, '听懂时不该走兜底')
  ok(r1.reply.en.indexOf('?') > 0, '回应里必须带一个追问,否则会冷场')
  eq(r1.next.turns, 1, '轮次应累加')

  const r2 = chat.respond('I like my dog', r1.next)
  ok(r2.reply.en !== r1.reply.en, '同一话题连说两次,回应必须换一句(重复最容易露馅)')

  // 听不懂时:不装懂,且兜底话也要换着说
  const f1 = chat.respond('zzz qqq xxx', chat.newChatState())
  ok(f1.reply.fallback, '听不懂时应标记成兜底')
  const f2 = chat.respond('zzz qqq xxx', f1.next)
  ok(f2.reply.en !== f1.reply.en, '兜底话也要换着说')

  // 内容质量:每个话题的三组文案数量要对得上,中英不能错位
  for (const topic of chat.TOPICS) {
    ok(topic.replies.length >= 2, `话题 ${topic.key} 至少要两条回应`)
    eq(topic.replies.length, topic.repliesZh.length, `话题 ${topic.key} 中英回应数量应一致`)
    eq(topic.asks.length, topic.asksZh.length, `话题 ${topic.key} 中英追问数量应一致`)
    ok(topic.keys.length > 0, `话题 ${topic.key} 要有关键词`)
    for (const key of topic.keys) {
      ok(key === key.toLowerCase(), `话题 ${topic.key} 的关键词必须是小写:${key}`)
    }
    for (const en of [...topic.replies, ...topic.asks]) {
      ok(!/[一-龥]/.test(en), `话题 ${topic.key} 的英文里不该有中文:${en}`)
    }
    for (const zh of [...topic.repliesZh, ...topic.asksZh]) {
      ok(/[一-龥]/.test(zh), `话题 ${topic.key} 的中文字段应是中文:${zh}`)
    }
    ok(topic.asks.every((a) => a.indexOf('?') > 0 || a.indexOf('!') > 0), `话题 ${topic.key} 的追问应是问句或邀请`)
  }
  ok(chat.OPENERS.length >= 3, '开场白要有好几条,不能每次都一样')
  for (const o of chat.OPENERS) {
    ok(o.en && o.zh && !/[一-龥]/.test(o.en), '开场白中英要分开且英文里没有中文')
  }

  // 提示句:每个档、每个话题都要给得出,而且是英文
  for (const lv of ['easy', 'medium', 'hard']) {
    for (const topic of ['', 'pet', 'food', 'school', '不存在的话题']) {
      const tips = chat.suggestions(lv, topic)
      ok(Array.isArray(tips) && tips.length >= 2, `${lv}/${topic} 应给出提示句`)
      ok(tips.every((t) => !/[一-龥]/.test(t)), `${lv}/${topic} 的提示句应是英文`)
    }
  }
  // 入门档的提示句要比进阶档短 —— 否则「分档」没有意义
  const avgTip = (lv) => {
    const t = chat.suggestions(lv, '')
    return t.join(' ').split(' ').length / t.length
  }
  ok(avgTip('easy') < avgTip('hard'), '入门档的提示句应比挑战档短')

  // ---- 报错记录本:必须分得清「刚出的」和「上个版本的」 ----
  reset()
  const errlog = L('lib/errlog.js')
  const ver = L('lib/version.js').BUILD_TAG

  ok(errlog.currentError() === null, '没出过错时首页不该告警')
  eq(errlog.errorHistory().length, 0, '初始历史应为空')

  errlog.noteError(new Error('u[c]._num 炸了'))
  const live = errlog.currentError()
  ok(live !== null, '当前版本出的错应该告警')
  ok(live.msg.indexOf('_num') >= 0, '应记下报错文本')
  eq(live.ver, ver, '应记下当前版本号')
  ok(live.at > 0, '应记下时间戳')
  eq(live.page, 'pages/index/index', '应记下出错页面')

  // 音频解码失败是预期内的,不该拿去吓用户
  errlog.noteError('Unable to decode audio data')
  ok(
    errlog.errorHistory().every((e) => e.msg.indexOf('decode audio') < 0),
    '音频解码失败不该记进报错本',
  )

  // 同一条报错短时间内重复只记一条,不刷屏
  const before = errlog.errorHistory().length
  errlog.noteError(new Error('u[c]._num 炸了'))
  eq(errlog.errorHistory().length, before, '同一条报错短时间内重复不该新增')

  // 关键:旧版本记下的报错不该在新版本告警
  const hist = errlog.errorHistory()
  hist[0].ver = 'v1'
  db.__resetCache()
  storage.set('_errLog', JSON.parse(JSON.stringify(hist)))
  ok(errlog.currentError() === null, '旧版本的报错不该在当前版本告警')
  ok(errlog.errorHistory().length > 0, '但历史里要留着,家长中心能查')

  // 只留最近 5 条
  for (let i = 0; i < 8; i++) errlog.noteError(new Error('错误' + i))
  ok(errlog.errorHistory().length <= 5, '报错本最多留 5 条')
  eq(errlog.errorHistory()[0].msg.indexOf('错误7') >= 0, true, '最新一条应排在最前')

  errlog.clearErrors()
  eq(errlog.errorHistory().length, 0, '清空后历史应为空')
  ok(errlog.currentError() === null, '清空后不该再告警')

  // 存储里塞垃圾也不能崩
  storage.set('_errLog', '不是数组')
  eq(errlog.errorHistory().length, 0, '存储被写坏时应返回空数组而不是崩')
  storage.set('_errLog', [null, { msg: 123 }])
  eq(errlog.errorHistory().length, 0, '格式不对的条目应被过滤掉')

  ok(errlog.formatWhen(Date.now()).indexOf('今天') === 0, '今天的时间应显示成「今天 HH:MM」')
  ok(errlog.formatWhen(Date.now() - 86400000 * 3).indexOf('月') > 0, '几天前的应显示成「N月N日」')

  // ---- 英语口语:难度分档 / 内容质量 / 打分 / 练习记录 ----
  reset()
  study.getCurrentChildId()
  const score = L('core/score.js')
  const talkStore = L('store/talk.js')

  // 缩读还原:剧本写 I am fine,孩子说 I'm fine,必须算完全对
  eq(score.normalizeForCompare("I'm fine"), score.normalizeForCompare('I am fine'), '缩读应还原成完整形式')
  eq(score.normalizeForCompare("it's a cat"), score.normalizeForCompare('it is a cat'), "it's 应还原成 it is")
  eq(score.normalizeForCompare("I can't swim"), score.normalizeForCompare('I cannot swim'), "can't 应还原成 cannot")
  eq(score.normalizeForCompare("let's go"), score.normalizeForCompare('let us go'), "let's 应还原成 let us")
  eq(score.normalizeForCompare("we don't know"), score.normalizeForCompare('we do not know'), "don't 应还原成 do not")
  eq(score.scorePronunciation("I'm fine, thank you", 'I am fine, thank you').stars, 3, '说缩读形式应拿满星')

  // 多个正确答案:任意一个说对都该满星
  const alts = ['I am good', 'Very well']
  eq(score.scorePronunciation('I am good', 'I am fine', alts).stars, 3, '说 alts 里的答案应拿满星')
  eq(score.scorePronunciation('Very well', 'I am fine', alts).stars, 3, '说另一个 alt 也应拿满星')
  eq(score.scorePronunciation('I am fine', 'I am fine', alts).stars, 3, '说标准答案当然满星')
  eq(score.scorePronunciation('', 'I am fine', alts).stars, 0, '没听清应是 0 星')
  ok(score.scorePronunciation('banana apple', 'I am fine', alts).stars <= 1, '完全不沾边应低星')

  // 难度分档
  const counts = talk.dialogCounts()
  for (const lv of ['easy', 'medium', 'hard']) {
    ok(counts[lv] > 0, `难度档 ${lv} 应有对话`)
    ok(talk.dialogsByLevel(lv).every((d) => d.level === lv), `dialogsByLevel(${lv}) 不能混进别档`)
    ok(talk.retellByLevel(lv).length > 0, `难度档 ${lv} 应有复述句`)
    ok(talk.cartoonsByLevel(lv).length > 0, `难度档 ${lv} 应有动画(挑战档回落到进阶档)`)
    ok(talk.LEVEL_LABEL[lv] && talk.LEVEL_DESC[lv], `难度档 ${lv} 应有中文标签和说明`)
  }
  // 三档加起来必须正好是全部,不能有对话漏在档外
  eq(counts.easy + counts.medium + counts.hard, talk.DIALOGS.length, '三档之和应等于对话总数')
  eq(talk.defaultLevelFor('toddler'), 'easy', '幼儿默认入门档')
  eq(talk.defaultLevelFor('primary'), 'medium', '小学默认进阶档')

  // 难度越高,句子应该越长 —— 否则「分档」只是个标签
  const avgLen = (lv) => {
    const ds = talk.dialogsByLevel(lv)
    let n = 0
    let total = 0
    for (const d of ds) for (const t of d.turns) { total += t.expect.split(' ').length; n++ }
    return total / n
  }
  ok(avgLen('easy') < avgLen('medium'), '进阶档答句应比入门档长')
  ok(avgLen('medium') < avgLen('hard'), '挑战档答句应比进阶档长')

  // 内容质量:每段对话的字段都得齐,alts 不能和标准答案重复
  const seenKeys = new Set()
  for (const d of talk.DIALOGS) {
    ok(!seenKeys.has(d.key), `对话 key 不能重复:${d.key}`)
    seenKeys.add(d.key)
    ok(d.title && d.icon, `对话 ${d.key} 应有标题和图标`)
    ok(['easy', 'medium', 'hard'].indexOf(d.level) >= 0, `对话 ${d.key} 的难度档不合法`)
    ok(d.turns.length >= 4, `对话 ${d.key} 至少 4 轮`)
    for (const t of d.turns) {
      ok(t.bot && t.botZh && t.expect && t.expectZh, `对话 ${d.key} 每轮四个字段都要有`)
      // 英文字段里混进中文是最常见的手滑
      ok(!/[一-龥]/.test(t.bot), `对话 ${d.key} 的 bot 不该含中文:${t.bot}`)
      ok(!/[一-龥]/.test(t.expect), `对话 ${d.key} 的 expect 不该含中文:${t.expect}`)
      ok(/[一-龥]/.test(t.botZh) && /[一-龥]/.test(t.expectZh), `对话 ${d.key} 的中文字段应是中文`)
      if (t.alts) {
        for (const a of t.alts) {
          ok(!/[一-龥]/.test(a), `对话 ${d.key} 的 alts 不该含中文:${a}`)
          ok(
            score.normalizeForCompare(a) !== score.normalizeForCompare(t.expect),
            `对话 ${d.key} 的 alts 不该和标准答案重复:${a}`,
          )
        }
        eq(t.alts.length, new Set(t.alts).size, `对话 ${d.key} 的 alts 内部不能重复`)
      }
    }
  }

  // 练习记录
  eq(talkStore.getLevelChoice(), 'auto', '难度默认跟年龄走')
  talkStore.setLevelChoice('hard')
  eq(talkStore.getLevelChoice(), 'hard', '难度选择应能存住')
  db.writeObject('talkLevel', '乱七八糟')
  eq(talkStore.getLevelChoice(), 'auto', '非法难度值应回落到 auto')

  ok(talkStore.getRecord('greeting') === undefined, '没练过应查不到记录')
  talkStore.noteFinished('greeting', 2)
  eq(talkStore.getRecord('greeting').times, 1, '练完一遍应记 1 次')
  eq(talkStore.getRecord('greeting').bestStars, 2, '应记下最好星级')
  talkStore.noteFinished('greeting', 1)
  eq(talkStore.getRecord('greeting').times, 2, '再练一遍次数应累加')
  eq(talkStore.getRecord('greeting').bestStars, 2, '最好成绩只升不降,状态差的一次不该覆盖')
  talkStore.noteFinished('greeting', 3)
  eq(talkStore.getRecord('greeting').bestStars, 3, '拿到更高星应刷新最好成绩')
  eq(talkStore.levelProgress(['greeting', 'zoo']).practiced, 1, '进度应只数练过的')
  eq(talkStore.levelProgress(['greeting', 'zoo']).total, 2, '进度分母应是这一档的总数')
  // 内容改版后的孤儿键要清掉
  talkStore.noteFinished('已删掉的场景', 3)
  talkStore.sanitizeTalk(talk.DIALOGS.map((d) => d.key))
  ok(talkStore.getRecord('已删掉的场景') === undefined, '孤儿练习记录应被清掉')
  ok(talkStore.getRecord('greeting') !== undefined, '体检不该误删有效记录')

  // ---- 自定义词本 + 批量导入 + 每日目标 ----
  // 家长手上的词表格式五花八门,解析器得全都认,否则「导入不进去」会直接劝退
  const parsed = study.parseWordList(
    [
      'apple 苹果',
      'banana\t香蕉',
      'cat,猫',
      'dog，狗',
      'egg: 鸡蛋',
      'fish - 鱼',
      'ice cream 冰淇淋',
      'APPLE 重复的应跳过',
      '没有英文的一行',
      '',
      '   ',
    ].join('\n'),
  )
  const gotWords = parsed.map((p) => p.w.toLowerCase())
  eq(gotWords, ['apple', 'banana', 'cat', 'dog', 'egg', 'fish', 'ice cream'], '各种分隔符都要认得出来')
  eq(parsed[0].tr, '苹果', '中文释义应正确解析')
  eq(parsed[6].w, 'ice cream', '带空格的词组应完整保留')
  eq(study.parseWordList('').length, 0, '空文本应解析出 0 个词')
  eq(study.parseWordList('全是中文\n没有英文').length, 0, '没有英文的文本应解析出 0 个词')

  const myDeckId = study.createCustomDeck(childId, '三年级上册')
  eq(study.listCustomDecks(childId).length, 1, '应能列出自建词本')
  eq(study.addWordsToDeck(childId, myDeckId, parsed), 7, '首次导入应新增 7 个词')
  eq(study.addWordsToDeck(childId, myDeckId, parsed), 0, '重复导入同一批词不应新增')
  eq(study.getDeckCards(myDeckId).length, 7, '词本里应有 7 张卡')
  ok(study.getSessionCards(childId, myDeckId, 5).length === 5, '自建词本应能出题(说明 SRS 状态建好了)')
  study.deleteCustomDeck(myDeckId)
  eq(study.listCustomDecks(childId).length, 0, '删词本后列表应为空')
  eq(study.getDeckCards(myDeckId).length, 0, '删词本应连卡片一起删')

  // 每日目标:边界要夹住,不能被设成 0 或天文数字
  eq(study.getDailyGoal(), 20, '每日目标默认应是 20')
  study.setDailyGoal(35)
  eq(study.getDailyGoal(), 35, '每日目标应能改')
  study.setDailyGoal(0)
  eq(study.getDailyGoal(), 5, '目标设成 0 应被夹到下限 5')
  study.setDailyGoal(99999)
  eq(study.getDailyGoal(), 200, '目标设过大应被夹到上限 200')
  study.setDailyGoal(20)
  ok(typeof study.todayAnswered(childId) === 'number', '今日题数应能算出来')

  // ---- 成长档案:记录/成绩/事例/生长曲线/年度报告 ----
  reset()
  const rec = L('store/records.js')
  const arch = L('store/archive.js')
  const gp = L('core/growthPercentile.js')
  const rm = L('core/recordModules.js')
  const cid3 = study.getCurrentChildId()

  rec.saveProfile({ name: '小朋友', gender: 'male', birthdate: '2019-05-20' })
  eq(rec.getProfile().birthdate, '2019-05-20', '档案资料应能存取')
  // 存坏数据也不能把页面搞崩 —— getProfile 要能兜住
  db.writeObject('childProfile', { name: 123, gender: 'x' })
  eq(rec.getProfile().gender, 'male', '性别非法时应回落到默认值')
  ok(rec.getProfile().name === '', '名字非字符串时应回落成空串')
  rec.saveProfile({ name: '小朋友', gender: 'male', birthdate: '2019-05-20' })

  // 生长百分位:P50 附近的值应落在 40–60,极端值应落在两头
  const std = gp.interpolateStandard('height', 'male', 72)
  ok(std && std.p50 > 0, '身高标准表应能插值出 P50')
  const mid = gp.percentileRankFor('height', 'male', 72, std.p50)
  ok(mid !== null && mid > 40 && mid < 60, `P50 的值应算出约 50 百分位,实际 ${mid}`)
  const low = gp.percentileRankFor('height', 'male', 72, std.p3)
  ok(low !== null && low < 10, `P3 的值应算出很低的百分位,实际 ${low}`)
  const high = gp.percentileRankFor('height', 'male', 72, std.p97)
  ok(high !== null && high > 90, `P97 的值应算出很高的百分位,实际 ${high}`)
  eq(gp.bmiOf(100, 16), 16, 'BMI 计算应为 体重 ÷ 身高(米)²')
  eq(gp.ageMonthsAt('2019-05-20', '2020-05-19'), 11, '生日没到的当月不算满一岁')
  eq(gp.ageMonthsAt('2019-05-20', '2020-05-20'), 12, '生日当天应满 12 个月')
  eq(gp.classifyBmi(-3), 'thin', 'z<-2 应判为偏瘦')
  eq(gp.classifyBmi(0), 'normal', 'z=0 应判为正常')
  eq(gp.classifyBmi(3), 'obese', 'z>2 应判为肥胖')

  rec.addGrowth(cid3, { date: '2025-01-10', heightCm: 108, weightKg: 18 })
  rec.addGrowth(cid3, { date: '2025-07-10', heightCm: 112, weightKg: 19.5 })
  const gRows = rec.listGrowth(cid3)
  eq(gRows.length, 2, '应能列出两条发育记录')
  eq(gRows[0].date, '2025-07-10', '列表应按日期倒序')

  // 通用记录:配置驱动的校验必须真的拦住缺必填项的输入
  ok(rec.validateRecord('dental', {}).length > 0, '牙齿记录缺必填项应被拦下')
  eq(rec.validateRecord('dental', { event: '换牙' }), '', '必填项填了就应通过')
  ok(rec.validateRecord('vision', {}).length > 0, '视力记录一项不填应被拦下')
  eq(rec.validateRecord('vision', { leftDegree: 100 }), '', '视力记录填一项就应通过')
  rec.addRecord(cid3, 'reading', '2025-03-01', { title: '夏洛的网', rating: 5 })
  rec.addRecord(cid3, 'award', '2025-04-02', { contest: '绘画大赛', prize: '一等奖', scope: '市级' })
  rec.addRecord(cid3, 'grading', '2025-05-03', { project: '钢琴', level: '三级', result: '通过' })
  eq(rec.listRecords(cid3, 'reading').length, 1, '应能按模块列出记录')
  eq(rec.countRecordsByModule(cid3).award, 1, '应能按模块统计条数')
  // 每个模块的摘要都不能返回空串(列表上会变成空白行)
  for (const def of rm.RECORD_MODULES) {
    ok(typeof def.summarize({}) === 'string' && def.summarize({}).length > 0, `${def.module} 空字段也要有摘要`)
    ok(def.fields.length > 0, `${def.module} 至少要有一个字段`)
  }

  // 成绩:趋势必须按得分率算,否则 48/50 会被判成不如 92/100
  rec.addExam(cid3, { date: '2025-03-10', examType: '单元测' }, [{ subject: '数学', score: 92, fullScore: 100 }])
  rec.addExam(cid3, { date: '2025-04-10', examType: '单元测' }, [{ subject: '数学', score: 48, fullScore: 50 }])
  const tr = rec.subjectTrends(cid3).find((t) => t.subject === '数学')
  ok(tr && tr.points.length === 2, '数学应有两次成绩')
  eq(tr.points[0].rate, 92, '92/100 的得分率应是 92')
  eq(tr.points[1].rate, 96, '48/50 的得分率应是 96(不能按原始分比)')
  ok(tr.delta > 0, '得分率上升时 delta 应为正')
  // 删考试要连分数一起删,不能留孤儿
  const exList = rec.listExams(cid3)
  rec.removeExam(exList[0].exam.id)
  eq(rec.listExams(cid3).length, 1, '删考试后列表应少一条')
  ok(
    rec.subjectTrends(cid3).every((t) => t.points.length === 1),
    '删考试应连它的各科分数一起删掉',
  )

  // 事例与品格画像
  rec.addAnecdote(cid3, { date: '2025-02-01', kind: 'shine', content: '扶起摔倒的妹妹', traits: ['同理心', '勇气'] })
  rec.addAnecdote(cid3, { date: '2025-02-08', kind: 'shine', content: '主动收玩具', traits: ['责任', '同理心'] })
  const tp = rec.traitProfile(cid3)
  eq(tp[0].trait, '同理心', '出现两次的品格应排第一')
  eq(tp[0].count, 2, '同理心应统计到 2 次')

  // 时间线:各来源都要进去,且按日期倒序
  const tl = arch.buildTimeline(cid3)
  ok(tl.length >= 7, `时间线应汇集各类记录,实际 ${tl.length} 条`)
  for (let i = 1; i < tl.length; i++) {
    ok(tl[i - 1].date >= tl[i].date, '时间线必须按日期倒序')
  }
  ok(
    tl.every((it) => it.title && it.detail),
    '时间线每条都要有标题和详情',
  )

  // 年度报告
  const rep = arch.buildAnnualReport(cid3, 2025)
  ok(rep.hasData, '2025 年有记录,报告应判定有数据')
  eq(rep.heightGain, 4, '身高应算出长了 4 厘米')
  eq(rep.booksRead, 1, '应统计到读完 1 本书')
  eq(rep.shineCount, 2, '应统计到 2 个闪光时刻')
  ok(rep.awards.length === 1 && rep.gradings.length === 1, '获奖与考级应各统计到 1 条')
  ok(rep.summary.length > 10, '年度总结不能是空话')
  ok(rep.summary.indexOf('undefined') < 0 && rep.summary.indexOf('NaN') < 0, '年度总结里不能漏出 undefined/NaN')
  const blank = arch.buildAnnualReport(cid3, 1999)
  ok(!blank.hasData, '没有记录的年份应判定无数据')
  ok(blank.summary.length > 0, '无数据年份也要给一句话,不能空白')
  ok(arch.availableYears(cid3).indexOf(2025) >= 0, '有记录的年份应出现在年份列表里')

  // 备份往返:导出再导入,记录数不能变(靠 id 去重),清空后能全恢复
  const backup = rec.exportArchive()
  const beforeCount = rec.listGrowth(cid3).length + rec.listAnecdotes(cid3).length
  const reimport = rec.importArchive(backup)
  ok(reimport.ok && reimport.added === 0, '重复导入同一份备份不应产生重复记录')
  eq(rec.listGrowth(cid3).length + rec.listAnecdotes(cid3).length, beforeCount, '重复导入后条数应不变')
  reset()
  study.getCurrentChildId()
  const restored = rec.importArchive(backup)
  ok(restored.ok && restored.added > 0, '清空后导入应恢复出记录')
  eq(rec.getProfile().birthdate, '2019-05-20', '恢复后资料也应回来')
  ok(!rec.importArchive('这不是备份').ok, '乱七八糟的文本应被拒绝而不是崩掉')
  ok(!rec.importArchive('{"v":99}').ok, '版本对不上的备份应被拒绝')

  // 档案体检:脏数据要清掉,好数据不能误伤
  const goodGrowth = db.readTable('growthRecords').length
  db.writeTable('growthRecords', [
    ...db.readTable('growthRecords'),
    { id: '', date: '2025-01-01' }, // 缺 id
    { id: 'x' }, // 缺日期
  ])
  rec.sanitizeRecords()
  ok(
    db.readTable('growthRecords').every((r) => r.id && r.date),
    '档案体检应清掉缺 id 或缺日期的记录',
  )
  eq(db.readTable('growthRecords').length, goodGrowth, '档案体检不该误伤正常记录')

  // ---- SRS ----
  const init = srs.initialSrs()
  eq(init.status, 'new', '新卡状态应为 new')
  const good = srs.gradeCard(init, 'good')
  ok(good.interval >= 1, '答对后间隔至少 1 天')
  const again = srs.gradeCard(good, 'again')
  eq(again.interval, 1, '答错应回到 1 天')
  ok(again.lapses === 1, '答错应累计 lapses')
  ok(srs.isDue({ status: 'new', due: '2999-01-01' }), 'new 卡永远算到期')

  // ---- 等级只升不降 ----
  eq(levels.levelOf(0).cur.level, 1, '0 分是 1 级')
  ok(levels.levelOf(1e9).next === null, '满级后没有下一级')
  let last = 0
  for (const s of levels.LEVELS) {
    ok(s.requiredXP >= last, '等级门槛必须递增')
    last = s.requiredXP
  }

  // ---- 习惯:打卡加分、取消退分、不出现负分 ----
  reset()
  study.getCurrentChildId()
  habits.ensureHabits()
  const hs = habits.listHabits()
  ok(hs.length > 0, '应装上默认习惯')
  const h0 = hs[0]
  const p0 = study.getPoints().balance
  habits.toggleHabit(h0.id)
  eq(study.getPoints().balance, p0 + h0.points, '打卡应加分')
  eq(habits.todayProgress().done, 1, '打卡后今日进度 +1')
  habits.toggleHabit(h0.id)
  eq(study.getPoints().balance, p0, '取消打卡应把分退回')
  eq(habits.todayProgress().done, 0, '取消后今日进度归零')
  // 反复取消不能把分刷成负数
  habits.toggleHabit(h0.id)
  habits.toggleHabit(h0.id)
  habits.toggleHabit(h0.id)
  habits.toggleHabit(h0.id)
  ok(study.getPoints().xp >= 0, '成长值不能为负')
  habits.toggleHabit(h0.id)
  eq(habits.habitStreak(h0.id), 1, '今天打卡后连续天数应为 1')

  // ---- 奖励:余额、兑换、退回 ----
  reset()
  study.getCurrentChildId()
  rewards.ensureRewards()
  const rs = rewards.listRewards()
  ok(rs.length > 0, '应有默认奖励')
  eq(rewards.spendable(), 0, '一开始没有可花的分')
  const cheapest = rs.slice().sort((a, b) => a.cost - b.cost)[0]
  eq(rewards.redeem(cheapest.id), 'notEnough', '分不够时不能兑换')
  study.adjustPoints(cheapest.cost)
  eq(rewards.spendable(), cheapest.cost, '加分后可花的分应增加')
  const xpBefore = study.getPoints().xp
  eq(rewards.redeem(cheapest.id), 'ok', '分够了应能兑换')
  eq(rewards.spendable(), 0, '兑换后可花的分应扣掉')
  eq(study.getPoints().xp, xpBefore, '兑换不能影响等级成长值')
  eq(rewards.pendingCount(), 1, '兑换后应有一条待兑现')
  const red = rewards.listRedemptions()[0]
  rewards.cancelRedemption(red.id)
  eq(rewards.spendable(), cheapest.cost, '撤销兑换应把分退回')
  eq(rewards.pendingCount(), 0, '撤销后不应还有待兑现')
  // 已发放的不能再撤销(否则可以白嫖)
  rewards.redeem(cheapest.id)
  const red2 = rewards.listRedemptions()[0]
  rewards.grantRedemption(red2.id)
  rewards.cancelRedemption(red2.id)
  eq(rewards.spendable(), 0, '已发放的兑换不能撤销退分')

  // ---- 贴纸 / 宠物 ----
  reset()
  eq(fun.awardSticker(1, 10), undefined, '正确率太低不该掉贴纸')
  const got = fun.awardSticker(9, 10)
  ok(got && got.key, '正确率够高应掉一张贴纸')
  eq(fun.ownedStickers().length, 1, '贴纸应记录下来')
  fun.choosePet('chick')
  ok(fun.feedPet(20) === true, '喂够了应该进化')
  ok(fun.getPet().fed === 20, '喂食量应累计')

  // ---- 每日挑战 ----
  reset()
  eq(fun.getChallenge().done, 0, '新的一天挑战从 0 开始')
  fun.bumpChallenge()
  fun.bumpChallenge()
  eq(fun.bumpChallenge(), true, '第 3 组应刚好达标')
  eq(fun.bumpChallenge(), false, '达标后不应重复报喜')

  // ---- 统计与周报不崩、数值合理 ----
  reset()
  const cid2 = study.getCurrentChildId()
  study.ensureBuiltinDeck(cid2, 'hanzi-toddler')
  const byDeck = study.countDueByDeck(cid2)
  const decks2 = study.listChildDecks(cid2)
  for (const d of decks2) {
    eq(byDeck[d.id] ?? 0, study.countDue(cid2, d.id), `批量待学数应与逐个统计一致(${d.name})`)
  }
  const st = progress.getStats(cid2)
  ok(st.curve.length === 14, '学习曲线应是 14 天')
  ok(st.mastered + st.learning + st.fresh > 0, '统计应能算出卡片数')
  const wk = weekly.buildWeekly(cid2)
  ok(typeof wk.comment === 'string' && wk.comment.length > 0, '周报点评不能为空')
  ok(wk.advice.length >= 1, '周报应至少给一条建议')

  // ---- 成就:达成条件单调 ----
  const codes = progress.earnedAchievements(cid2)
  ok(Array.isArray(codes), '成就列表应可计算')
}

// ---------------------------------------------------------------- main

try {
  build()
  run()
} catch (e) {
  fails.push(`自测本身出错:${e && e.stack ? e.stack : e}`)
}

fs.rmSync(OUT, { recursive: true, force: true })

if (fails.length > 0) {
  console.error(`❌ 自测失败 ${fails.length} 项(通过 ${pass} 项):`)
  for (const f of fails) console.error('   • ' + f)
  process.exit(1)
}
console.log(`✅ 逻辑自测全部通过(${pass} 项)`)
