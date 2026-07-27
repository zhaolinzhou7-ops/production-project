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
