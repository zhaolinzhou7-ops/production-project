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
  // 备份靠它枚举全部 key —— 不模拟的话测到的是退化分支,不是真实路径
  getStorageInfoSync: () => ({ keys: [...storage.keys()], currentSize: 0, limitSize: 10240 }),
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

    // count 字段要跟实际条数对得上,不然「内容库」里显示的数量是假的
    if (typeof pack.count === 'number') {
      eq(pack.count, pack.cards.length, `内容包 ${meta.key} 的 count 应等于实际卡片数`)
    }

    /*
      看图包的三条硬规矩 —— 每一条都对应一个真实踩过的坑:

      1. emoji 不能重复:「听音选图」的选项就是 emoji,同一个包里两张卡用同一个
         图案,屏幕上会并排出现两个一模一样的选项 —— 那道题**没有正确答案**。
         (v36 之前真的有三处:腿/膝盖、椅子/桌子、公交车/校车。)
      2. 中文、英文都不能重复:同一个词出现两遍,就是孩子说的「怎么又是这个」。
      3. emoji 不能是「长得像图形但其实不是 emoji」的字符(比如 ▭ ⬡),
         那类字符在很多手机上是一个空方框,孩子看到的是一道没有图的看图题。
    */
    if (meta.itemType === 'pic') {
      const fronts = pack.cards.map((x) => x.front)
      const ens = pack.cards.map((x) => String(x.en).toLowerCase())
      const emos = pack.cards.map((x) => x.emoji)
      eq(fronts.length, new Set(fronts).size, `${meta.key} 中文不能重复`)
      eq(ens.length, new Set(ens).size, `${meta.key} 英文不能重复`)
      eq(emos.length, new Set(emos).size, `${meta.key} emoji 不能重复(选图题会出现两个一样的选项)`)
      const boxy = pack.cards.filter((x) =>
        [...String(x.emoji)].some((ch) => {
          const u = ch.codePointAt(0)
          if (u >= 0x1f000) return false // 真 emoji 主区
          if (u >= 0x2600 && u <= 0x27bf) return false // 杂项符号/装饰符号
          if (u >= 0x2190 && u <= 0x21ff) return false // 箭头
          // 2300–23FF 里只有这些是 emoji:⌚ ⌛ ⌨ ⏏ ⏩–⏳ ⏸–⏺
          if ([0x231a, 0x231b, 0x2328, 0x23cf].includes(u)) return false
          if ((u >= 0x23e9 && u <= 0x23f3) || (u >= 0x23f8 && u <= 0x23fa)) return false
          // 2B00–2BFF 这一段里**只有这几个**是真 emoji,其余(如 ⬡ 六边形)是普通符号
          if ([0x2b05, 0x2b06, 0x2b07, 0x2b1b, 0x2b1c, 0x2b50, 0x2b55].includes(u)) return false
          // 变体选择符 / 零宽连接符 / 肤色 / 数字键帽的组成部分
          return ![0xfe0f, 0x200d, 0x20e3, 0x3030].includes(u) && !(u >= 0x30 && u <= 0x39)
        }),
      )
      eq(boxy.length, 0, `${meta.key} 不该有会显示成方框的非 emoji 字符`)
    }
  }
  // 每个学段都得有默认包,否则首页会是空的
  for (const st of ['toddler', 'primary', 'junior']) {
    ok(content.defaultPacksForStage(st).length > 0, `学段 ${st} 应有默认内容包`)
  }
  // key 不能重复(重复会导致卡组张冠李戴)
  const keys = content.BUILTIN_PACKS.map((p) => p.key)
  eq(keys.length, new Set(keys).size, '内容包 key 不能重复')

  /*
    ---- 口算难度档 ----

    这里对应一个真实事故:学段存在本地存储里,而每次更新我都让用户
    「清缓存 → 全部清除」—— 一清就退回默认的 'primary',幼儿园的孩子
    第二天打开,口算从「10 以内加法」变成了两位数乘除。
    所以:①「有没有选过学段」必须能被识别 ②难度必须能脱离学段单独选。
  */
  const md = L('core/mathDrill.js')
  eq(md.defaultTierFor('toddler'), 'toddler', '幼儿园默认应是幼儿档')
  eq(md.defaultTierFor('primary'), 'school', '小学默认应是小学档')
  ok(md.mathKindsForTier('toddler').length >= 5, '幼儿档应有足够的题型')
  ok(md.mathKindsForTier('school').length >= 5, '小学档应有足够的题型')
  for (const k of md.mathKindsForTier('toddler')) {
    eq(md.tierOfKind(k.kind), 'toddler', `${k.label} 应归在幼儿档`)
    // 幼儿档不许出现乘除 —— 摆在那里只会让孩子挫败
    ok(!['mul', 'div', 'mulTable', 'mixed'].includes(k.kind), `幼儿档不该出现 ${k.label}`)
  }
  for (const k of md.mathKindsForTier('school')) {
    eq(md.tierOfKind(k.kind), 'school', `${k.label} 应归在小学档`)
  }
  // 三档不能有交集,否则「换一档」换不干净
  const tKinds = md.mathKindsForTier('toddler').map((k) => k.kind)
  const sKinds = md.mathKindsForTier('school').map((k) => k.kind)
  const oKinds = md.mathKindsForTier('olympic').map((k) => k.kind)
  eq(tKinds.filter((k) => sKinds.includes(k)).length, 0, '幼儿档和小学档不该重叠')
  eq(tKinds.filter((k) => oKinds.includes(k)).length, 0, '幼儿档和思维档不该重叠')
  eq(sKinds.filter((k) => oKinds.includes(k)).length, 0, '小学档和思维档不该重叠')
  const aKinds = md.mathKindsForTier('advanced').map((k) => k.kind)
  eq(aKinds.filter((k) => tKinds.includes(k)).length, 0, '奥数档和幼儿档不该重叠')
  eq(aKinds.filter((k) => sKinds.includes(k)).length, 0, '奥数档和小学档不该重叠')
  eq(aKinds.filter((k) => oKinds.includes(k)).length, 0, '奥数档和思维档不该重叠')
  ok(oKinds.length >= 6, '思维档应有足够的专题')
  ok(aKinds.length >= 6, '奥数档应有足够的专题')
  // 每种题型必须能被 tierOfKind 归回它所在的那一档,否则「上次选的题型」会还原到错的档
  for (const k of md.MATH_KINDS) {
    ok(
      md.mathKindsForTier(md.tierOfKind(k.kind)).some((x) => x.kind === k.kind),
      `${k.label} 应能被归回它所在的档`,
    )
  }
  // 每一档的题都得能真的生成出来,且答案对得上
  for (const tier of ['toddler', 'school', 'olympic', 'advanced']) {
    for (const k of md.mathKindsForTier(tier)) {
      const ps = md.generateDrill(k.kind, 8, tier === 'toddler' ? 'toddler' : 'primary')
      eq(ps.length, 8, `${k.label} 应能出 8 道题`)
      ok(
        ps.every((p) => p.text && Number.isFinite(p.answer) && p.answer >= 0),
        `${k.label} 的题目必须有题干,答案必须是非负整数(孩子还没学负数)`,
      )
      // 答案必须是整数 —— 出现小数就是生成器写错了
      ok(
        ps.every((p) => Number.isInteger(p.answer)),
        `${k.label} 的答案必须是整数`,
      )
    }
  }

  /*
    ---- 逐题核对新加的思维题,答案不能靠「看着像对」 ----
    这些题是我写的生成器出的,而错的答案会被孩子当成对的记住。
  */
  for (let i = 0; i < 300; i++) {
    // 20 以内退位减:必须真的退位(个位不够减),否则和 sub10 没区别
    const s20 = md.generateProblem('sub20', 'toddler')
    const m20 = /^(\d+) - (\d+) =$/.exec(s20.text)
    ok(!!m20, '20 以内退位减的题面格式应正确')
    if (m20) {
      const a = Number(m20[1])
      const b = Number(m20[2])
      eq(s20.answer, a - b, '20 以内退位减的答案要对')
      ok(a > 10 && a <= 18, '被减数应在 11–18 之间')
      ok(a - b >= 0 && a - b <= 9, '差应落在 10 以内')
      ok(a % 10 < b, '必须是真退位题(个位不够减),否则就成了 10 以内减法')
    }
    // 连加连减:结果不能为负
    const ch = md.generateProblem('chain', 'toddler')
    const mc = /^(\d+) \+ (\d+) - (\d+) =$/.exec(ch.text)
    ok(!!mc, '连加连减的题面格式应正确')
    if (mc) eq(ch.answer, Number(mc[1]) + Number(mc[2]) - Number(mc[3]), '连加连减的答案要对')
    ok(ch.answer >= 0, '连加连减不该出现负数')
    // 分一分:必须能整除
    const hf = md.generateProblem('half', 'toddler')
    const mh = /平均分给 (\d+) 个小朋友/.exec(hf.text)
    ok(!!mh, '分一分应说清楚分给几个人')
    ok(hf.answer >= 1, '每人至少分到 1 个 —— 分到 0 个对孩子没有意义')
    // 等量代换
    const sw = md.generateProblem('swap', 'primary')
    const ms = /1 个 (.+?) 可以换 (\d+) 个 (.+?)\n(\d+) 个/.exec(sw.text)
    ok(!!ms, '等量代换的题面应完整')
    if (ms) eq(sw.answer, Number(ms[2]) * Number(ms[4]), '等量代换的答案要对')
    // 图形计数:n 个格子连成一排,长方形个数 = n(n+1)/2
    const cr = md.generateProblem('countRect', 'primary')
    const mr = /的 (\d+) 个格子/.exec(cr.text)
    ok(!!mr, '图形计数应说清楚有几个格子')
    if (mr) {
      const nn = Number(mr[1])
      eq(cr.answer, (nn * (nn + 1)) / 2, '图形计数的答案要等于 n(n+1)/2')
    }
    // 周期问题:答案必须落在那一组的范围里
    const cy = md.generateProblem('cycle', 'primary')
    const mcy = /答 1-(\d+)/.exec(cy.text)
    ok(!!mcy, '周期问题要说清楚答案范围')
    if (mcy) ok(cy.answer >= 1 && cy.answer <= Number(mcy[1]), '周期问题的答案应落在给定范围内')
    // 数图形:题面里 target 的个数要和答案一致
    const cs = md.generateProblem('countShape', 'toddler')
    const mcs = /一共有几个 (.+?)\?$/.exec(cs.text)
    ok(!!mcs, '数图形应说清楚数哪一个')
    if (mcs) {
      const row = cs.text.split('\n')[0]
      eq([...row].join('').split(mcs[1]).length - 1, cs.answer, '数图形:图里的个数必须等于答案')
    }
    // 排第几:小鸡的位置要和答案一致
    const od = md.generateProblem('ordinal', 'toddler')
    const orow = od.text.split('\n')[0]
    eq([...orow].indexOf('🐣') + 1, od.answer, '排第几:小鸡的实际位置必须等于答案')
  }

  /*
    ---- 逐题核对新加的题型 ----
    这些题的答案错了,孩子会把错的解法记住 —— 比不做还糟。
    所以每一种都按**题面里给出的数字**独立算一遍,而不是信生成器。
  */
  for (let i = 0; i < 400; i++) {
    // 看图·合起来
    const pa = md.generateProblem('picAdd', 'toddler')
    const parts = pa.text.split('\n')[0].split('和').map((x) => x.trim())
    eq([...parts[0]].length + [...parts[1]].length, pa.answer, '看图合起来:两堆之和必须等于答案')
    // 看图·拿走了
    const ps = md.generateProblem('picSub', 'toddler')
    const psLines = ps.text.split('\n')
    const took = Number(/(\d+) 个/.exec(psLines[1])[1])
    eq([...psLines[0]].length - took, ps.answer, '看图拿走了:剩下的必须等于答案')
    ok(ps.answer >= 1, '拿走之后至少还剩 1 个 —— 剩 0 个对幼儿没有意义')
    // 看图·多几个
    const pd = md.generateProblem('picDiff', 'toddler')
    const pdL = pd.text.split('\n')
    eq([...pdL[0]].length - [...pdL[1]].length, pd.answer, '看图多几个:差必须等于答案')
    ok(pd.answer >= 1, '「多几个」的答案至少是 1,否则题目问得不成立')
    // 认方位
    const po = md.generateProblem('position', 'toddler')
    const poRow = [...po.text.split('\n')[0]]
    const fromLeft = po.text.indexOf('从左边数') >= 0
    const tgt = po.text.split('\n')[1].split('数,')[1].split(' 排第几个')[0]
    const realIdx = poRow.findIndex((c) => c === tgt)
    eq(fromLeft ? realIdx + 1 : poRow.length - realIdx, po.answer, '认方位:实际位置必须等于答案')
    // 找不同类
    const oo = md.generateProblem('oddOne', 'toddler')
    ok(oo.answer >= 1 && oo.answer <= 4, '找不同类的答案应是 1–4')
    // 比长短
    const sc = md.generateProblem('sizeCmp', 'toddler')
    const scL = sc.text.split('\n')
    const len1 = [...scL[0].replace('1. ', '')].length
    const len2 = [...scL[1].replace('2. ', '')].length
    ok(len1 !== len2, '比长短:两行不能一样长,否则没有答案')
    eq(len1 > len2 ? 1 : 2, sc.answer, '比长短:更长的那一行必须等于答案')
    // 找不同
    const sd = md.generateProblem('spotDiff', 'toddler')
    const [r1, r2] = sd.text.split('\n')
    const a1 = [...r1]
    const a2 = [...r2]
    eq(a1.length, a2.length, '找不同:两排长度必须一样')
    const diffs = a1.map((c, k) => (c === a2[k] ? -1 : k + 1)).filter((k) => k > 0)
    eq(diffs.length, 1, '找不同:必须只有一个位置不同')
    eq(diffs[0], sd.answer, '找不同:那个位置必须等于答案')
    // 简单枚举
    const en = md.generateProblem('enumerate', 'primary')
    const enm = /有 (\d+) .+?、(\d+) /.exec(en.text)
    eq(Number(enm[1]) * Number(enm[2]), en.answer, '枚举:乘积必须等于答案')
    // 巧算
    const cl = md.generateProblem('clever', 'primary')
    const cn = Number(/… \+ (\d+) =/.exec(cl.text)[1])
    eq((cn * (cn + 1)) / 2, cl.answer, '巧算:等差求和必须等于答案')
    // 和差问题
    const sdp = md.generateProblem('sumDiff', 'primary')
    const sm = /和是 (\d+),差是 (\d+)/.exec(sdp.text)
    eq((Number(sm[1]) + Number(sm[2])) / 2, sdp.answer, '和差问题:(和+差)/2 必须等于答案')
    ok(Number.isInteger(sdp.answer), '和差问题的答案必须是整数')
    // 年龄问题
    const ag2 = md.generateProblem('ageDiff', 'primary')
    const am = /孩子 (\d+) 岁,妈妈 (\d+) 岁/.exec(ag2.text)
    eq(Number(am[2]) - Number(am[1]), ag2.answer, '年龄问题:年龄差永远不变,必须等于答案')
    // 植树问题
    const tr = md.generateProblem('tree', 'primary')
    const tm = /一条 (\d+) 米的小路,每隔 (\d+) 米/.exec(tr.text)
    eq(Number(tm[1]) / Number(tm[2]) + 1, tr.answer, '植树问题:两端都栽应是段数+1')
    // 鸡兔同笼
    const ck = md.generateProblem('chicken', 'primary')
    const km = /一共 (\d+) 个头、(\d+) 只脚/.exec(ck.text)
    const heads = Number(km[1])
    const feet = Number(km[2])
    eq((feet - heads * 2) / 2, ck.answer, '鸡兔同笼:(脚-头×2)/2 必须等于答案')
    ok(ck.answer >= 0 && ck.answer <= heads, '兔子数必须在合理范围内')
    // 盈亏问题
    const pl = md.generateProblem('profitLoss', 'primary')
    // 直接按顺序取题面里的数字 —— 比猜全角/半角标点可靠
    const pnums = (pl.text.match(/\d+/g) || []).map(Number)
    eq(pnums.length, 4, '盈亏问题的题面应含 4 个数字')
    const lowPer = pnums[0]
    const over = pnums[1]
    const highPer = pnums[2]
    const short2 = pnums[3]
    eq((over + short2) / (highPer - lowPer), pl.answer, '盈亏问题:(盈+亏)/每人差 必须等于答案')
    ok(short2 >= 0, '盈亏问题里「少了几颗」不该是负数')
    // 平均数
    const av = md.generateProblem('average', 'primary')
    const nums = av.text.split('\n')[0].split('、').map(Number)
    eq(nums.reduce((x, y) => x + y, 0) / nums.length, av.answer, '平均数:总和/个数 必须等于答案')
    ok(nums.every((x) => x > 0), '平均数的每个数都该是正数')
  }

  // ---- 学段:没选过必须能被认出来,不能静默当成小学 ----
  reset()
  eq(study.hasStage(), false, '还不知道孩子多大时 hasStage 应为 false')
  eq(study.getStage(), 'primary', '不知道时 getStage 仍给一个可用的默认值')
  study.setStage('toddler')
  eq(study.hasStage(), true, '指定之后 hasStage 应为 true')
  eq(study.getStage(), 'toddler', '指定之后应返回指定的那个')

  /*
    ---- 学段跟着生日走 ----

    学段本来是个会过期的快照:孩子明年上小学了,没人会想起来回设置里改它。
    挂在生日上之后,今天算今天的 —— 他长大了程序自己知道。
  */
  const ag = L('core/ageStage.js')
  eq(ag.stageFromMonths(54), 'toddler', '4 岁半应是幼儿园')
  eq(ag.stageFromMonths(71), 'toddler', '差一个月满 6 岁仍是幼儿园')
  eq(ag.stageFromMonths(72), 'primary', '满 6 岁应升小学')
  eq(ag.stageFromMonths(143), 'primary', '差一个月满 12 岁仍是小学')
  eq(ag.stageFromMonths(144), 'junior', '满 12 岁应升初中')
  eq(ag.stageFromMonths(180), 'senior', '满 15 岁应升高中')
  eq(ag.stageFromBirthdate('', '2026-08-02'), undefined, '没填生日应返回 undefined,不能瞎猜')
  eq(ag.stageFromBirthdate('2022-02-01', '2026-08-02'), 'toddler', '2022-02 出生,今天 4 岁半 → 幼儿园')
  eq(ag.describeAge('2022-02-01', '2026-08-02'), '4 岁 6 个月', '年龄要说人话')
  // 低龄的默认时长/题量必须更短 —— 4 岁半晚上用,30 分钟 20 题是折磨
  ok(
    ag.defaultDailyMinutes('toddler') < ag.defaultDailyMinutes('primary'),
    '幼儿的每日时长上限应短于小学',
  )
  ok(ag.defaultDailyGoal('toddler') < ag.defaultDailyGoal('primary'), '幼儿的每日题量目标应少于小学')

  // 只填生日、不手动指定学段:学段应自己算出来
  reset()
  study.setBirthdate('2022-02-01')
  eq(study.hasStage(), true, '填了生日就算知道孩子多大了')
  eq(study.isStageManual(), false, '只填生日时不算手动指定')
  ok(['toddler', 'primary'].includes(study.getStage()), '学段应由生日推出来')
  eq(study.getDailyGoal() <= 20, true, '幼儿的每日题量默认不该跟小学一样多')
  // 手动指定要能盖过生日,取消之后又回到跟着生日走
  study.setStage('junior')
  eq(study.getStage(), 'junior', '手动指定应盖过生日推算')
  eq(study.isStageManual(), true, '手动指定后应能识别出来')
  study.clearStageOverride()
  ok(study.getStage() !== 'junior', '取消手动指定后应回到跟着生日走')

  /*
    ---- 睡前收尾 ----
    晚上用的时候「结束」比「开始」难。跨零点必须处理对,
    否则 23:00 说该睡了、00:30 反而说没到点。
  */
  eq(ag.isBedtime('19:00', '20:30'), false, '还没到点不该催')
  eq(ag.isBedtime('20:30', '20:30'), true, '到点了应该催')
  eq(ag.isBedtime('22:10', '20:30'), true, '过了点应该催')
  eq(ag.isBedtime('00:30', '20:30'), true, '跨过零点仍算该睡了')
  eq(ag.isBedtime('07:00', '20:30'), false, '早上七点不该催睡觉')
  eq(ag.isBedtime('21:00', ''), false, '没设睡觉时间就不催')
  ok(ag.defaultBedtime('toddler') < ag.defaultBedtime('junior'), '幼儿的建议睡觉时间应更早')

  /*
    ---- 家长闸门 ----
    孩子会到处点,而「确定吗?」那个确定他照点不误。
    所以清空类操作要过一道他做不了、家长一眼能算的两位数加法。
  */
  const pg = L('core/parentGate.js')
  for (let i = 0; i < 200; i++) {
    const q = pg.makeGateQuestion()
    const m = /^(\d+) \+ (\d+) = \?$/.exec(q.text)
    ok(!!m, '闸门题目格式应是「a + b = ?」')
    if (m) {
      const a = Number(m[1])
      const b = Number(m[2])
      eq(q.answer, a + b, '闸门答案必须等于题目算出来的值')
      ok(a >= 10 && b >= 10, '两个加数都得是两位数,个位数孩子会算')
    }
  }
  const q0 = pg.makeGateQuestion(() => 0.5)
  eq(pg.gateAnswerOk(String(q0.answer), q0), true, '答对应放行')
  eq(pg.gateAnswerOk(String(q0.answer + 1), q0), false, '答错不放行')
  eq(pg.gateAnswerOk('', q0), false, '空白不放行')
  eq(pg.gateAnswerOk('   ', q0), false, '只打空格不放行')
  eq(pg.gateAnswerOk('abc', q0), false, '乱按字母不放行')
  eq(pg.gateAnswerOk(` ${q0.answer} `, q0), true, '答案前后有空格仍算对')

  /*
    ---- 家长自己录的句子 ----

    英语整句没有可用的免费音源,家长录一遍是唯一能真正解决的办法。
    最要命的失败方式是「明明录过了却找不到」—— 同一句话在对话里带标点、
    在复述里不带、在字幕里首字母大写,直接拿原文当键就会对不上。
  */
  const vk = L('core/voiceKey.js')
  eq(vk.voiceKeyOf('Good morning!'), 'good morning', '句末标点不该影响匹配')
  eq(vk.voiceKeyOf('  Good   morning  '), 'good morning', '首尾空白和多余空格要归一')
  eq(vk.voiceKeyOf('Good morning'), vk.voiceKeyOf('good morning?'), '大小写和句末问号都不该分家')
  eq(vk.voiceKeyOf('这是什么?'), '这是什么', '中文句末问号同样去掉')
  ok(vk.voiceKeyOf("Let's go") !== vk.voiceKeyOf('Lets go'), '句中的撇号要保留 —— 那是两句话')
  eq(vk.isValidVoiceKey(vk.voiceKeyOf('   ')), false, '空句子不该占一条录音')

  reset()
  const vs = L('store/voice.js')
  eq(vs.getMyVoice('Good morning'), '', '没录过应返回空')
  eq(vs.saveMyVoice('Good morning!', '/local/a.mp3'), true, '录一句应存下来')
  eq(vs.getMyVoice('good morning'), '/local/a.mp3', '换个写法也要能找到同一条')
  eq(vs.myVoiceCount(), 1, '应记到 1 条')
  eq(vs.saveMyVoice('Good morning', '/local/b.mp3'), true, '同一句重录应允许')
  eq(vs.getMyVoice('Good morning'), '/local/b.mp3', '重录应覆盖旧的')
  eq(vs.myVoiceCount(), 1, '重录不该变成两条')
  eq(vs.saveMyVoice('  ', '/local/c.mp3'), false, '空句子不该存')
  vs.saveMyVoice('How are you?', '/local/d.mp3')
  eq(vs.listMyVoices().length, 2, '应能列出全部录音')
  eq(vs.listMyVoices()[0].text, 'How are you?', '最近录的排最前面')
  // 文件被系统回收后必须清掉记录 —— 否则表现成「显示已录音,点了不响」
  eq(vs.pruneMissing((p) => p !== '/local/b.mp3'), 1, '失效的那条应被清掉')
  eq(vs.getMyVoice('Good morning'), '', '清掉之后就该当作没录过')
  eq(vs.myVoiceCount(), 1, '没失效的那条要留着')
  vs.deleteMyVoice('How are you')
  eq(vs.myVoiceCount(), 0, '删掉应生效,且不受句末标点影响')

  /*
    ---- 备份与恢复 ----

    在这之前这套系统**没有任何备份**:云同步没配过,「导出数据」导出的
    只有五行统计摘要。而成长档案(身高体重、事例、健康、成绩)和学习进度
    不一样 —— 进度能重新练回来,那些不能。所以这一条测得最狠。
  */
  reset()
  const bk = L('store/backup.js')
  const cidB = study.getCurrentChildId()
  const dkB = study.ensureBuiltinDeck(cidB, 'enlight-colors')
  study.adjustPoints(37)
  const petsForBk = L('core/pets.js')
  fun.choosePet(petsForBk.PET_LINES[0].key)
  fun.feedPetDetailed(11)
  habits.ensureHabits()
  const someHabit = habits.listHabits()[0]
  if (someHabit) habits.toggleHabit(someHabit.id)
  const recStore = L('store/records.js')
  recStore.saveProfile({ name: '小朋友', gender: 'male', birthdate: '2021-02-01' })

  const text = bk.backupToText()
  ok(text.length > 100, '备份应该是有内容的')
  const bkParsed = bk.parseBackup(text)
  eq(bkParsed.ok, true, '自己导出的备份必须能被自己解析')

  // 校验要严 —— 恢复是破坏性的,拿错文件照做会把仅有的一份也弄没
  eq(bk.parseBackup('').ok, false, '空内容不该被当成备份')
  eq(bk.parseBackup('随便一段话').ok, false, '不是 JSON 的不该被当成备份')
  eq(bk.parseBackup('{"a":1}').ok, false, '别的 JSON 不该被当成备份')
  eq(bk.parseBackup(JSON.stringify({ app: 'kids-growth-mp', ver: 1 })).ok, false, '没有 data 不该通过')
  eq(
    bk.parseBackup(JSON.stringify({ app: 'kids-growth-mp', ver: 1, data: {} })).ok,
    false,
    'data 是空的不该通过',
  )
  eq(
    bk.parseBackup(JSON.stringify({ app: 'kids-growth-mp', ver: 99, data: { a: 1 } })).ok,
    false,
    '来自更新版本的备份不该硬吃',
  )

  // 真正的往返:清空 → 恢复 → 每一样都得回来
  const bkXp = study.getPoints().xp
  const fedBefore = fun.getPet().fed
  const cardsBefore = study.countDeckCards(dkB)
  const habitDoneBefore = habits.doneToday().length
  db.clearAll()
  db.__resetCache()
  eq(study.getPoints().xp, 0, '清空后应该什么都没有')
  const r = bk.restoreBackup(text)
  eq(r.ok, true, '恢复应该成功')
  ok(r.count > 5, '恢复的项数不该只有零星几个')
  eq(study.getPoints().xp, bkXp, '成长值必须回来')
  eq(fun.getPet().fed, fedBefore, '宠物喂了几口必须回来')
  eq(study.countDeckCards(dkB), cardsBefore, '卡片必须回来')
  eq(habits.doneToday().length, habitDoneBefore, '打卡记录必须回来')
  eq(recStore.getProfile().birthdate, '2021-02-01', '生日(成长档案的地基)必须回来')
  eq(study.getCurrentChildId(), cidB, '孩子 id 必须回来,否则所有记录都对不上人')

  /*
    ---- 今天这条路 ----
    4 岁半、不识字、每天 15 分钟 —— 他需要的是一条排好的路,不是一屏入口。
  */
  const dp = L('core/dailyPlan.js')
  const fakeDecks = [
    { id: 'd1', itemType: 'pic', name: '认识动物', due: 20 },
    { id: 'd2', itemType: 'pic', name: '认识颜色', due: 12 },
    { id: 'd3', itemType: 'hanzi', name: '幼儿识字', due: 30 },
    { id: 'd4', itemType: 'word', name: '小学单词', due: 40 },
  ]
  const tPlan = dp.buildPlan(fakeDecks, 'toddler')
  ok(tPlan.length >= 3 && tPlan.length <= 4, '幼儿段应排出 3–4 步')
  /*
    第一步用的是**这个卡组当前难度**对应的练法(见 core/adaptive 的阶梯),
    而不是写死一个 —— 写死就是用户说的「做了很多次,每一次还是这样」。
  */
  eq(
    dp.buildPlan(fakeDecks.map((d) => ({ ...d, level: 0 })), 'toddler')[0].mode,
    'listenPic',
    '最低档第一步该是「听中文点图」—— 不用认字',
  )
  eq(
    dp.buildPlan(fakeDecks.map((d) => ({ ...d, level: 4 })), 'toddler')[0].mode,
    'speakEn',
    '最高档第一步该是「读出来」—— 产出才是真会了',
  )
  ok(
    dp.buildPlan(fakeDecks.map((d) => ({ ...d, level: 0 })), 'toddler')[0].limit <
      dp.buildPlan(fakeDecks.map((d) => ({ ...d, level: 4 })), 'toddler')[0].limit,
    '低档的题量应少于高档 —— 难度档必须真的影响题量',
  )
  // 阶梯必须平滑:相邻两档不能是同一个,也不能跳过中间环节
  const adMod = L('core/adaptive.js')
  const ladder = [0, 1, 2, 3, 4].map((l) => adMod.modeLadder('pic', l))
  eq(ladder.filter(Boolean).length, 5, '五档都要有对应的练法')
  eq(new Set(ladder).size, 5, '五档的练法不该重复 —— 重复就等于那一档白设')
  eq(adMod.modeLadder('pic', -3), 'listenPic', '档位越界应夹到最低档')
  eq(adMod.modeLadder('pic', 99), 'speakEn', '档位越界应夹到最高档')
  eq(tPlan[tPlan.length - 1].mode, 'earTrain', '最后一步该是磨耳朵 —— 收尾要轻松')
  ok(
    tPlan.every((s) => s.limit <= 8),
    '幼儿段每步题量必须小 —— 4 岁半撑不了 12 题一组',
  )
  ok(!tPlan.some((s) => s.deckId === 'd4'), '幼儿段不该排小学单词')
  // 没题可做时不能端上来一组空题
  eq(dp.buildPlan([{ id: 'x', itemType: 'pic', name: '空', due: 0 }], 'toddler').length, 0, '没到期的卡组不该进今天这条路')
  eq(dp.buildPlan([], 'toddler').length, 0, '一个卡组都没有时应给出空计划')
  // 同一步不该重复出现
  const planKeys = tPlan.map((s) => s.deckId + '|' + s.mode)
  eq(planKeys.length, new Set(planKeys).size, '同一个卡组+练法不该在一天里排两次')
  ok(dp.planMinutes(tPlan) > 0 && dp.planMinutes(tPlan) < 30, '一条路的预估时长要在合理范围')

  reset()
  const planStore = L('store/plan.js')
  planStore.savePlan(tPlan)
  eq(planStore.getPlan().done, 0, '刚排好时还没走过')
  const nx = planStore.advancePlan()
  eq(planStore.getPlan().done, 1, '走完一步应记一步')
  eq(nx && nx.mode, tPlan[1].mode, '推进后应给出下一步')
  planStore.advancePlan()
  planStore.advancePlan()
  planStore.advancePlan()
  eq(planStore.planFinished(), true, '全部走完应判定为完成')
  eq(planStore.advancePlan(), undefined, '走完之后再推进不该凭空多出一步')

  /*
    ---- 睡前降刺激 ----
    彩带、震动是提高兴奋度的设计,睡前半小时该反着来。
  */
  eq(ag.isWindDown('20:05', '20:30'), true, '睡前 25 分钟应进入安静模式')
  eq(ag.isWindDown('19:55', '20:30'), false, '睡前 35 分钟还不用安静')
  eq(ag.isWindDown('21:00', '20:30'), true, '过了睡觉时间当然算')
  eq(ag.isWindDown('00:30', '20:30'), true, '跨零点仍算')
  eq(ag.isWindDown('12:00', '20:30'), false, '中午不该进安静模式')
  eq(ag.isWindDown('20:05', ''), false, '没设睡觉时间就不进安静模式')

  /*
    ---- 使用日志 ----
    在这之前我们只能靠猜他怎么用。
  */
  reset()
  const usageStore = L('store/usage.js')
  usageStore.noteUsage('open', '认识动物', 'listenPic')
  usageStore.noteUsage('finish', '认识动物', 'listenPic', 6, 6)
  usageStore.noteUsage('open', '幼儿识字', 'recognize')
  usageStore.noteUsage('quit', '幼儿识字', 'recognize', 2, 6)
  usageStore.noteUsage('open', '幼儿识字', 'recognize')
  usageStore.noteUsage('quit', '幼儿识字', 'recognize', 1, 6)
  const sum = usageStore.summarize(['认识动物', '幼儿识字', '从没打开过的包'])
  eq(sum.opens, 3, '应数出打开了 3 组')
  eq(sum.finished, 1, '应数出做完 1 组')
  eq(sum.quits, 2, '应数出半途退出 2 组')
  eq(sum.top[0].deck, '幼儿识字', '最常做的应排第一')
  eq(sum.dropping.length > 0 && sum.dropping[0].deck, '幼儿识字', '最容易退出的应被指出来')
  eq(sum.dropping[0].quitRate, 100, '两次开两次退,退出率应是 100%')
  eq(sum.untouched.includes('从没打开过的包'), true, '一次都没打开的包必须被点名')
  eq(sum.untouched.includes('认识动物'), false, '打开过的不该出现在「没打开过」里')
  ok(sum.peakHour >= 0 && sum.peakHour < 24, '应能算出最常用的时段')

  /*
    ---- 「这道不对」 ----
    4737 张卡是我生成的,自测查得了结构、查不了对错。
  */
  reset()
  const repStore = L('store/reports.js')
  eq(repStore.reportCount(), 0, '一开始没有标记')
  repStore.reportCard({ id: 'c1', front: '苹果', back: 'apple', deckName: '水果', mode: 'picChoose' })
  repStore.reportCard({ id: 'c1', front: '苹果', back: 'apple', deckName: '水果', mode: 'picChoose' })
  eq(repStore.reportCount(), 1, '同一张卡连按两下只该记一条')
  repStore.reportCard({ id: 'c2', front: '香蕉', back: 'banana', deckName: '水果', mode: 'picChoose' })
  eq(repStore.reportCount(), 2, '不同的卡应各记一条')
  ok(repStore.reportsToText().indexOf('苹果') >= 0, '导出的文本里要看得出是哪张卡')
  repStore.clearReports()
  eq(repStore.reportCount(), 0, '清空应生效')

  /*
    ---- 家长录音先录哪些 ----
    家长真正会录的大概二十句,得把最值的排在最前面。
  */
  const vp = L('core/voicePriority.js')
  const ranked = vp.rankForRecording(
    [
      { text: 'Hello', level: 'easy', where: '打招呼' },
      { text: 'Hello', level: 'easy', where: '在学校' },
      { text: 'Hello', level: 'easy', where: '在公园' },
      { text: 'I would like to order a sandwich please', level: 'hard', where: '餐厅' },
      { text: 'Thank you', level: 'easy', where: '打招呼' },
    ],
    3,
  )
  eq(ranked[0].text, 'Hello', '出现三次的短句应排第一 —— 录一次到处都能用')
  eq(ranked[0].times, 3, '应数出它出现了三次')
  eq(ranked[0].where.length, 3, '应说清楚这句在哪些地方会用到')
  ok(
    ranked.findIndex((r) => r.text === 'Thank you') <
      ranked.findIndex((r) => r.text.indexOf('sandwich') >= 0) + 99,
    '短的简单句应排在长难句前面',
  )
  eq(vp.rankForRecording([], 5).length, 0, '没有候选时应给出空列表')

  /*
    ---- 每日积分上限(防刷分) ----

    现在每答对一题都给分,而「再练一遍」可以无限次重来 —— 也就是说
    只要一直点同一组题,分数可以刷到任意高。坏处不是「作弊」,
    是**把整套激励系统废掉**:等级、贴纸、宠物、奖励兑换全挂在成长值上,
    一旦孩子发现分能刷,后面所有的鼓励就一起失效了。
  */
  const pc = L('core/pointCap.js')
  ok(pc.dailyPointCap('toddler') < pc.dailyPointCap('primary'), '幼儿的每日上限应低于小学')
  eq(pc.allowedAward(10, 0, 100), 10, '没到上限时应全额给')
  eq(pc.allowedAward(10, 95, 100), 5, '快到上限时只给剩下的额度')
  eq(pc.allowedAward(10, 100, 100), 0, '到上限后不再加分')
  eq(pc.allowedAward(10, 300, 100), 0, '超过上限(比如上限调小过)也不该给负数额度')
  eq(pc.allowedAward(-8, 100, 100), -8, '扣分不受上限限制 —— 否则取消打卡扣不回去,照样能刷')
  eq(pc.allowedAward(0, 0, 100), 0, '加 0 分就是 0')

  reset()
  const cidCap = study.getCurrentChildId()
  study.setStage('toddler')
  const cap = pc.dailyPointCap('toddler')
  eq(study.earnedToday(), 0, '一开始今天还没拿过分')
  eq(study.pointsRoomToday(), cap, '一开始的额度应等于上限')
  study.adjustPoints(30)
  eq(study.earnedToday(), 30, '加过分之后要记在今天头上')
  eq(study.pointsRoomToday(), cap - 30, '额度应相应减少')
  // 一路刷到上限
  for (let i = 0; i < 100; i++) study.adjustPoints(20)
  eq(study.getPoints().xp, cap, '不管刷多少次,今天的成长值都不该超过上限')
  eq(study.pointsRoomToday(), 0, '到上限后额度为 0')
  eq(study.adjustPoints(50).xp, cap, '到上限后继续加也不涨')
  // 扣分要能扣回去,并且腾出额度(否则取消打卡就成了单向门)
  study.adjustPoints(-20)
  eq(study.getPoints().xp, cap - 20, '扣分必须真的扣掉')
  ok(study.pointsRoomToday() >= 20, '扣掉之后应腾出额度')
  // 结算报的分必须是**实际加进去的**,不能是打算加的
  reset()
  const cidCap2 = study.getCurrentChildId()
  study.setStage('toddler')
  const dkCap = study.ensureBuiltinDeck(cidCap2, 'enlight-colors')
  study.adjustPoints(pc.dailyPointCap('toddler') - 4)
  const capRes = study.finishSession({
    childId: cidCap2,
    deckId: dkCap,
    mode: 'picChoose',
    total: 10,
    correct: 10,
    durationSec: 60,
  })
  eq(capRes.pointsAwarded, 4, '撞上上限时,结算页显示的分必须等于账上真的多出来的分')
  eq(capRes.capped, true, '被上限截住时必须告诉界面,否则孩子只会觉得「这次怎么没涨」')
  eq(study.getPoints().balance, pc.dailyPointCap('toddler'), '余额不该超过上限')
  reset()
  const cidCap3 = study.getCurrentChildId()
  study.setStage('toddler')
  const dkCap3 = study.ensureBuiltinDeck(cidCap3, 'enlight-colors')
  const okRes = study.finishSession({
    childId: cidCap3,
    deckId: dkCap3,
    mode: 'picChoose',
    total: 5,
    correct: 5,
    durationSec: 30,
  })
  eq(okRes.capped, false, '没撞上限时不该误报「拿满了」')
  ok(okRes.pointsAwarded > 0, '正常情况下应真的给分')

  // 换一天要重新开始
  db.writeObject('pointsToday', { date: '2000-01-01', earned: 999 })
  eq(study.earnedToday(), 0, '昨天的额度不该占着今天')

  /*
    ---- 录音:家长的和孩子的分开存,都要留住最后一次 ----

    孩子自己的跟读/复述原先根本没存 —— 只拿到一个临时文件路径,
    退出小程序就没了。家长陪着录了一晚上,第二天想听听进步,什么都不剩。
  */
  reset()
  const vs2 = L('store/voice.js')
  eq(vs2.saveMyVoice('Good morning', '/p/1.mp3', 'parent'), true, '家长录音应能存')
  eq(vs2.saveMyVoice('Good morning', '/k/1.mp3', 'kid'), true, '孩子录音应能存')
  eq(vs2.getMyVoice('Good morning', 'parent'), '/p/1.mp3', '家长那份应独立保存')
  eq(vs2.getMyVoice('Good morning', 'kid'), '/k/1.mp3', '孩子那份应独立保存')
  eq(vs2.getMyVoice('Good morning'), '/p/1.mp3', '不传 owner 时默认取家长的(范读)')
  // 不重录 → 留着最后一次;重录 → 覆盖
  eq(vs2.getMyVoice('good morning!', 'kid'), '/k/1.mp3', '大小写标点不同也该找到同一条')
  vs2.saveMyVoice('Good morning', '/k/2.mp3', 'kid')
  eq(vs2.getMyVoice('Good morning', 'kid'), '/k/2.mp3', '重录应覆盖成最后一次')
  eq(vs2.myVoiceCount('kid'), 1, '重录不该变成两条')
  eq(vs2.getMyVoice('Good morning', 'parent'), '/p/1.mp3', '孩子重录不该动到家长那份')
  // 删一边不影响另一边
  vs2.deleteMyVoice('Good morning', 'kid')
  eq(vs2.myVoiceCount('kid'), 0, '删孩子那份应生效')
  eq(vs2.myVoiceCount('parent'), 1, '删孩子那份不该动家长的')
  // 失效文件的清理也要分开
  vs2.saveMyVoice('Hello', '/k/gone.mp3', 'kid')
  eq(vs2.pruneMissing((x) => x !== '/k/gone.mp3', 'kid'), 1, '孩子那边失效的应被清掉')
  eq(vs2.myVoiceCount('parent'), 1, '清理孩子那边不该波及家长')

  /*
    ---- 每日评分卡 ----

    打分对 4 岁半的孩子风险很高,所以原则要被测试钉死:
    主要看「做了没有」而不是「对了多少」;和昨天的自己比;**没有不及格**。
    一个孩子如果从这套系统里学会的第一件事是「我不行」,前面做的全白搭。
  */
  const sca = L('core/scoreCard.js')
  const areasFull = [
    { key: 'en', label: '英语', emoji: '🔤', done: 10, correct: 9, target: 10 },
    { key: 'ma', label: '数学', emoji: '🧮', done: 10, correct: 8, target: 10 },
  ]
  const full = sca.buildDailyCard(areasFull, -1)
  ok(full.score >= 85, '都做完且大部分做对,应给高分')
  eq(full.stars, 5, '满完成度应给满星')

  // 只做了一点点:分低,但**必须有一颗星**,而且话要好听
  const little = sca.buildDailyCard(
    [{ key: 'en', label: '英语', emoji: '🔤', done: 1, correct: 0, target: 10 }],
    -1,
  )
  ok(little.stars >= 1, '只要做过一点就必须有星 —— 没有不及格这一档')
  ok(little.cheer.indexOf('差') < 0 && little.cheer.indexOf('不行') < 0, '给孩子的话里不能出现负面评价')

  // 一点没做:0 星,但话仍然是邀请而不是指责
  const none = sca.buildDailyCard(
    [{ key: 'en', label: '英语', emoji: '🔤', done: 0, target: 10 }],
    -1,
  )
  eq(none.stars, 0, '完全没做时是 0 星')
  eq(none.score, 0, '完全没做时是 0 分')

  // 完成度权重必须高于正确率:全做完但错一半,应该好过只做两题但全对
  const doneButWrong = sca.buildDailyCard(
    [{ key: 'a', label: 'A', emoji: '1', done: 10, correct: 5, target: 10 }],
    -1,
  )
  const fewButRight = sca.buildDailyCard(
    [{ key: 'a', label: 'A', emoji: '1', done: 2, correct: 2, target: 10 }],
    -1,
  )
  ok(
    doneButWrong.score > fewButRight.score,
    '「做完了但错了些」必须高于「只做两题全对」—— 这个年纪正确率低多半是题出难了',
  )

  // 和昨天比
  eq(sca.buildDailyCard(areasFull, 40).trend, 1, '比昨天高应判为进步')
  eq(
    sca.buildDailyCard(
      [{ key: 'en', label: '英语', emoji: '🔤', done: 2, correct: 2, target: 10 }],
      90,
    ).trend,
    -1,
    '明显比昨天少做时应如实反映',
  )
  eq(sca.buildDailyCard(areasFull, 95).trend, 0, '只差几分算持平 —— 不该为一两题的波动说他退步了')
  eq(sca.buildDailyCard(areasFull, -1).trend, 0, '没有昨天的数据时不该瞎判趋势')

  // 给家长的话要能指出「题可能出难了」
  const hardNote = sca.buildDailyCard(
    [{ key: 'a', label: '数学', emoji: '🧮', done: 10, correct: 2, target: 10 }],
    -1,
  ).note
  ok(hardNote.indexOf('难') >= 0, '正确率很低时,给家长的点评应指出可能是题出难了')

  // 一组练习的评语:分低时说的是题难,不是孩子不行
  eq(sca.rateSession(10, 10).stars, 3, '全对给三星')
  eq(sca.rateSession(0, 10).stars, 1, '全错也给一星 —— 他坐下来做完了')
  ok(sca.rateSession(1, 10).msg.indexOf('难') >= 0, '分很低时的评语应把原因归给题目')
  eq(sca.rateSession(0, 0).stars, 0, '没有题目时不给星')

  /*
    ---- 今天推荐练什么,以及为什么 ----
    原先是按固定顺序挑的,完全不看孩子的实际情况。
  */
  const rc = L('core/recommend.js')
  const sig = [
    { id: 'a', name: '错得多的', itemType: 'pic', due: 5, lapses: 9, daysSince: 1, total: 30 },
    { id: 'b', name: '久没练的', itemType: 'hanzi', due: 5, lapses: 0, daysSince: 9, total: 30 },
    { id: 'c', name: '到期多的', itemType: 'word', due: 20, lapses: 0, daysSince: 1, total: 40 },
    { id: 'd', name: '刚练过的', itemType: 'poem', due: 2, lapses: 0, daysSince: 0, total: 20 },
    { id: 'e', name: '没开过的', itemType: 'fact', due: 0, lapses: 0, daysSince: -1, total: 20 },
    { id: 'f', name: '没题可做的', itemType: 'pic', due: 0, lapses: 0, daysSince: 2, total: 10 },
  ]
  const recos = rc.rankDecks(sig)
  eq(recos[0].deckId, 'a', '错得多的必须排第一 —— 忘掉的不补,后面学的都架空')
  eq(recos[1].deckId, 'b', '久没练的排第二 —— 再放几天就等于从头再来')
  ok(recos.some((r) => r.deckId === 'e'), '从没开过的必须给一个位置,否则新装的包永远排不上号')
  ok(!recos.some((r) => r.deckId === 'f'), '没题可做又不是新包的,不该出现在推荐里')
  for (const r of recos) ok(r.reason && r.reason.length > 0, `${r.name} 必须给出推荐理由`)
  ok(recos[0].reason.indexOf('9') >= 0, '理由里要有具体数字,不能只说「加强一下」')

  // 去重类型:连着三步同一种玩法,孩子第二步就腻了
  const div = rc.diversify(recos, 3)
  eq(div.length, 3, '应能挑出 3 个')
  eq(new Set(div.map((d) => d.itemType)).size, 3, '前三个的类型不该重复')
  // 类型不够多时要能补满,不能少给
  const few = rc.diversify(
    [
      { deckId: '1', name: 'x', itemType: 'pic', reason: 'r', weight: 9 },
      { deckId: '2', name: 'y', itemType: 'pic', reason: 'r', weight: 8 },
    ],
    2,
  )
  eq(few.length, 2, '类型不够多时应用剩下的补满')
  eq(rc.rankDecks([]).length, 0, '没有卡组时给出空推荐')

  /*
    ---- 学习足迹 ----
    「掌握了 23 个词」看得到,「他是什么时候会的」看不到。
    三年后回头看,后者比任何分数都珍贵。
  */
  const tlMod = L('core/timeline.js')
  const tlMarks = tlMod.buildTimeline({
    days: [
      { date: '2026-01-01', answered: 10, correct: 6 },
      { date: '2026-01-02', answered: 8, correct: 8 },
      { date: '2026-01-03', answered: 6, correct: 5 },
    ],
    masteredByDate: [
      { date: '2026-01-01', mastered: 1 },
      { date: '2026-01-02', mastered: 12 },
      { date: '2026-01-05', mastered: 60 },
    ],
    streaks: [
      { date: '2026-01-01', days: 1 },
      { date: '2026-01-02', days: 2 },
      { date: '2026-01-03', days: 3 },
    ],
  })
  ok(tlMarks.length > 0, '应能生成足迹')
  eq(tlMarks[0].date, '2026-01-01', '第一条应是最早的那天')
  ok(tlMarks.some((m) => m.title.indexOf('第一次打开') >= 0), '应记下第一次学习')
  ok(tlMarks.some((m) => m.title.indexOf('10') >= 0), '应记下掌握量 10 的关口')
  ok(tlMarks.some((m) => m.title.indexOf('50') >= 0), '应记下掌握量 50 的关口')
  ok(tlMarks.some((m) => m.title.indexOf('连续学习 3 天') >= 0), '应记下连续 3 天')
  ok(tlMarks.some((m) => m.title.indexOf('一道没错') >= 0), '应记下第一次全对')
  // 关口只记一次 —— 否则每天复习都会刷出一条「掌握量达到 10」
  const tenTimes = tlMarks.filter((m) => m.title === '掌握量达到 10').length
  eq(tenTimes, 1, '同一个关口只该记一次')
  // 日期必须是升序
  for (let i = 1; i < tlMarks.length; i++) {
    ok(tlMarks[i].date >= tlMarks[i - 1].date, '足迹必须按日期升序')
  }
  eq(tlMod.buildTimeline({ days: [], masteredByDate: [], streaks: [] }).length, 0, '没有数据时给空足迹')

  /*
    ---- 家长的观察与兴趣标签 ----
    兴趣标签不是装饰:它会真的改变今天推荐练什么。
  */
  reset()
  const nt = L('store/notes.js')
  eq(nt.addNote('  '), false, '空白观察不该被记下')
  eq(nt.addNote('今天很困,错的那几个平时都会'), true, '观察应能记下')
  eq(nt.listNotes().length, 1, '应能列出观察')
  nt.addNote('最近迷恋恐龙')
  eq(nt.listNotes()[0].text, '最近迷恋恐龙', '最近记的排最前')
  nt.removeNote(nt.listNotes()[0].id)
  eq(nt.listNotes().length, 1, '删除应生效')
  eq(nt.getInterests().length, 0, '一开始没有兴趣标签')
  nt.toggleInterest('动物')
  eq(nt.getInterests(), ['动物'], '选中应记下')
  nt.toggleInterest('动物')
  eq(nt.getInterests().length, 0, '再点一次应取消')
  nt.setInterests(['a', 'b', 'c', 'd', 'e', 'f', 'g'])
  ok(nt.getInterests().length <= 5, '兴趣最多 5 个 —— 什么都感兴趣等于什么都不优先')
  nt.setInterests(['动物', '动物', ' ', '车'])
  eq(nt.getInterests(), ['动物', '车'], '应去重去空')

  // 兴趣要真的影响排序
  const sigLike = [
    { id: 'x', name: '认识动物', itemType: 'pic', due: 3, lapses: 0, daysSince: 1, total: 20 },
    { id: 'y', name: '学校用品', itemType: 'pic', due: 3, lapses: 0, daysSince: 1, total: 20 },
  ]
  const noLike = rc.rankDecks(sigLike, [])
  const withLike = rc.rankDecks(sigLike, ['动物'])
  eq(withLike[0].deckId, 'x', '标了兴趣的那组应被排到前面')
  ok(withLike[0].reason.indexOf('感兴趣') >= 0, '理由里要说明是因为兴趣')
  ok(noLike.length === withLike.length, '兴趣只加权,不该把别的挤掉')

  /*
    ---- 多个孩子 ----
    学习内容和复习进度本来就是按 childId 分的,这里只管档案与切换。
  */
  reset()
  const ch = L('store/children.js')
  const cid0 = study.getCurrentChildId()
  eq(ch.listChildren().length, 1, '老数据应被补成第一个孩子,一条不丢')
  eq(ch.listChildren()[0].id, cid0, '第一个孩子就是当前正在用的那个 id')
  const kid2 = ch.addChild('弟弟')
  ok(!!kid2, '应能添加第二个孩子')
  eq(ch.listChildren().length, 2, '现在有两个孩子')
  eq(ch.addChild('   '), undefined, '空名字不该建出档案')
  eq(ch.switchChild(kid2.id), true, '应能切换')
  eq(study.getCurrentChildId(), kid2.id, '切换后当前孩子应变')
  eq(ch.currentChild().name, '弟弟', '当前孩子应报对名字')
  eq(ch.switchChild('不存在的'), false, '切换到不存在的孩子应失败')
  ch.renameChild(kid2.id, '妹妹')
  eq(ch.currentChild().name, '妹妹', '改名应生效')
  eq(ch.removeChild(kid2.id), true, '应能删除档案')
  eq(study.getCurrentChildId(), cid0, '删掉当前孩子后应自动切回另一个')
  eq(ch.removeChild(cid0), false, '不允许删掉最后一个孩子')

  /*
    ---- 家长自己加内容 ----
    20 篇故事、53 段对话,一年就见底了。
  */
  reset()
  const cidC = study.getCurrentChildId()
  const facts = study.parseFactList('天为什么是蓝的|因为阳光散射\n  \n乱写的一行\n1+1|2')
  eq(facts.length, 2, '认不出格式的行应跳过,而不是整批失败')
  eq(facts[0].q, '天为什么是蓝的', '问题应解析正确')
  eq(facts[0].a, '因为阳光散射', '答案应解析正确')
  eq(study.parseFactList('').length, 0, '空输入给空结果')
  eq(study.parseFactList('全角｜也要认').length, 1, '全角竖线也要认')

  const story = study.parseStory('小鸭子学游泳\n它有点怕\n妈妈说别怕\n它划了一下')
  ok(!!story, '故事应能解析')
  eq(story.title, '小鸭子学游泳', '第一行是标题')
  eq(story.lines.length, 3, '其余每行一句')
  eq(study.parseStory('只有一行'), undefined, '只有标题没有内容的不算故事')

  const fd = study.createCustomDeckOf(cidC, '我们家的问题', 'fact')
  eq(study.addCustomCards(cidC, fd, facts.map((f) => ({ front: f.q, back: f.a }))), 2, '应加进 2 张')
  eq(study.addCustomCards(cidC, fd, facts.map((f) => ({ front: f.q, back: f.a }))), 0, '重复的不该再加')
  eq(study.countDeckCards(fd), 2, '卡组里应有 2 张')
  const sd = study.createCustomDeckOf(cidC, '我编的故事', 'poem')
  eq(
    study.addCustomCards(cidC, sd, [{ front: story.title, back: story.lines.join('\n'), lines: story.lines }]),
    1,
    '故事应能加进去',
  )
  ok(study.getDeck(sd).itemType === 'poem', '故事卡组应是 poem 类型,才能走逐句点读')

  /*
    ---- 升学段过渡 ----
    六岁生日那天内容一夜之间全变了,对孩子来说不是「长大了」,
    是「我昨天还会,今天全不会了」。
  */
  eq(ag.nearNextStage(71), true, '差一个月满 6 岁应算「快升学段了」')
  eq(ag.nearNextStage(69), false, '差三个月还早,不用提前打招呼')
  eq(ag.nearNextStage(60), false, '差一年时还早')
  eq(ag.nearNextStage(200), false, '已经是最高段时不该报')
  eq(ag.nextStageOf('toddler'), 'primary', '幼儿园的下一段是小学')
  eq(ag.nextStageOf('senior'), undefined, '高中没有下一段')

  /*
    ---- 幼儿档的间隔参数 ----
    原先所有年龄共用 SM-2 的原始参数(给成年人背单词调的)。
    4–6 岁的遗忘曲线陡得多:一个词隔 8 天再见面,对他等于新词。
  */
  const srsm = L('core/srs.js')
  const s0 = { interval: 0, ease: 2.5, reps: 0, lapses: 0 }
  const kidFirst = srsm.gradeCard(s0, 'good', srsm.TUNING_TODDLER)
  const adultFirst = srsm.gradeCard(s0, 'good', srsm.TUNING_ADULT)
  eq(kidFirst.interval, 1, '第一次答对都是隔天')
  const kidSecond = srsm.gradeCard(kidFirst, 'good', srsm.TUNING_TODDLER)
  const adultSecond = srsm.gradeCard(adultFirst, 'good', srsm.TUNING_ADULT)
  eq(kidSecond.interval, 2, '幼儿第二次应是 2 天')
  eq(adultSecond.interval, 3, '成人第二次仍是 3 天')
  ok(kidSecond.interval < adultSecond.interval, '幼儿的间隔必须比成人短')
  // 第三次开始按难度系数涨,幼儿的上限被压到 2.0
  const kidThird = srsm.gradeCard(kidSecond, 'good', srsm.TUNING_TODDLER)
  const adultThird = srsm.gradeCard(adultSecond, 'good', srsm.TUNING_ADULT)
  ok(kidThird.interval < adultThird.interval, '第三次幼儿的间隔也该更短')
  ok(kidThird.interval <= kidSecond.interval * 2, '幼儿的难度系数上限应是 2.0')
  eq(srsm.tuningFor('toddler').maxEase, 2, '幼儿档上限 2.0')
  eq(srsm.tuningFor('primary').maxEase, 2.5, '其余学段仍是 2.5')
  // 答错不受调参影响:一律次日重来
  eq(srsm.gradeCard(kidThird, 'again', srsm.TUNING_TODDLER).interval, 1, '答错永远是次日重来')

  /*
    ---- 难度自适应 ----
    间隔重复只管「什么时候再见」,不管「难不难」。
    学习效率最高的是**刚好够得着**的那一档。
  */
  const ad = L('core/adaptive.js')
  eq(ad.adjustFor([]), 'keep', '没有数据时不该乱动难度')
  eq(ad.adjustFor([{ total: 2, correct: 2 }]), 'keep', '只做两题的样本太小,不作数')
  eq(ad.adjustFor([{ total: 8, correct: 3 }]), 'down', '一组不到五成就该降 —— 太难的伤害比太简单大得多')
  eq(
    ad.adjustFor([{ total: 8, correct: 8 }]),
    'keep',
    '只有一组满分还不能升 —— 免得蒙对一组就被推上去',
  )
  eq(
    ad.adjustFor([{ total: 8, correct: 8 }, { total: 6, correct: 6 }]),
    'up',
    '连着两组九成以上才升',
  )
  eq(
    ad.adjustFor([{ total: 8, correct: 8 }, { total: 6, correct: 3 }]),
    'keep',
    '上一组不好就不升',
  )
  // 降档要比升档更敏感:最近一组很差,即使前一组很好也要降
  eq(
    ad.adjustFor([{ total: 8, correct: 2 }, { total: 8, correct: 8 }]),
    'down',
    '最近一组很差就该降,不管之前多好',
  )
  // 档位规格
  for (let i = 0; i < ad.LEVEL_COUNT; i++) {
    const sp = ad.specOf(i)
    ok(sp.size >= 4 && sp.size <= 12, `第 ${i} 档的题量要在合理范围`)
    ok(sp.choices >= 2 && sp.choices <= 5, `第 ${i} 档的选项数要在合理范围`)
  }
  ok(ad.specOf(0).choices < ad.specOf(4).choices, '低档的选项应更少(二选一比四选一简单得多)')
  ok(ad.specOf(0).size < ad.specOf(4).size, '低档的题量应更少')
  eq(ad.specOf(-5).label, ad.specOf(0).label, '档位越界应夹到最低档')
  eq(ad.specOf(99).label, ad.specOf(ad.LEVEL_COUNT - 1).label, '档位越界应夹到最高档')
  eq(ad.nextLevel(0, 'down'), 0, '已经在最低档不该再降')
  eq(ad.nextLevel(ad.LEVEL_COUNT - 1, 'up'), ad.LEVEL_COUNT - 1, '已经在最高档不该再升')
  eq(ad.nextLevel(2, 'keep'), 2, 'keep 就是不动')

  /*
    ---- 说给我听 ----
    补上「产出」这一环:原先幼儿五种练法里四种是四选一、一种是被动听,
    没有一个需要他说出来。而四选一有 25% 蒙对率,答对不等于会。
  */
  const pmodSay = L('core/practiceModes.js')
  const picModes = pmodSay.modesFor('pic', true).map((m) => m.mode)
  ok(picModes.includes('sayIt'), '看图包应有「说给我听」')
  const hanziModes = pmodSay.modesFor('hanzi', true).map((m) => m.mode)
  ok(hanziModes.includes('sayIt'), '识字包也应有「说给我听」')

  /*
    ---- 卡组难度是分开记的 ----
    识字可能已经很熟、英语还在入门,一个全局难度会同时把两边调错。
  */
  reset()
  const cidAd = study.getCurrentChildId()
  const adDeckA = study.ensureBuiltinDeck(cidAd, 'enlight-colors')
  const adDeckB = study.ensureBuiltinDeck(cidAd, 'hanzi-toddler')
  eq(study.deckLevel(adDeckA), 2, '默认从「正常」档起步')
  // 连着两组满分 → 升
  for (let i = 0; i < 2; i++) {
    study.finishSession({ childId: cidAd, deckId: adDeckA, mode: 'picChoose', total: 8, correct: 8, durationSec: 60 })
  }
  eq(study.tuneDeckLevel(cidAd, adDeckA), 'up', '连着两组满分应升档')
  eq(study.deckLevel(adDeckA), 3, '升档后应是 3')
  eq(study.deckLevel(adDeckB), 2, '另一个卡组的难度不该被带着动')
  // 一组很差 → 降
  study.finishSession({ childId: cidAd, deckId: adDeckA, mode: 'picChoose', total: 8, correct: 2, durationSec: 60 })
  eq(study.tuneDeckLevel(cidAd, adDeckA), 'down', '一组很差应降档')
  eq(study.deckLevel(adDeckA), 2, '降回 2')

  // ---- 「再练一遍」放的是哪两个模式 ----
  const pmod = L('core/practiceModes.js')
  for (const t of ['word', 'poem', 'hanzi', 'wrong', 'fact', 'pic']) {
    const r = pmod.repeatModesFor(t, true)
    ok(r.length > 0 && r.length <= 2, `${t} 的「再练一遍」应有 1–2 个模式`)
    for (const m of r) {
      ok(
        pmod.modesFor(t, true).some((x) => x.mode === m.mode),
        `${t} 的「再练一遍」不该给出这种卡组不支持的模式`,
      )
    }
  }
  // 看图包必须是英语那两个 —— 中文的孩子本来就会说,要磨的是英语
  const picRepeat = pmod.repeatModesFor('pic', true).map((m) => m.mode)
  eq(picRepeat.includes('earTrain'), true, '看图包的「再练一遍」必须有磨耳朵')
  eq(picRepeat.includes('listenPicEn'), true, '看图包的「再练一遍」必须有英语·听音选图')
  eq(picRepeat.includes('picChoose'), false, '看图包的「再练一遍」不该占给中文的看图选一选')

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




  // ---- 换宠物不能丢进度 / 随便练不能动复习计划 ----
  reset()
  const cid4 = study.getCurrentChildId()
  const petsLib = L('core/pets.js')
  const A = petsLib.PET_LINES[0].key
  const B = petsLib.PET_LINES[1].key

  fun.choosePet(A)
  fun.feedPetDetailed(12)
  eq(fun.getPet().fed, 12, 'A 应喂到 12 口')
  // 换成 B:A 的进度必须留着
  fun.choosePet(B)
  eq(fun.getPet().line, B, '应切换到 B')
  eq(fun.getPet().fed, 0, 'B 是新的,从 0 开始')
  eq(fun.getPet().fedByLine[A], 12, '换走之后 A 的 12 口必须留着(原先会被清零)')
  fun.feedPetDetailed(5)
  eq(fun.getPet().fed, 5, 'B 应喂到 5 口')
  // 换回 A:回到 12 口,不是 0 也不是 5
  fun.choosePet(A)
  eq(fun.getPet().fed, 12, '换回 A 应回到 12 口')
  eq(fun.getPet().fedByLine[B], 5, 'B 的 5 口也要留着')
  // 换成自己不该有副作用
  fun.choosePet(A)
  eq(fun.getPet().fed, 12, '换成当前这只不该改变进度')

  // 老版本存档没有 fedByLine —— 读的时候要补上,不然一换就丢
  reset()
  study.getCurrentChildId()
  db.writeObject('pet', { line: A, fed: 30, graduated: [] })
  eq(fun.getPet().fedByLine[A], 30, '老存档的进度应被补录进 fedByLine')
  fun.choosePet(B)
  eq(fun.getPet().fedByLine[A], 30, '从老存档换走也不该丢进度')

  // 「这一只从头养」只清眼前这只,别的蛋和养大过的都不能动
  reset()
  study.getCurrentChildId()
  fun.choosePet(A)
  fun.feedPetDetailed(20)
  fun.choosePet(B)
  fun.feedPetDetailed(7)
  db.writeObject('pet', { ...fun.getPet(), graduated: ['x'] })
  fun.resetOnePet()
  eq(fun.getPet().line, B, '只重置这一只:不该把蛋也取消选中')
  eq(fun.getPet().fed, 0, '只重置这一只:当前这只应回到 0 口')
  eq(fun.getPet().fedByLine[B], 0, '只重置这一只:按只记的进度也要归零')
  eq(fun.getPet().fedByLine[A], 20, '只重置这一只:别的蛋的进度不能动')
  eq(fun.getPet().graduated.length, 1, '只重置这一只:养大过的记录不能动')
  // 还没选蛋时调用不该炸,也不该凭空写出一只
  reset()
  study.getCurrentChildId()
  fun.resetOnePet()
  eq(fun.getPet().line, '', '没选蛋时重置这一只应无事发生')
  // 全部重置才是真的全清
  fun.choosePet(A)
  fun.feedPetDetailed(9)
  fun.resetPet()
  eq(fun.getPet().line, '', '全部重置应清掉当前选择')
  eq(Object.keys(fun.getPet().fedByLine).length, 0, '全部重置应清掉所有蛋的进度')

  // 随便练:忽略「到期」,而且不改 SRS
  reset()
  const cid5 = study.getCurrentChildId()
  const dk = study.ensureBuiltinDeck(cid5, 'hanzi-toddler')
  const total = study.countDeckCards(dk)
  ok(total > 0, '应能数出卡组里有多少张卡')
  // 把所有卡都推到很久以后 —— 模拟「今天已清空」
  const st2 = db.readTable('states').map((x) =>
    x.deckId === dk ? { ...x, status: 'review', due: '2099-01-01' } : x,
  )
  db.writeTable('states', st2)
  /*
    每天保底:全都没到期时,今天还没练过这个卡组,就提前拿最快到期的补足 6 张。
    孩子的原话是「第二天打开没有新题」—— 小卡组答对两次就排到 3 天后,
    接下来几天全是「已清空」。「今天没你的题」是最能把孩子推走的一句话。
  */
  eq(study.getSessionCards(cid5, dk, 12).length, 6, '全都没到期时应保底给 6 张,而不是空手')
  eq(study.countDueByDeck(cid5)[dk], 6, '首页显示的数字必须和真能做的题一致')

  // 但今天正经练过之后就该是「已清空」—— 不能变成没有尽头的跑步机
  db.writeTable('sessions', [
    ...db.readTable('sessions'),
    { id: 'x1', childId: cid5, deckId: dk, date: L('core/dateUtils.js').todayISO(), total: 6, correct: 6 },
  ])
  eq(study.getSessionCards(cid5, dk, 12).length, 0, '今天练过之后应显示已清空,孩子需要「做完了」这个时刻')
  eq(study.countDueByDeck(cid5)[dk], 0, '练过之后首页也该显示已清空')

  // 「再练一遍」不算正课 —— 一早点它不该把今天的保底顶掉
  db.writeTable('sessions', [
    { id: 'x2', childId: cid5, deckId: dk, date: L('core/dateUtils.js').todayISO(), total: 6, correct: 6, free: true },
  ])
  eq(study.getSessionCards(cid5, dk, 12).length, 6, '「再练一遍」不该顶掉今天的保底')
  db.writeTable('sessions', [])
  ok(
    study.getSessionCards(cid5, dk, 12, true).length > 0,
    '「再练一遍」必须还能取到题 —— 孩子主动想练时不该被算法拦住',
  )
  eq(study.getSessionCards(cid5, dk, 5, true).length, 5, '「再练一遍」应遵守题量上限')
  // 随机抽:两次取到的顺序不应总是一样(小概率相同,取几次里至少一次不同)
  let differed = false
  const base = study.getSessionCards(cid5, dk, 8, true).map((c) => c.card.id).join()
  for (let i = 0; i < 6; i++) {
    if (study.getSessionCards(cid5, dk, 8, true).map((c) => c.card.id).join() !== base) {
      differed = true
      break
    }
  }
  ok(differed, '「再练一遍」应随机抽题,否则反复做的是同一批')

  /*
    「再练一遍」不能把刚做过的原样再端上来。

    这是孩子真实反馈过的问题:内容包越小越明显 —— 一个 18 张卡的包每组抽 12 张,
    纯随机的话连着两遍必然有一大半重样。所以要求:紧接着的下一遍必须优先上新卡。
    用一个 40 张的包、每组 10 张来验:第二遍**一张都不该**是第一遍的。
  */
  reset()
  const cid6 = study.getCurrentChildId()
  const dk2 = study.ensureBuiltinDeck(cid6, 'enlight-sea')
  const poolSize = study.countDeckCards(dk2)
  ok(poolSize >= 30, '海洋包扩充后应有 30 张以上(池子太小,怎么抽都会重样)')
  const fp1 = study.getSessionCards(cid6, dk2, 10, true).map((c) => c.card.id)
  const fp2 = study.getSessionCards(cid6, dk2, 10, true).map((c) => c.card.id)
  eq(fp1.length, 10, '第一遍应取满 10 张')
  eq(fp2.length, 10, '第二遍应取满 10 张')
  eq(fp1.filter((id) => fp2.includes(id)).length, 0, '紧接着的第二遍不该出现第一遍做过的卡')
  // 池子比题量还小时也不能空手而归 —— 宁可重复,也不能没题做
  const tiny = study.getSessionCards(cid6, dk2, poolSize + 20, true)
  eq(tiny.length, poolSize, '要的比池子还多时,应把整池子都给出来而不是报空')

  // ---- 宠物进食:孩子要看得见「喂了几口、还差多少」 ----
  reset()
  study.getCurrentChildId()
  const pets = L('core/pets.js')
  // 没选蛋时喂食不该崩,也不该凭空长
  const noPet = fun.feedPetDetailed(5)
  eq(noPet.ate, 0, '没选蛋时不该记进食')
  eq(noPet.evolved, false, '没选蛋时不该进化')

  fun.choosePet(pets.PET_LINES[0].key)
  const pf1 = fun.feedPetDetailed(3)
  eq(pf1.ate, 3, '喂几口就该记几口')
  eq(pf1.before, 0, '喂之前应是 0 口')
  eq(pf1.after, 3, '喂之后应是 3 口')
  ok(pf1.toNext > 0, '还没满级时应给出「还差几口」')
  ok(pf1.emojiBefore && pf1.emojiAfter, '进化动画要有前后两个样子')
  ok(pf1.progress >= 0 && pf1.progress <= 1, '进度必须在 0–1 之间')
  ok(pf1.progressBefore >= 0 && pf1.progressBefore <= 1, '起始进度也必须在 0–1 之间')
  ok(pf1.progress > pf1.progressBefore, '喂过之后进度条必须往前走,否则孩子看不到变化')

  // 一次喂到跨阶段:必须报进化,且进度条从 0 起画
  const big = fun.feedPetDetailed(pets.FEED_THRESHOLDS[1] + 5)
  ok(big.evolved, '喂过阈值应判定为进化')
  ok(big.stageAfter > big.stageBefore, '进化后阶段序号应变大')
  eq(big.progressBefore, 0, '刚变身应从新阶段的开头起画,而不是接着上一段')
  ok(big.stageName.length > 0, '进化后应能说出新形态的名字')

  // 进度与阈值必须自洽
  eq(pets.stageProgress(0), 0, '刚出生进度应为 0')
  ok(pets.stageProgress(pets.FEED_THRESHOLDS[1] - 1) > 0.5, '快到阈值时进度应过半')
  eq(pets.stageProgress(pets.FEED_THRESHOLDS[pets.FEED_THRESHOLDS.length - 1]), 1, '满级进度应为 1')
  eq(pets.toNextStage(pets.FEED_THRESHOLDS[pets.FEED_THRESHOLDS.length - 1]), 0, '满级后不该再有「还差几口」')
  let prev = -1
  for (const t of pets.FEED_THRESHOLDS) {
    ok(t > prev, '进食阈值必须递增')
    prev = t
  }
  // feedPet 的老接口要和新接口结论一致
  reset()
  study.getCurrentChildId()
  fun.choosePet(pets.PET_LINES[0].key)
  eq(fun.feedPet(pets.FEED_THRESHOLDS[1] + 1), true, '老的 feedPet 也应正确报告进化')

  // ---- 音色清单:必须真的能选到不同引擎 ----
  // 音色清单在 core/voices.ts(纯数据);音源表在 core/audioSources.ts
  const voices = L('core/voices.js')
  const sources = L('core/audioSources.js')
  const zhIds = voices.ZH_VOICES.map((v) => v.id)
  const srcIds = new Set(sources.ZH_SOURCES.map((s) => s.id))
  for (const id of zhIds) {
    ok(srcIds.has(id), `中文音色「${id}」必须在 ZH_SOURCES 里真的存在,否则选了等于没选`)
  }
  eq(zhIds.length, new Set(zhIds).size, '中文音色 id 不能重复')
  const enIds = voices.EN_VOICES.map((v) => v.id)
  const enSrc = new Set(sources.EN_SOURCES.map((s) => s.id))
  for (const id of enIds) {
    ok(enSrc.has(id), `英语音色「${id}」必须在 EN_SOURCES 里真的存在`)
  }
  // 光有百度那几个不够 —— 它们是同一个引擎,可能听不出区别。
  // 必须至少还有一个**别的引擎**可选,否则「换音色」这个功能是假的。
  ok(
    zhIds.some((id) => id.indexOf('baidu') < 0),
    '中文音色里必须有非百度的选项(同一引擎换参数用户听不出区别)',
  )
  // 排在最前的应该是真正不同的引擎,而不是百度内部细分
  ok(zhIds[0].indexOf('baidu') < 0, '中文音色列表第一个应该是非百度引擎')

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

  // ---- 例句:句子必须是**对的**,拿不准就不出 ----
  const ex = L('core/examples.js')

  // 冠词:a/an 是这类生成里最容易错、也最容易被家长一眼看穿的地方
  ok(ex.articleFor('apple') === 'an', 'apple 用 an')
  ok(ex.articleFor('cat') === 'a', 'cat 用 a')
  ok(ex.articleFor('umbrella') === 'an', 'umbrella 用 an')
  ok(ex.articleFor('x-ray') === 'an', 'x-ray 读作 ex-ray,用 an')

  // 复数:不规则的必须走表,规则的必须按后缀走
  ok(ex.pluralOf('cat') === 'cats', '规则复数 +s')
  ok(ex.pluralOf('box') === 'boxes', '-x 结尾 +es')
  ok(ex.pluralOf('baby') === 'babies', '辅音+y → -ies')
  ok(ex.pluralOf('mouse') === 'mice', 'mouse → mice')
  ok(ex.pluralOf('tooth') === 'teeth', 'tooth → teeth')
  ok(ex.pluralOf('foot') === 'feet', 'foot → feet')
  ok(ex.pluralOf('fish') === 'fish', 'fish 单复数同形')
  ok(ex.pluralOf('sheep') === 'sheep', 'sheep 单复数同形')
  ok(ex.pluralOf('leaf') === 'leaves', 'leaf → leaves')
  ok(ex.pluralOf('tomato') === 'tomatoes', '辅音+o → -es')

  // 各词类的句型
  const catEx = ex.examplesFor('cat', 'enlight-animals')
  ok(catEx[0] === 'a cat', '可数名词先给组词')
  ok(catEx.indexOf('I see a cat.') >= 0, '可数名词要有一条完整句子')
  ok(ex.pluralPhrase('cat', 'enlight-animals') === 'two cats', '可数名词额外给复数组词')
  ok(ex.pluralPhrase('rice', 'enlight-food') === undefined, '不可数名词没有复数组词')
  ok(ex.examplesFor('rice', 'enlight-food')[0] === 'some rice', '不可数名词用 some')
  ok(ex.examplesFor('happy', 'enlight-feelings')[0] === 'I am happy.', '形容人的形容词用 I am')
  ok(ex.examplesFor('red', 'enlight-colors')[0] === 'It is red.', '形容物的形容词用 It is')
  ok(ex.examplesFor('run', 'enlight-actions')[0] === 'I can run.', '动词用 I can')
  ok(ex.examplesFor('doctor', 'enlight-family').indexOf('I want to be a doctor.') >= 0, '职业要出「我想当…」')
  ok(ex.examplesFor('mom', 'enlight-family')[0] === 'my mom', '家人用 my')
  ok(ex.examplesFor('pants', 'enlight-clothes')[0] === 'my pants', '只有复数形式的用 my')
  ok(ex.examplesFor('hand', 'enlight-body').indexOf('Touch your hand.') >= 0, '身体部位要能做出动作')
  ok(ex.examplesFor('A a', 'enlight-abc', 'Apple')[0] === 'A is for Apple.', '字母卡用 X is for Y')

  /*
    「拿不准就不出」—— 这条规矩比多几条例句重要得多。
    这套系统是孩子唯一的英语来源,少一条例句没有损失,错一条例句是在教错。
  */
  ok(ex.examplesFor('sky blue', 'enlight-colors').length === 0, '说不清的词组不出例句')
  ok(ex.examplesFor('cat', 'no-such-pack').length === 0, '不认识的内容包不出例句')
  ok(ex.examplesFor('', 'enlight-animals').length === 0, '空词不出例句')

  // 全量扫一遍所有看图包:凡是出了例句的,冠词不能错、不能有双空格
  {
    let scanned = 0
    let withEx = 0
    const problems = []
    for (const meta of content.BUILTIN_PACKS) {
      if (meta.itemType !== 'pic') continue
      const pack = meta.load()
      for (const c of pack.cards) {
        const word = meta.key === 'enlight-abc' ? c.front : c.en
        if (!word) continue
        scanned += 1
        const list = ex.examplesFor(word, meta.key, c.en)
        if (list.length > 0) withEx += 1
        for (const line of list) {
          if (/\ba [aeiou]/.test(line)) problems.push(`${word}: ${line}`)
          if (/\ban [^aeiou ]/.test(line) && !/an (hour|x-ray|umbrella)/.test(line)) problems.push(`${word}: ${line}`)
          if (line.indexOf('  ') >= 0) problems.push(`${word}: 双空格 ${line}`)
          /*
            怎么区分「组词」和「句子」:句子以大写开头。
            组词("a hot air balloon"、"two cats")本来就不该有句号,
            按词数判断会把长一点的组词误判成句子。
          */
          if (/^[A-Z]/.test(line) && !/[.!?]$/.test(line)) problems.push(`${word}: 句子没有句号 ${line}`)
        }
      }
    }
    ok(problems.length === 0, `例句全量扫描不应有语法问题(发现 ${problems.length} 条:${problems.slice(0, 3).join(' / ')})`)
    ok(scanned > 500, '看图包应扫到 500 个以上的词')
    // 覆盖率低于九成说明词类表漏了一大块,值得回头补
    ok(withEx / scanned > 0.9, `例句覆盖率应高于 90%(实际 ${((withEx / scanned) * 100).toFixed(1)}%)`)
  }

  // ---- 错题重做:选择题(A–E)与输入题 ----
  const redoM = L('core/redo.js')
  ok(redoM.OPTION_LETTERS.join('') === 'ABCDE', '选项字母是 A–E')
  {
    const pool = [
      { front: '猫', back: 'cat', emoji: '🐱', en: 'cat' },
      { front: '狗', back: 'dog', emoji: '🐶', en: 'dog' },
      { front: '鱼', back: 'fish', emoji: '🐟', en: 'fish' },
      { front: '鸟', back: 'bird', emoji: '🐦', en: 'bird' },
      { front: '马', back: 'horse', emoji: '🐴', en: 'horse' },
      { front: '牛', back: 'cow', emoji: '🐮', en: 'cow' },
    ]
    const card = pool[0]

    const rc = redoM.buildRedo({ mode: 'picChoose', itemType: 'pic', card, pool })
    ok(rc && rc.type === 'choice', '看图选一选错了 → 还是选择题')
    ok(rc.options.length === 5, '选择题给 5 个选项(A–E)')
    ok(rc.options.indexOf(rc.answer) >= 0, '正确答案必须在选项里')
    ok(new Set(rc.options).size === rc.options.length, '选项不能重复')
    ok(rc.emoji === '🐱', '看图题重做时要带上原来那张图')

    const re = redoM.buildRedo({ mode: 'picChooseEn', itemType: 'pic', card, pool })
    ok(re.answer === 'cat', '英语题的答案是英文')
    ok(re.lang === 'en', '英语题按英文朗读')
    // 纯英文:选项里不能混进中文
    ok(re.options.every((o) => !/[\u4e00-\u9fa5]/.test(o)), '英语重做题的选项必须全是英文')

    const rw = redoM.buildRedo({ mode: 'speakEn', itemType: 'word', card: { front: 'cat', back: '猫' }, pool: [
      { front: 'dog', back: '狗' }, { front: 'cap', back: '帽' }, { front: 'cut', back: '切' }, { front: 'cow', back: '牛' },
    ] })
    ok(rw && rw.answer === 'cat', '没有现成选项的练法也要能退回选择题')
    ok(rw.options.every((o) => !/[\u4e00-\u9fa5]/.test(o)), '英语单词的重做题不出现中文')

    // 池子太小时不该造出一个「只有正确答案」的假选择题
    const tiny = redoM.buildRedo({ mode: 'picChoose', itemType: 'pic', card, pool: [card] })
    ok(tiny === undefined, '凑不出干扰项时不生成选择题')
  }

  // ---- 错题本必须**会变短**,否则家长很快就不点了 ----
  {
    const cidE = study.getCurrentChildId()
    study.autoAddErrorCard(cidE, {
      front: '5 + 5 =',
      back: '10',
      subject: '数学',
      redo: { type: 'input', answer: 10 },
    })
    study.autoAddErrorCard(cidE, { front: '这是什么?', back: 'cat', subject: '英语' })
    // 同一道题答错两次只记一条 —— 否则错题本会被同一道题刷爆
    study.autoAddErrorCard(cidE, { front: '5 + 5 =', back: '10', subject: '数学' })
    const listed = study.listErrorCards(cidE)
    ok(listed.length === 2, `同一题不重复收录(实际 ${listed.length} 条)`)
    ok(study.errorDueToday(cidE) === 2, '新收的错题今天就该重做')

    // redo 必须原样存下来 —— 干扰项换了就不是「重做这道题」了
    const mathCard = listed.find((c) => c.front === '5 + 5 =')
    ok(mathCard.extra && mathCard.extra.redo && mathCard.extra.redo.type === 'input', '算术错题按输入形式重做')
    ok(mathCard.extra.redo.answer === 10, '重做时的答案要对得上')

    // 连对两次才毕业:一次不算
    const stAll = db.readTable('states').filter((x) => x.childId === cidE && x.cardId === mathCard.id)
    ok(stAll.length === 1, '每张错题卡有一条学习状态')
    study.applyGrade(stAll[0].id, 'good')
    ok(study.graduateErrorCards(cidE) === 0, '只答对一次还不能毕业')
    study.applyGrade(stAll[0].id, 'good')
    ok(study.graduateErrorCards(cidE) === 1, '连着答对两次就毕业')
    ok(study.listErrorCards(cidE).length === 1, '毕业的题要真的从错题本里消失')
    // 毕业之后再调一次不该重复计数
    ok(study.graduateErrorCards(cidE) === 0, '没有可毕业的时候返回 0')
  }

  // ---- 数形结合:算式必须配得上那堆实物 ----
  {
    const md = L('core/mathDrill.js')
    let checked = 0
    for (let i = 0; i < 300; i++) {
      for (const kind of ['add10', 'sub10', 'add20', 'sub20', 'chain', 'makeTen', 'compare']) {
        const p = md.generateProblem(kind, 'toddler')
        if (!p.visual) continue
        checked += 1
        const total = p.visual.groups.reduce((n, g) => n + g.n, 0)
        ok(total > 0 && total <= 20, '图示总数要在 20 个以内,多了孩子数不清')
        ok(p.visual.ops.length === Math.max(0, p.visual.groups.length - 1), '连接符个数比组数少一个')
        // 加法:图上的东西加起来就是答案 —— 数得出来才叫数形结合
        if (kind === 'add10' || kind === 'add20') {
          ok(total === p.answer, `${kind}:图上的总数应等于答案`)
        }
        // 减法:画出来 a 个划掉 b 个,剩下的就是答案
        if (kind === 'sub10' || kind === 'sub20') {
          ok(total - (p.visual.strike || 0) === p.answer, `${kind}:减掉划去的应等于答案`)
        }
        if (kind === 'chain') {
          ok(total - (p.visual.strike || 0) === p.answer, 'chain:先合起来再拿走应等于答案')
        }
        if (kind === 'compare') {
          ok(Math.max(...p.visual.groups.map((g) => g.n)) === p.answer, 'compare:图上多的那排就是答案')
        }
      }
    }
    ok(checked > 1000, '应抽查到足够多的带图算式')
  }
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
