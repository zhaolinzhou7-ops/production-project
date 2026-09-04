/**
 * 逻辑层自测。
 *
 * 页面要在浏览器里才能跑,但**业务逻辑**(难度自适应、SRS、打分、推荐、
 * 每日计划、录音索引键)全是纯 TypeScript,可以在 Node 里直接验证。
 *
 * 有了它,像「新卡组默认档直接跳到看图选英文」「打分给出不及格」这类问题
 * 在推给孩子之前就能发现,而不是等他做了一晚上才被家长看出来。
 *
 * 用法:npm run selftest
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = path.join(import.meta.dirname, '..')
/*
  编译产物必须落在项目里,不能放 /tmp。
  package.json 里是 "type": "module",而 /tmp 下没有 package.json ——
  同样一份 ESM 代码放在那里会被 Node 当成 CommonJS 解析,直接报错。
*/
const OUT = path.join(ROOT, '.selftest')
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
/*
  产物按 CommonJS 编译,并在产物目录里放一个 type:commonjs 的 package.json。

  为什么不用 ESM:tsc 不会给相对导入补 .js 后缀,所以 `import './adaptive'`
  在 Node 的 ESM 解析下直接找不到文件。CommonJS 的 require 自己会补后缀,
  而外层项目是 "type": "module",不放这个 package.json 的话产物会被当成 ESM。
*/
writeFileSync(path.join(OUT, 'package.json'), JSON.stringify({ type: 'commonjs' }))

const MODULES = [
  'examples',
  'redo',
  'screenTime',
  'exam',
  'spotCheck',
  'syllabus',
  'playlist',
  'mathDrill',
  'stickers',
  'adaptive',
  'scoreCard',
  'recommend',
  'dailyPlan',
  'pointCap',
  'voiceKey',
  'voicePriority',
  'srs',
  'dateUtils',
]

execFileSync(
  'npx',
  [
    'tsc',
    ...MODULES.map((m) => path.join(ROOT, 'src', 'lib', `${m}.ts`)),
    '--outDir',
    OUT,
    '--module',
    'commonjs',
    '--target',
    'es2022',
    '--skipLibCheck',
    // 命令行指定文件时 tsconfig 不会被加载,显式说明以免 TS5112 直接退出
    '--ignoreConfig',
  ],
  { stdio: 'inherit', cwd: ROOT },
)

// rootDir 被推断成 src/,所以产物落在 OUT/lib/ 下
const require = createRequire(pathToFileURL(path.join(OUT, 'lib', 'x.cjs')).href)
const load = async (m) => require(`./${m}.js`)

const adaptive = await load('adaptive')
const scoreCard = await load('scoreCard')
const recommend = await load('recommend')
const dailyPlan = await load('dailyPlan')
const pointCap = await load('pointCap')
const voiceKey = await load('voiceKey')
const voicePriority = await load('voicePriority')
const srs = await load('srs')
const examples = await load('examples')
const redoM = await load('redo')
const screenTime = await load('screenTime')
const examM = await load('exam')
const spot = await load('spotCheck')
const syl = await load('syllabus')
const playlist = await load('playlist')
const mathDrill = await load('mathDrill')
const stickers = await load('stickers')

let checks = 0
let failed = 0
function ok(cond, what) {
  checks += 1
  if (!cond) {
    failed += 1
    console.error(`  ✗ ${what}`)
  }
}
function eq(a, b, what) {
  ok(Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b), `${what} — 得到 ${JSON.stringify(a)},期望 ${JSON.stringify(b)}`)
}

/*
  ---- 贴纸主题册 + 兑换小额档(w65)----

  原来的问题不是「奖励不够多」,是两处结构缺陷:
  ① 一排互不相干的贴纸随机掉落 —— 孩子没法追求任何一张具体的,
     「还差 12 张」是个抽象数字,没有「就差一张了」那股劲;
  ② 兑换最便宜的也要 40 分,一个 4 岁半要攒三四天 ——
     而这个年纪几乎没有延迟满足能力,三天后才兑现的奖励等于没有奖励。
*/
{
  const inBooks = stickers.STICKER_BOOKS.flatMap((b) => b.members)
  eq(inBooks.length, stickers.STICKER_CATALOG.length, '每张贴纸都要进册子,总数要对得上')
  eq(new Set(inBooks).size, inBooks.length, '同一张贴纸不能出现在两本册子里')
  for (const k of inBooks) ok(!!stickers.getSticker(k), `册子里的 ${k} 必须真的存在`)
  for (const b of stickers.STICKER_BOOKS) {
    eq(b.members.length, 6, `${b.name} 应该是 6 张`)
    ok(!!b.emoji && !!b.name, '每本册子都要有名字和图标')
  }

  const first = stickers.STICKER_BOOKS[0]
  eq(stickers.bookProgress(first, []).got, 0, '一张没有时进度是 0')
  eq(stickers.bookProgress(first, first.members).got, 6, '全有时进度是满的')
  eq(stickers.completedBooks([]).length, 0, '什么都没集时没有集齐的册子')
  eq(stickers.completedBooks(first.members).length, 1, '集齐一本要认出来')

  /*
    掉落偏向「快集齐的那一册」。
    纯随机的毛病很实际:册子永远差最后一两张,而集卡册全部的劲头
    就在那最后一格上,等太久那股劲就散了。
  */
  const almost = first.members.slice(0, 5)
  for (let i = 0; i < 30; i++) {
    const got = stickers.rollSticker(almost)
    ok(got && got.key === first.members[5], '只差一张时必须掉那一张')
  }
  const seen = new Set()
  for (let i = 0; i < 200; i++) {
    const got = stickers.rollSticker([])
    if (got) seen.add(got.key)
  }
  ok(seen.size > 20, '没有接近集齐的册子时,掉落应该是全随机的')
  eq(stickers.rollSticker(stickers.STICKER_CATALOG.map((x) => x.key)), undefined, '集齐后不再掉落')
  const half = stickers.STICKER_CATALOG.slice(0, 30).map((x) => x.key)
  for (let i = 0; i < 50; i++) {
    const got = stickers.rollSticker(half)
    ok(got && !half.includes(got.key), '绝不能掉一张已经有的')
  }
  // 掉落门槛没有被放宽 —— 变的只是掉哪一张
  ok(stickers.qualifiesForSticker(8, 10), '正确率 80% 掉贴纸')
  ok(!stickers.qualifiesForSticker(7, 10), '正确率不够不掉')
}

{
  /*
    兑换清单在 src/db/seedData.ts 里,那个文件会把 Dexie 一起拖进来 ——
    自测只编译 src/lib,所以这里直接读源文件里的那一段。
    检查的是清单本身,不是它怎么被读出来的,读法用哪种都不影响结论。
  */
  const seedSrc = readFileSync(path.join(ROOT, 'src', 'db', 'seedData.ts'), 'utf8')
  const block = seedSrc.slice(seedSrc.indexOf('export const DEFAULT_REWARDS'))
  const rewards = [...block.slice(0, block.indexOf('\n]')).matchAll(
    /\{ name: '([^']+)', icon: '([^']+)', costPoints: (\d+) \}/g,
  )].map((m) => ({ name: m[1], icon: m[2], costPoints: +m[3] }))

  const costs = rewards.map((r) => r.costPoints)
  ok(rewards.length >= 15, `兑换项要够挑(实际 ${rewards.length})`)
  eq(new Set(rewards.map((r) => r.name)).size, costs.length, '兑换项不能重名')
  ok(
    costs.filter((c) => c <= 30).length >= 6,
    `至少要有 6 项 30 分以内的 —— 让积分每天都花得出去(实际 ${costs.filter((c) => c <= 30).length} 项)`,
  )
  ok(Math.min(...costs) <= 15, '最便宜的一项要一天就够得着')
  for (const r of rewards) {
    ok(r.costPoints > 0 && !!r.name && !!r.icon, `${r.name} 要有名字、图标和价格`)
    ok(r.name.length <= 20, `${r.name} 太长,兑换卡片上放不下`)
  }
}

/*
  ---- 选项必须去重 + 渲染期不能用后面才声明的变量(w69)----

  ① 原先挑干扰项是 `pool.filter(x => x !== answer).slice(0, n)` ——
     只排除了正确答案,干扰项彼此之间没去重。
     常识包里已经有两道题答案都是「亚洲」、两道都是「南极洲」,
     不去重的话选项里会并排出现两个「亚洲」:他点哪个都对,程序只认一个。
     而且两个选项文本一样 → React 的 key 撞车 → 点这个可能高亮那个。

  ② useMemo / useState(fn) 的工厂函数是**渲染时立即执行**的。
     如果它用到写在下面的 const,就是 TDZ,真机直接白屏 ——
     而 tsc 抓不到这一类(它没法证明那个函数什么时候跑)。
     这条是踩过才写的:给去重加助手时顺手放在第一个用它的 useMemo 下面。
*/
{
  const study = readFileSync(path.join(ROOT, 'src', 'pages', 'StudySessionPage.tsx'), 'utf8')
  ok(study.includes('const pickDistractors'), '挑干扰项要走统一的 pickDistractors(它负责去重)')
  const olds = study.match(/const distractors = shuffle\([^\n]*\)\.slice\(/g) || []
  eq(olds.length, 0, '不许再用「filter 完直接 slice」挑干扰项 —— 那样干扰项之间不去重')

  // 助手必须声明在第一个用到它的 useMemo 之前
  const declAt = study.indexOf('const pickDistractors')
  const firstUse = study.indexOf('pickDistractors(', declAt + 30)
  ok(declAt >= 0 && (firstUse < 0 || firstUse > declAt), 'pickDistractors 必须先声明后使用')
  const anyEarlier = study.slice(0, declAt).indexOf('pickDistractors(')
  ok(anyEarlier < 0, 'pickDistractors 不能在声明之前被用到 —— useMemo 是渲染期立即执行的,那是 TDZ')
}

/*
  ---- w69:看图选词不许在题面上泄题 + 点完要有反馈 ----

  ① 题面上的「🔊 听英语」点一下就把答案念出来了 —— 那这道题就退化成
     「听音选词」,而且是带图的听音选词,比原来还简单。
     这一档考的是「看到这只山羊,想起 goat 这个词长什么样」。
     想听的话每个选项都能单独点着听:他得自己听出哪一个是 goat。
     (小程序那边 v63 就修了,网页版一直漏着。)

  ② 手指点下去屏幕上没有任何东西动,他不知道点中了没有,于是再点一次,
     而按钮又挨着,第二下很容易落到旁边那个上 ——
     「没反馈」和「点错」是同一件事的两头。
*/
{
  const study = readFileSync(path.join(ROOT, 'src', 'pages', 'StudySessionPage.tsx'), 'utf8')
  // 锚在**渲染那一段**上 —— picChooseEn 在 useMemo 里也出现过,那里没有按钮
  const at = study.indexOf("{mode === 'picChooseEn' && (")
  ok(at > 0, '应该找得到看图选词的渲染段')
  /*
    先把注释剥掉 —— 注释里解释「这里原先有个听英语按钮」不算它还在。
    (第一版就是这么误报的:说明文字被当成了代码。)
  */
  const block = study
    .slice(at, at + 3200)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/[^\n]*/g, '$1')
  ok(!block.includes('听英语'), '看图选词的题面不该有「听英语」按钮 —— 那等于把答案念出来')
  ok(block.includes('aria-label={`听 ${opt}`}'), '每个选项都要能单独点着听')
  ok(block.includes('animate-tap-pop'), '点中了要有动的反馈')
  ok(block.includes('animate-tap-shake'), '答错要晃一下 —— 只变红对快速扫视不够')
  // 答错要多停一会儿:正确答案念出来就要一秒,1200ms 他刚听到就翻走了
  ok(/opt === currentEn \? 900 : 2200/.test(block), '答错要比答对多停一会儿,让他听完正确答案')

  // 反馈动画必须真的定义了,否则 class 挂上去也是空的
  const css = readFileSync(path.join(ROOT, 'src', 'index.css'), 'utf8')
  for (const kf of ['tap-pop', 'tap-shake']) {
    ok(css.includes(`@keyframes ${kf}`), `点击反馈动画 ${kf} 必须定义在 index.css 里`)
    ok(css.includes(`.animate-${kf}`), `.animate-${kf} 必须定义`)
  }
}

// ---------------------------------------------------------------- 难度自适应

// 太难要**一组就降**:一个 4 岁半的孩子连着做错八题,下次就不肯打开了
eq(adaptive.adjustFor([{ total: 8, correct: 3 }]), 'down', '一组低于 50% 就降档')
// 太简单要**连着两组**才升,免得蒙对一组就被推上去
eq(adaptive.adjustFor([{ total: 8, correct: 8 }]), 'keep', '只有一组全对时不升档')
eq(
  adaptive.adjustFor([
    { total: 8, correct: 8 },
    { total: 8, correct: 8 },
  ]),
  'up',
  '连着两组≥90% 才升档',
)
// 不足 4 题的组不算数(题太少,正确率没有意义)
eq(adaptive.adjustFor([{ total: 2, correct: 0 }]), 'keep', '题量不足的组不参与判定')
eq(adaptive.adjustFor([]), 'keep', '没有记录时保持不变')

// 档位边界不能越界
eq(adaptive.nextLevel(0, 'down'), 0, '最低档再降还是最低档')
eq(adaptive.nextLevel(adaptive.LEVEL_COUNT - 1, 'up'), adaptive.LEVEL_COUNT - 1, '最高档再升还是最高档')
for (let i = 0; i < adaptive.LEVEL_COUNT; i++) {
  const spec = adaptive.specOf(i)
  ok(spec.choices >= 2, `第 ${i} 档至少两个选项`)
  ok(spec.size >= 4, `第 ${i} 档至少 4 题`)
}
// 越往上题越多、选项越多 —— 阶梯不能出现回头
for (let i = 1; i < adaptive.LEVEL_COUNT; i++) {
  ok(adaptive.specOf(i).size >= adaptive.specOf(i - 1).size, `第 ${i} 档题量不少于上一档`)
  ok(adaptive.specOf(i).choices >= adaptive.specOf(i - 1).choices, `第 ${i} 档选项不少于上一档`)
}

// 练法阶梯:难度真正被感觉到的地方
const picLadder = [0, 1, 2, 3, 4].map((l) => adaptive.modeLadder('pic', l))
eq(picLadder[0], 'listenPicEn', '看图包最低档是「听英语点图」—— 只要听得懂,不用认字')
// 新卡组默认在第 2 档 —— 那一档不能直接是「看图选英文」,对刚开始的孩子太跳
eq(picLadder[2], 'speakEn', '默认档要他开口 —— 四选一有 25% 蒙对率,说出来没有')
eq(picLadder[4], 'dictation', '最高档是听写 —— 没有图没有选项,真会了才写得出')
ok(new Set(picLadder).size >= 4, '五档里至少四种不同练法,孩子要能感觉到「变了」')
eq(adaptive.modeLadder('hanzi', 4), 'pinyin', '识字最高档是看拼音找字(「说给我听」已并入「跟我读」)')
eq(adaptive.modeLadder('fact', 2), undefined, '没有阶梯的类型返回 undefined,由调用方回退')

// ---------------------------------------------------------------- 打分

// 原则 3:**没有不及格**。只要今天做过一点,至少一颗星
const barely = scoreCard.buildDailyCard([
  { key: 'practice', label: '练习', emoji: '📚', done: 1, target: 20, correct: 0 },
])
ok(barely.stars >= 1, '做了一点就至少一颗星')
ok(!/差|不及格|失败/.test(barely.cheer), '给孩子的话里不能出现负面评价')

// 原则 1:主要看「做了没有」。全做完但错一半,分数仍应明显高于只做了一点点
const doneAllHalfRight = scoreCard.buildDailyCard([
  { key: 'practice', label: '练习', emoji: '📚', done: 20, target: 20, correct: 10 },
])
ok(doneAllHalfRight.score > barely.score + 30, '做完了但错一半 > 只做了一点点')

// 一组做完的评语:最差的一档要把责任揽在系统身上
const worst = scoreCard.rateSession(0, 10)
eq(worst.stars, 1, '一组全错也给一颗星')
ok(worst.msg.includes('不是你的问题'), '最难那一档要说「不是你的问题」')
eq(scoreCard.rateSession(10, 10).stars, 3, '几乎全对给三颗星')
eq(scoreCard.rateSession(0, 0).stars, 0, '一题没做不给星')

// 和昨天比
eq(scoreCard.buildDailyCard([{ key: 'a', label: '练习', emoji: '📚', done: 10, target: 10, correct: 10 }], 20).trend, 1, '比昨天高很多算进步')
eq(scoreCard.buildDailyCard([{ key: 'a', label: '练习', emoji: '📚', done: 0, target: 10 }], -1).trend, 0, '没有昨天的分时不判趋势')

// ---------------------------------------------------------------- 推荐

const signals = [
  { id: 'a', name: '认识动物', itemType: 'pic', due: 5, lapses: 9, daysSince: 1, total: 30 },
  { id: 'b', name: '认识颜色', itemType: 'pic', due: 3, lapses: 0, daysSince: 9, total: 20 },
  { id: 'c', name: '幼儿识字', itemType: 'hanzi', due: 12, lapses: 0, daysSince: 1, total: 100 },
  { id: 'd', name: '拼音启蒙', itemType: 'hanzi', due: 0, lapses: 0, daysSince: -1, total: 63 },
]
const ranked = recommend.rankDecks(signals)
eq(ranked[0].deckId, 'a', '错得多的排最前 —— 忘掉的不补,后面学的都架空')
ok(ranked.every((r) => r.reason.length > 0), '每一条推荐都要有给家长看的理由')
ok(ranked.some((r) => r.deckId === 'd'), '从没开过的新包也要给一个位置,否则家长以为「加了没用」')
// 兴趣加权只是往前挪,不是过滤
const withInterest = recommend.rankDecks(signals, ['颜色'])
ok(withInterest.length === ranked.length, '兴趣加权不挤掉任何一组')
ok(withInterest.find((r) => r.deckId === 'b').weight > ranked.find((r) => r.deckId === 'b').weight, '兴趣相关的权重更高')
// 类型去重:连着三步都是看图选词,孩子第二步就腻了
const div = recommend.diversify(ranked, 2)
eq(div.length, 2, 'diversify 取够个数')
ok(div[0].itemType !== div[1].itemType, '前两步换着类型来')

// ---------------------------------------------------------------- 每日计划

const planDecks = [
  { id: 'a', itemType: 'pic', name: '认识动物', due: 20, level: 0, reason: '之前没记住' },
  { id: 'b', itemType: 'pic', name: '认识颜色', due: 20, level: 4 },
  { id: 'c', itemType: 'hanzi', name: '幼儿识字', due: 20, level: 2 },
]
const steps = dailyPlan.buildPlan(planDecks, 'toddler')
ok(steps.length > 0 && steps.length <= 4, '幼儿一天不超过四步')
// 练法必须跟着**这个卡组自己的**难度档走 —— 这是用户报的「做了很多次还是一样」
eq(steps[0].mode, 'listenPicEn', '入门档的卡组给最简单的练法(听英语点图)')
eq(steps[1].mode, 'dictation', '挑战档的卡组给听写')
// 题量也要跟着难度档,不能永远是 6
eq(steps[0].limit, adaptive.specOf(0).size, '入门档题量按档位给')
eq(steps[1].limit, adaptive.specOf(4).size, '挑战档题量按档位给')
// 收尾一定是轻松的:让他带着「今天很顺」的感觉离开
eq(steps[steps.length - 1].mode, 'earTrain', '最后一步是磨耳朵,不用操作')
ok(steps.some((s) => s.reason), '推荐理由要一路传到计划里')
// 没题可做时不能端上来一组空题
eq(dailyPlan.buildPlan([{ id: 'x', itemType: 'pic', name: '空', due: 0 }], 'toddler').length, 0, '没有可练的卡组时返回空计划')

/*
  ---- 教学大纲接进每日计划(w64)----

  大纲之前只在内容库页面给家长看一句建议,而每天真正练什么由 buildPlan 决定 ——
  两边不通气:内容库劝家长「先专注第 1 批」,每天的路照旧在十个包之间平摊。
  说一套做一套,大纲等于白写。
*/
{
  const mkD = (id, key, due = 10) => ({ id, itemType: 'pic', name: id, due, packKey: key })
  const ds = [mkD('d1', 'enlight-sea'), mkD('d2', 'enlight-family'), mkD('d3', 'enlight-animals')]
  const ordered = dailyPlan.orderByFocus(ds, ['enlight-family', 'enlight-animals'])
  eq(ordered[0].id, 'd2', '焦点包要排到最前')
  eq(ordered.length, ds.length, '排序不能丢卡组')
  // 稳定排序:焦点内部保留进来时的顺序(那是「错得多的优先」的结论)
  const stable = dailyPlan.orderByFocus(
    [mkD('a', 'enlight-family'), mkD('b', 'enlight-animals'), mkD('c', 'enlight-family')],
    ['enlight-family', 'enlight-animals'],
  )
  eq(stable.map((d) => d.id).join(''), 'abc', '焦点内部要保持原有顺序')
  // 是排序不是过滤:焦点包今天没题时不能端上一条空路
  ok(
    dailyPlan.buildPlan([mkD('d1', 'enlight-sea', 10), mkD('d2', 'enlight-family', 0)], 'toddler', [
      'enlight-family',
    ]).length > 0,
    '焦点包今天没题时要照常用别的包排路',
  )
  eq(dailyPlan.buildPlan(ds, 'toddler', ['enlight-animals'])[0].deckId, 'd3', '第一步落在焦点包上')
  eq(dailyPlan.buildPlan(ds, 'toddler')[0].deckId, 'd1', '不传 focus 时保持原来的顺序')
}
ok(dailyPlan.planMinutes(steps) > 0, '要能估出用时,家长要能预估、孩子要能看到终点')

// ---------------------------------------------------------------- 积分上限

eq(pointCap.dailyPointCap('toddler'), 120, '幼儿档上限 120')
ok(pointCap.dailyPointCap('primary') > pointCap.dailyPointCap('toddler'), '越大的孩子上限越高')
eq(pointCap.allowedAward(20, 110, 120), 10, '快到上限时只发剩下的额度')
eq(pointCap.allowedAward(20, 120, 120), 0, '到顶之后不再加分')
// 扣分不受限制 —— 否则反复勾选/取消打卡照样能刷
eq(pointCap.allowedAward(-5, 120, 120), -5, '扣分不受上限限制')

// ---------------------------------------------------------------- 录音索引键

eq(voiceKey.voiceKeyOf('  Let\'s GO! '), "let's go", '归一化:去首尾空白、去句末标点、转小写')
eq(voiceKey.voiceKeyOf('I  like   cats'), 'i like cats', '多个空格并成一个')
// 句中的标点要保留:"Let's go" 和 "Lets go" 是两句话
ok(voiceKey.voiceKeyOf("Let's go") !== voiceKey.voiceKeyOf('Lets go'), '句中标点不能被抹掉')
// 而句末标点不该让同一句话变成两条录音
eq(voiceKey.voiceKeyOf('Good morning!'), voiceKey.voiceKeyOf('Good morning'), '句末标点不影响索引')
ok(!voiceKey.isValidVoiceKey(voiceKey.voiceKeyOf('   ')), '空句子不占一条录音')

// ---------------------------------------------------------------- 录音优先级

const cands = [
  { text: 'Good morning', level: 'easy', where: '对话·打招呼' },
  { text: 'Good morning', level: 'easy', where: '动画·早上好' },
  { text: 'What would you like for breakfast today', level: 'hard', where: '对话·吃饭' },
  { text: 'I am fine', level: 'easy', where: '对话·打招呼' },
]
const top = voicePriority.rankForRecording(cands, 3)
eq(top[0].text, 'Good morning', '出现多次的句子最该先录 —— 录一次到处都能用')
eq(top[0].times, 2, '重复出现要合并计数')
ok(top[0].where.length === 2, '要告诉家长这句在哪儿会用到')
ok(
  top.findIndex((t) => t.text === 'I am fine') <
    top.findIndex((t) => t.text.startsWith('What would')),
  '短句排在长句前面',
)

// ---------------------------------------------------------------- SRS 分龄调参

// 幼儿的遗忘曲线陡得多:隔 8 天再见面等于一个新词,前面的练习白做
const toddler = srs.tuningFor('toddler')
const adult = srs.tuningFor('primary')
ok(toddler.second < adult.second, '幼儿档第二次间隔更短')
ok(toddler.maxEase < adult.maxEase, '幼儿档难度系数上限更低,间隔涨得更慢')

const fresh = { interval: 0, ease: 2.5, reps: 0, lapses: 0 }
const t1 = srs.gradeCard(fresh, 'good', toddler)
eq(t1.interval, toddler.first, '第一次答对按分龄参数排期')
const t2 = srs.gradeCard(t1, 'good', toddler)
eq(t2.interval, toddler.second, '第二次答对按分龄参数排期')
const t3 = srs.gradeCard(t2, 'good', toddler)
ok(t3.interval <= t2.interval * toddler.maxEase + 0.5, '之后的间隔受 maxEase 压制')
// 答错要次日重来,并记一次 lapse(错题排最前面靠的就是它)
const wrong = srs.gradeCard(t3, 'again', toddler)
eq(wrong.interval, 1, '答错次日重来')
eq(wrong.lapses, t3.lapses + 1, '答错要记一次 lapse')
eq(wrong.status, 'learning', '答错回到 learning')
// 新卡今天就该出现
ok(srs.isDue({ due: '2999-01-01', status: 'new' }), '新卡视为到期')

// ---------------------------------------------------------------- 例句

// 冠词:a/an 是这类生成里最容易错、也最容易被家长一眼看穿的地方
eq(examples.articleFor('apple'), 'an', 'apple 用 an')
eq(examples.articleFor('cat'), 'a', 'cat 用 a')
eq(examples.articleFor('umbrella'), 'an', 'umbrella 用 an')
eq(examples.articleFor('x-ray'), 'an', 'x-ray 读作 ex-ray,用 an')

// 复数:不规则的必须走表,规则的必须按后缀走
eq(examples.pluralOf('cat'), 'cats', '规则复数 +s')
eq(examples.pluralOf('box'), 'boxes', '-x 结尾 +es')
eq(examples.pluralOf('baby'), 'babies', '辅音+y → -ies')
eq(examples.pluralOf('mouse'), 'mice', 'mouse → mice')
eq(examples.pluralOf('tooth'), 'teeth', 'tooth → teeth')
eq(examples.pluralOf('fish'), 'fish', 'fish 单复数同形')
eq(examples.pluralOf('leaf'), 'leaves', 'leaf → leaves')
eq(examples.pluralOf('tomato'), 'tomatoes', '辅音+o → -es')

// 各词类的句型
eq(examples.examplesFor('cat', 'enlight-animals')[0], 'a cat', '可数名词先给组词')
ok(examples.examplesFor('cat', 'enlight-animals').includes('I see a cat.'), '可数名词要有完整句子')
eq(examples.pluralPhrase('cat', 'enlight-animals'), 'two cats', '可数名词额外给复数组词')
eq(examples.pluralPhrase('rice', 'enlight-food'), undefined, '不可数名词没有复数组词')
eq(examples.examplesFor('rice', 'enlight-food')[0], 'some rice', '不可数名词用 some')
eq(examples.examplesFor('happy', 'enlight-feelings')[0], 'I am happy.', '形容人的形容词用 I am')
eq(examples.examplesFor('red', 'enlight-colors')[0], 'It is red.', '形容物的形容词用 It is')
eq(examples.examplesFor('run', 'enlight-actions')[0], 'I can run.', '动词用 I can')
ok(examples.examplesFor('doctor', 'enlight-family').includes('I want to be a doctor.'), '职业要出「我想当…」')
eq(examples.examplesFor('mom', 'enlight-family')[0], 'my mom', '家人用 my')
eq(examples.examplesFor('pants', 'enlight-clothes')[0], 'my pants', '只有复数形式的用 my')
ok(examples.examplesFor('hand', 'enlight-body').includes('Touch your hand.'), '身体部位要能做出动作')
eq(examples.examplesFor('A a', 'enlight-abc', 'Apple')[0], 'A is for Apple.', '字母卡用 X is for Y')

/*
  「拿不准就不出」—— 这条规矩比多几条例句重要得多。
  这套系统是孩子唯一的英语来源,少一条例句没有损失,错一条例句是在教错。
*/
eq(examples.examplesFor('sky blue', 'enlight-colors').length, 0, '说不清的词组不出例句')
eq(examples.examplesFor('cat', 'no-such-pack').length, 0, '不认识的内容包不出例句')
eq(examples.examplesFor('', 'enlight-animals').length, 0, '空词不出例句')

/*
  ---- w64 地道性审查钉下来的十一条 ----
  这些不是「读起来别扭」,是真的错或母语者不会那么说。
  全量清单过了一遍才发现,每一条都在孩子每天会看到的卡上。
*/
eq(examples.examplesFor('one', 'enlight-numbers')[0], 'one apple', 'one 后面是单数')
ok(
  examples.examplesFor('one', 'enlight-numbers').every((l) => !l.includes('one apples')),
  '绝不能出现 "one apples" —— 数字包本来就是教「几个」的',
)
eq(examples.examplesFor('zero', 'enlight-numbers').length, 0, '零不出例句')
ok(
  examples.examplesFor('police', 'enlight-family').every((l) => !/\ba police\b(?! officer)/.test(l)),
  '不能出现 "a police",正确说法是 a police officer',
)
ok(examples.examplesFor('soccer', 'enlight-sports').includes("Let's play soccer."), '球类用 play')
ok(
  examples.examplesFor('swimming', 'enlight-sports').includes("Let's go swimming."),
  'swimming 用 go 不用 play —— "play swimming" 是「玩游泳」直译',
)
ok(examples.examplesFor('karate', 'enlight-sports').includes("Let's do karate."), '武术用 do')
eq(examples.examplesFor('noodles', 'enlight-food')[0], 'some noodles', 'noodles 是复数形不是 a noodles')
eq(examples.examplesFor('stairs', 'enlight-home').length, 0, 'stairs 拿不准就不出')
eq(examples.examplesFor('sun', 'enlight-nature')[0], 'the sun', 'sun 用 the 不用 a')
eq(examples.pluralPhrase('sun', 'enlight-nature'), undefined, '不能出现 two suns')
eq(examples.examplesFor('spring', 'enlight-weather')[0], 'in spring', '季节用 in 不用 a')
ok(
  examples.examplesFor('heart', 'enlight-body').every((l) => !l.includes('Touch')),
  '不能让他去摸自己的心脏',
)
eq(examples.examplesFor('tooth', 'enlight-body')[0], 'my teeth', '牙用复数形')
ok(
  examples.examplesFor('tooth', 'enlight-body').includes('These are my teeth.'),
  '复数要配 These are,不是 This is',
)
eq(examples.examplesFor('storm', 'enlight-weather').length, 0, 'storm 是名词,不能出 "It is storm."')
eq(examples.pluralOf('rhino'), 'rhinos', '外来缩略词只加 s')
eq(examples.pluralOf('scarf'), 'scarves', 'scarf → scarves')
eq(examples.pluralOf('bookshelf'), 'bookshelves', 'bookshelf → bookshelves')
eq(examples.pluralOf('jellyfish'), 'jellyfish', 'jellyfish 单复数同形')
eq(examples.pluralOf('maple leaf'), 'maple leaves', '多词短语只变最后一个词')
eq(examples.examplesFor('TV', 'enlight-home')[0], 'a TV', '缩写词在例句里保持大写')
eq(examples.pluralPhrase('TV', 'enlight-home'), 'two TVs', 'TV 的复数是 TVs')
ok(
  examples.examplesFor('cat', 'enlight-animals').includes('Look at the cat!'),
  '第三句换成祈使句 —— 三条例句要给三种句式',
)

// 全量扫一遍所有看图内容包:凡是出了例句的,冠词不能错、句子必须有句号
{
  const decksDir = path.join(ROOT, 'src', 'data', 'decks')
  let scanned = 0
  let withEx = 0
  const problems = []
  for (const file of readdirSync(decksDir)) {
    const pack = JSON.parse(readFileSync(path.join(decksDir, file), 'utf8'))
    if (pack.itemType !== 'pic') continue
    const key = file.replace('.json', '')
    for (const c of pack.cards) {
      const word = key === 'enlight-abc' ? c.front : c.en
      if (!word) continue
      scanned += 1
      const list = examples.examplesFor(word, key, c.en)
      if (list.length > 0) withEx += 1
      for (const line of list) {
        if (/\ba [aeiou]/.test(line)) problems.push(`${word}: ${line}`)
        if (/\ban [^aeiou ]/.test(line) && !/an (hour|x-ray|umbrella)/.test(line)) problems.push(`${word}: ${line}`)
        if (line.includes('  ')) problems.push(`${word}: 双空格 ${line}`)
        // 句子以大写开头;组词("a hot air balloon")本来就不该有句号
        if (/^[A-Z]/.test(line) && !/[.!?]$/.test(line)) problems.push(`${word}: 句子没有句号 ${line}`)
      }
    }
  }
  eq(problems.length, 0, `例句全量扫描不应有语法问题(${problems.slice(0, 3).join(' / ')})`)
  ok(scanned > 500, '看图包应扫到 500 个以上的词')
  ok(withEx / scanned > 0.9, `例句覆盖率应高于 90%(实际 ${((withEx / scanned) * 100).toFixed(1)}%)`)
}

// ---------------------------------------------------------------- 错题重做

eq(redoM.OPTION_LETTERS.join(''), 'ABCDE', '选项字母是 A–E')
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
  eq(rc.type, 'choice', '看图选一选错了 → 还是选择题')
  eq(rc.options.length, 5, '选择题给 5 个选项(A–E)')
  ok(rc.options.includes(rc.answer), '正确答案必须在选项里')
  eq(new Set(rc.options).size, rc.options.length, '选项不能重复')
  eq(rc.emoji, '🐱', '看图题重做时要带上原来那张图')

  const re = redoM.buildRedo({ mode: 'picChooseEn', itemType: 'pic', card, pool })
  eq(re.answer, 'cat', '英语题的答案是英文')
  eq(re.lang, 'en', '英语题按英文朗读')
  ok(re.options.every((o) => !/[\u4e00-\u9fa5]/.test(o)), '英语重做题的选项必须全是英文')

  /*
    跟我读错了 → 重做**还是跟我读**,不再退化成选择题。
    退化成选择题看着「能重做」,实际上把一道要开口的题换成了一道能蒙的题。
  */
  const rw = redoM.buildRedo({
    mode: 'speakEn',
    itemType: 'word',
    card: { front: 'cat', back: '猫' },
    pool: [
      { front: 'dog', back: '狗' },
      { front: 'cap', back: '帽' },
      { front: 'cut', back: '切' },
      { front: 'cow', back: '牛' },
    ],
  })
  eq(rw.type, 'speak', '跟我读错了,重做还是跟我读')
  eq(rw.answer, 'cat', '读的是英文')
  const rl = redoM.buildRedo({
    mode: 'listenChoose',
    itemType: 'word',
    card: { front: 'cat', back: '猫' },
    pool: [
      { front: 'dog', back: '狗' },
      { front: 'cap', back: '帽' },
      { front: 'cut', back: '切' },
      { front: 'cow', back: '牛' },
    ],
  })
  ok(rl.options.every((o) => !/[\u4e00-\u9fa5]/.test(o)), '英语单词的重做题不出现中文')

  // 池子太小时不该造出一个「只有正确答案」的假选择题
  eq(redoM.buildRedo({ mode: 'picChoose', itemType: 'pic', card, pool: [card] }), undefined, '凑不出干扰项时不生成选择题')
}

// ---------------------------------------------------------------- 重做不许换类型

{
  const picPool = [
    { front: '猫', back: 'cat', emoji: '🐱', en: 'cat' },
    { front: '狗', back: 'dog', emoji: '🐶', en: 'dog' },
    { front: '鱼', back: 'fish', emoji: '🐟', en: 'fish' },
    { front: '鸟', back: 'bird', emoji: '🐦', en: 'bird' },
    { front: '马', back: 'horse', emoji: '🐴', en: 'horse' },
    { front: '牛', back: 'cow', emoji: '🐮', en: 'cow' },
  ]
  const mk = (mode) => redoM.buildRedo({ mode, itemType: 'pic', card: picPool[0], pool: picPool })

  /*
    「错了什么类型的题就归入什么类型的错题,不要换类型。」
    听音选图考的是**听懂**,看图选单词考的是**认字形** ——
    把前者换成后者,等于用一道他没错的题替换掉他真正错的那道。
  */
  const listen = mk('listenPicEn')
  eq(listen.optionKind, 'emoji', '听音选图错了 → 重做还是点图')
  ok(listen.options.every((o) => !/[a-zA-Z\u4e00-\u9fa5]/.test(o)), '点图题的选项必须是图,不能是词')
  eq(listen.answer, '🐱', '点图题的答案是那张图')

  const chooseEn = mk('picChooseEn')
  eq(chooseEn.optionKind, 'text', '看图选单词错了 → 重做还是选单词')
  eq(chooseEn.answer, 'cat', '选单词题的答案是英文词')
  eq(chooseEn.emoji, '🐱', '选单词题仍然要把图摆在题面上')

  eq(mk('spell').type, 'spell', '拼写错了 → 还是让他拼')
  eq(mk('spell').answer, 'cat', '拼的是英文,不是中文')
  eq(mk('dictation').type, 'spell', '听写错了 → 还是让他写')
  eq(mk('speakEn').type, 'speak', '跟我读错了 → 还是听范读、读出来')
  eq(mk('earTrain').optionKind, 'emoji', '看图卡的兜底重做仍然是点图,不该变成选词')

  // 老错题:找到原题之后按原类型出;找不到才退回文字选择题
  const withOrigin = redoM.inferRedo({ front: '猫', back: 'cat' }, [], () => ({
    ...picPool[0],
    itemType: 'pic',
    siblings: picPool.slice(1),
  }))
  eq(withOrigin.optionKind, 'emoji', '老的看图错题应恢复成点图题')
  const noOrigin = redoM.inferRedo({ front: '猫', back: 'cat' }, [
    { front: '狗', back: 'dog' },
    { front: '鱼', back: 'fish' },
  ])
  eq(noOrigin.optionKind, 'text', '找不到原题时才退回文字选择题')
}

// ---------------------------------------------------------------- 屏幕时间

eq(screenTime.screenAdvice(5, 'toddler').level, 'ok', '刚开始不提醒')
eq(screenTime.screenAdvice(18, 'toddler').level, 'soft', '幼儿 15 分钟后温和提醒')
eq(screenTime.screenAdvice(30, 'toddler').level, 'hard', '幼儿 25 分钟后明确建议收尾')
eq(screenTime.screenAdvice(18, 'primary').level, 'ok', '同样 18 分钟,小学生还不用提醒')
ok(
  screenTime.screenAdvice(0, 'toddler').hardAt < screenTime.screenAdvice(0, 'primary').hardAt,
  '越大的孩子门槛越宽',
)
for (const stg of ['toddler', 'primary', 'junior']) {
  const a = screenTime.screenAdvice(0, stg)
  ok(a.softAt < a.hardAt, `${stg}:温和档必须早于明确档`)
}
// 家长设过的值优先 —— 程序不该悄悄推翻家长明确设过的数字
eq(screenTime.screenAdvice(35, 'toddler', 40).level, 'soft', '家长设了 40 分钟,35 分钟还没到硬档')
eq(screenTime.screenAdvice(41, 'toddler', 40).level, 'hard', '超过家长设的值才到硬档')
eq(screenTime.screenAdvice(0, 'toddler', 40).hardAt, 40, '硬档门槛应等于家长设的值')
eq(screenTime.screenAdvice(-5, 'toddler').level, 'ok', '负分钟数按 0 处理')
eq(screenTime.screenAdvice(10, 'toddler', 0).hardAt, 25, '上限设成 0 视为没设,退回分龄默认值')

// ---------------------------------------------------------------- 练法全程英语

{
  const ladder = [0, 1, 2, 3, 4].map((l) => adaptive.modeLadder('pic', l))
  eq(new Set(ladder).size, 5, '五档练法不该重复 —— 重复就等于那一档白设')
  ok(
    !ladder.some((m) => m === 'listenPic' || m === 'picChoose'),
    '看图卡的阶梯里不该再有中文练法',
  )
  eq(ladder[0], 'listenPicEn', '最低档是「听英语点图」—— 只要听得懂')
  eq(ladder[4], 'dictation', '最高档是听写 —— 没有图没有选项,真会了才写得出')
}

// ---------------------------------------------------------------- 数形结合

/*
  ⚠️ w69:规则和以前**反过来**了。

  以前这里断言「add / sub / mulTable 要配图」。可用户明确说过
  「口算里面很多要数数字的内容可以删掉,他现在已经能直接计算了」——
  把图铺到所有算式题上,结果每道题都变成了数糖果:
  他不再算 7+5,而是低头数十二颗糖。那对已经会算的孩子是**退步**。

  现在:纯算式题一律不配图;图只留在**本来就是看图数数**的题型上
  (看图合起来、看图拿走、看图多几个)。
*/
{
  for (const k of ['add10', 'sub10', 'add20', 'sub20', 'chain', 'makeTen', 'compare']) {
    ok(!mathDrill.generateProblem(k, 'toddler').visual, `${k} 是算式题,不该配图`)
  }

  let checked = 0
  for (let i = 0; i < 200; i++) {
    for (const kind of ['picAdd', 'picSub', 'picDiff']) {
      const p = mathDrill.generateProblem(kind, 'toddler')
      if (!p.visual) continue
      checked += 1
      const total = p.visual.groups.reduce((n, g) => n + g.n, 0)
      ok(total > 0 && total <= 20, '图示总数要在 20 个以内,多了孩子数不清')
      eq(p.visual.ops.length, Math.max(0, p.visual.groups.length - 1), '连接符个数比组数少一个')
      if (kind === 'picAdd') eq(total, p.answer, 'picAdd:图上的总数应等于答案')
      if (kind === 'picSub') eq(total - (p.visual.strike || 0), p.answer, 'picSub:减掉划去的应等于答案')
    }
  }
  ok(checked > 300, `应抽查到足够多的看图算式(实际 ${checked})`)

  /*
    ---- 思维板块必须能「点」,不能要他打字(w69)----

    这些题型早就写好了,但每一道都要求读题、然后输入一个序号:
    「1.🍎 2.🚗 3.🚌 4.🚲 哪个不是一伙的?(答序号)」——
    一个不识字的 4 岁半明明一眼就知道苹果不是车,却因为不会输入而做不了。
  */
  for (const k of ['oddOne', 'sizeCmp', 'spotDiff', 'position', 'where', 'clock', 'pattern']) {
    const q = mathDrill.generateProblem(k, 'toddler')
    ok(Array.isArray(q.choices) && q.choices.length >= 2, `${k} 必须给可点的选项,不能让他打字`)
    ok(q.answer >= 1 && q.answer <= q.choices.length, `${k} 的答案必须落在选项范围里`)
    ok(!/答序号|答 1 或 2|第几个不一样/.test(q.text), `${k} 的题面不该再要求输入序号`)
  }

  // 比长短:两条差得太少,考的就不是比较是眼力
  for (let i = 0; i < 30; i++) {
    const sc = mathDrill.generateProblem('sizeCmp', 'toddler')
    const l1 = [...sc.choices[0].label].length
    const l2 = [...sc.choices[1].label].length
    ok(Math.abs(l1 - l2) >= 3, `比长短的两条至少差 3 格(实际 ${l1} vs ${l2})`)
    eq(l1 > l2 ? 1 : 2, sc.answer, '更长的那一条必须等于答案')
  }

  // 方位:「在外面」和「在旁边」不能同时当选项 —— 会有两个正确答案
  for (let i = 0; i < 30; i++) {
    const w = mathDrill.generateProblem('where', 'toddler')
    ok(!!w.spatial, '方位题要带图 —— emoji 拼不出「在盒子里面」')
    const labels = w.choices.map((c) => c.label)
    ok(
      !(labels.includes('在外面') && labels.includes('在旁边')),
      '「在外面」和「在旁边」不能同时当选项',
    )
    const map = { in: '在里面', above: '在上面', below: '在下面', beside: '在旁边' }
    eq(labels[w.answer - 1], map[w.spatial.where], '方位题:答案必须和画出来的位置一致')
  }

  // 认时间:只出整点和半点(分钟要到小学,一上来出 3:25 他学到的只有挫败)
  for (let i = 0; i < 40; i++) {
    const ck = mathDrill.generateProblem('clock', 'toddler')
    ok(!!ck.clock, '认时间要带钟面数据')
    ok(ck.clock.minute === 0 || ck.clock.minute === 30, '只出整点和半点')
    const want = ck.clock.minute === 30 ? `${ck.clock.hour} 点半` : `${ck.clock.hour} 点`
    eq(ck.choices[ck.answer - 1].label, want, '认时间:答案必须和钟面一致')
  }

  // 分与合:凑十是回报最高的一档,应该占多数
  {
    let ten = 0
    for (let i = 0; i < 300; i++) {
      if (/是 10\?/.test(mathDrill.generateProblem('makeSum', 'toddler').text)) ten += 1
    }
    ok(ten > 150, `「合起来是 10」应该占多数(实际 ${ten}/300)`)
  }

  /*
    题型登记的四处一致性:类型、MATH_KINDS 表、难度档名单、生成器 switch。
    漏了 MATH_KINDS 的话题型能生成、自测也过,但**界面上一个都看不到** ——
    v66 就是这么漏的,只有打开 app 才发现。
  */
  {
    const listed = new Set(mathDrill.MATH_KINDS.map((k) => k.kind))
    const inTiers = new Set()
    for (const t of ['toddler', 'school', 'olympic', 'advanced']) {
      for (const k of mathDrill.mathKindsForTier(t)) inTiers.add(k.kind)
    }
    for (const k of listed) {
      ok(inTiers.has(k), `${k} 在题型表里,却不属于任何难度档 —— 界面上永远看不到`)
      const q = mathDrill.generateProblem(k, 'primary')
      ok(!!q && !!q.text, `${k} 要能生成题目`)
    }
    const labels = mathDrill.MATH_KINDS.map((k) => k.label)
    const dup = labels.filter((l, i) => labels.indexOf(l) !== i)
    eq(dup.length, 0, `题型名字不能重复(${[...new Set(dup)].join('、')})`)
  }
}

// ---------------------------------------------------------------- 阶段测验

{
  const mkCand = (i, deck, type) => ({
    cardId: `c${i}`,
    deckId: deck,
    deckName: deck,
    itemType: type,
    front: type === 'pic' ? `中文${i}` : `w${i}`,
    back: type === 'pic' ? `en${i}` : `b${i}`,
    emoji: type === 'pic' ? '🐱' : undefined,
    en: type === 'pic' ? `en${i}` : undefined,
    reps: 2,
    lapses: i % 3,
  })
  const cands = [
    ...Array.from({ length: 12 }, (_, i) => mkCand(i, 'deckA', 'pic')),
    ...Array.from({ length: 12 }, (_, i) => mkCand(100 + i, 'deckB', 'word')),
    ...Array.from({ length: 12 }, (_, i) => mkCand(200 + i, 'deckC', 'hanzi')),
  ]
  const paper = examM.buildExam(cands, 12)
  eq(paper.length, 12, '应出够题数')
  eq(new Set(paper.map((q) => q.cardId)).size, paper.length, '同一张卡不该出现两次')
  // 每一包都要被考到:只从一包里抽,考的是那一包,不是他的水平
  eq(new Set(paper.map((q) => q.deckId)).size, 3, '三个卡组都应该被考到')
  /*
    w64:测验改成**开放式产出** —— 看图说出来,家长判对错。
    四选一有 25% 蒙对率,而且它测的是「认得出 goat 长什么样」,
    不是「见到山羊能说出 goat」。后者才是我们想知道的。
  */
  for (const q of paper) {
    eq(q.options, undefined, '开放式产出的题不该带选项')
    ok(!!q.answer, '每道题都要有标准答案给家长核对')
    ok(!q.prompt.includes(q.answer), `题面里不能带答案(${q.prompt})`)
    ok(!!q.note, '每道题都要给家长一句判分说明')
  }
  for (const q of paper.filter((x) => x.emoji)) {
    ok(!q.show, '看图题不该同时把答案的字摆出来')
  }
  // 只考学过的 —— 考没教过的东西不是测验,是打击
  eq(examM.buildExam(cands.map((c) => ({ ...c, reps: 0 })), 10).length, 0, '没有学过的卡时不该出卷')

  // 没有不及格 —— 一次考砸就再也不肯考的孩子,后面所有测验都白设
  ok(examM.pickScoreBand(0, 10).stars >= 1, '全错也至少一颗星')
  ok(examM.pickScoreBand(0, 10).title.includes('难'), '最低一档说的是「题难」,不是「你不行」')
  eq(examM.pickScoreBand(10, 10).stars, 5, '全对给五颗星')
  let prevStars = -1
  for (let c = 0; c <= 10; c++) {
    const st = examM.pickScoreBand(c, 10).stars
    ok(st >= prevStars, `答对 ${c} 题的星级不该更低`)
    prevStars = st
  }
  ok(examM.compareWithLast(80, -1).includes('第一次'), '第一次考试要说明这是第一次')
  ok(examM.compareWithLast(90, 70).includes('进步'), '进步明显时要说出来')
  ok(examM.compareWithLast(60, 80).includes('不用在意'), '退步时不该指责')

  const day = 24 * 60 * 60 * 1000
  ok(examM.examDue(0, 'week'), '从没考过时应该提示')
  ok(!examM.examDue(Date.now() - 3 * day, 'week'), '才过三天不该提示周测')
  ok(examM.examDue(Date.now() - 8 * day, 'week'), '过了一周应该提示')
}

// ---------------------------------------------------------------- 线下抽查

{
  const mk = (i, reps, interval) => ({
    cardId: `s${i}`,
    deckId: 'd1',
    deckName: '认识动物',
    itemType: 'pic',
    ask: `🐱 中文${i}`,
    expect: `en${i}`,
    emoji: '🐱',
    reps,
    interval,
  })
  const cands = [
    ...Array.from({ length: 10 }, (_, i) => mk(i, 4, 20 - i)),
    ...Array.from({ length: 10 }, (_, i) => mk(100 + i, 1, 1)),
  ]
  const picked = spot.pickSpotCheck(cands)
  eq(picked.length, spot.SPOT_SIZE, `一次抽查 ${spot.SPOT_SIZE} 个`)
  /*
    抽的必须是**系统最有把握的那些**:抽查的目的不是找出他不会的
    (那些系统已经知道),而是检验系统自己的判断。
  */
  ok(
    picked.every((p) => Number(p.cardId.replace('s', '')) < 100),
    '抽的应该是间隔长、答对多的那些,不是刚学的',
  )
  ok(picked.every((p) => !!p.expect), '每一条都要有「期望他说出什么」')
  eq(spot.pickSpotCheck(cands.filter((c) => c.reps < 2)).length, 0, '没有够格的卡时不该出题')

  const bad = spot.scoreSpotCheck(1, 5)
  eq(bad.rate, 20, '算得出真实掌握率')
  ok(bad.note.includes('蒙'), '低分要解释原因,而不是只给评价')
  ok(bad.note.includes('跟我读'), '低分要给出下一步做什么')
  ok(spot.scoreSpotCheck(5, 5).note.includes('真的'), '高分要点明「屏幕上的成绩是真的」')

  const day = 24 * 60 * 60 * 1000
  ok(spot.spotDue(0), '从没抽查过时应该提示')
  ok(!spot.spotDue(Date.now() - 3 * day), '才过三天不该提示')
  ok(spot.spotDue(Date.now() - 8 * day), '过了一周应该提示')
}

// ---------------------------------------------------------------- 内容顺序

{
  const mkP = (key, total, mastered, installed = true) => ({ key, installed, total, mastered })
  const none = syl.adviseSyllabus([])
  eq(none.nextKey, syl.TODDLER_SYLLABUS[0].key, '什么都没装时推荐第一包')
  ok(none.note.includes('一批一批'), '要说清楚「一批一批来」比一次全装有效')

  /*
    同时在学的包不超过 4 个 —— 超了就不再推荐新的,
    否则又回到「六百个词平摊」那个老问题。
  */
  const many = syl.adviseSyllabus([
    mkP('enlight-family', 30, 1),
    mkP('enlight-animals', 30, 1),
    mkP('enlight-food', 30, 1),
    mkP('enlight-body', 30, 1),
  ])
  eq(many.nextKey, undefined, '同时在学四包时不该再推荐新的')
  ok(many.note.includes('偏多'), '要提醒家长手上的包已经偏多')

  const done = syl.adviseSyllabus([mkP('enlight-family', 30, 27)])
  ok(done.nextKey && done.nextKey !== 'enlight-family', '练熟了就该推荐下一包')
  ok(!!done.nextWhy, '推荐要带理由')

  /*
    字母和自然拼读排在最后。对 4–6 岁来说先积累口语词汇再学拼读效果好得多:
    拼读的意义是「把听过的词拼出来」,脑子里没有那些词时,拼读只是背 26 个符号。
  */
  const abc = syl.TODDLER_SYLLABUS.find((x) => x.key === 'enlight-abc')
  const family = syl.TODDLER_SYLLABUS.find((x) => x.key === 'enlight-family')
  ok(abc.batch > family.batch, '字母应该排在生活词汇之后')
  ok(syl.TODDLER_SYLLABUS.every((x) => !!x.why), '每一包都要写清楚为什么排在这里')
  eq(
    new Set(syl.TODDLER_SYLLABUS.map((x) => x.key)).size,
    syl.TODDLER_SYLLABUS.length,
    '顺序表里不该有重复的包',
  )
}

// ---------------------------------------------------------------- 连贯对话

{
  const lines = [
    { speaker: 'bot', text: 'Good morning' },
    { speaker: 'kid', text: 'Good morning' },
    { speaker: 'bot', text: 'How are you' },
    { speaker: 'kid', text: 'I am fine' },
  ]
  const recorded = { 'I am fine': '/voice/fine.mp3' }
  const items = playlist.buildPlaylist(lines, (t) => recorded[t] || '')
  eq(items.length, 4, '四句都要排进去')
  // 没录过的用机器音顶上,不能跳过 —— 跳过整段会缺一半
  ok(items.every((i) => !!i.text), '每一句都要有文本')
  eq(items[3].isOwnVoice, true, '录过的那句要认出是他自己的声音')
  const st = playlist.ownVoiceCount(items)
  ok(st.kid === 2 && st.own === 1, '要能统计「这段里有几句是你自己的声音」')
  // 角色互换:提问和回答是两种能力,提问还更难
  const swapped = playlist.swapRoles(lines)
  eq(swapped[0].speaker, 'kid', '互换后第一句该由孩子说')
  ok(swapped.every((l, i) => l.text === lines[i].text), '互换只换角色,不该动内容')
}

// ---------------------------------------------------------------- 英语口算

{
  const words = ['zero','one','two','three','four','five','six','seven','eight','nine','ten']
  for (let i = 0; i < 200; i++) {
    const c = mathDrill.generateProblem('enCount', 'toddler')
    ok(/^How many /.test(c.text), 'How many 题面要是英文')
    eq(c.visual.groups.reduce((n, g) => n + g.n, 0), c.answer, '图上的个数要等于答案')
    ok(c.visual.groups.every((g) => g.n <= 5), '每行不超过五个')

    const a = mathDrill.generateProblem('enAdd', 'toddler')
    ok(!/[一-龥]/.test(a.text), '英语口算题面里不该出现中文')
    const m = a.text.match(/^(\w+) \w+ plus (\w+) \w+ =$/)
    ok(m, `加法题面格式应可解析:${a.text}`)
    eq(words.indexOf(m[1]) + words.indexOf(m[2]), a.answer, '英文数字之和必须等于答案')

    const sb = mathDrill.generateProblem('enSub', 'toddler')
    const m2 = sb.text.match(/^(\w+) \w+ minus (\w+) \w+ =$/)
    ok(m2, `减法题面格式应可解析:${sb.text}`)
    eq(words.indexOf(m2[1]) - words.indexOf(m2[2]), sb.answer, '英文数字之差必须等于答案')
    ok(sb.answer >= 1, '减法结果至少是 1')
  }
}

// ---------------------------------------------------------------- 数字包表达

{
  const pack = JSON.parse(
    readFileSync(path.join(ROOT, 'src', 'data', 'decks', 'enlight-numbers.json'), 'utf8'),
  )
  const byEn = new Map(pack.cards.map((c) => [c.en, c]))
  /*
    ---- w69:数字卡一律用**数字本身** ----

    原来每个数字配一样实物(1=🍎、2=👟👟、3=🍓🍓🍓……),
    而英语练法里孩子只看得到 emoji。🍎 在食物包里是 apple、
    👟 在衣物包里是 shoes —— 同一张图两个答案;而且每个数字换一种东西,
    「数量」这个共同点被淹没了。序数 🥇 更是「第一」的象征物,不是「第一」本身。
  */
  const DIGITS = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟']
  const NUMWORDS = ['zero','one','two','three','four','five','six','seven','eight','nine','ten']
  NUMWORDS.forEach((w, i) => {
    const card = byEn.get(w)
    ok(card, `数字包应有 ${w}`)
    eq(card.front, String(i), `${w} 的卡面应该是数字 ${i}`)
    eq(card.emoji, DIGITS[i], `${w} 的图应该是数字 ${DIGITS[i]}`)
  })
  for (const c of pack.cards) {
    ok(DIGITS.includes(c.emoji), `数字包里的「${c.front}」用了实物图 ${c.emoji} —— 会和别的内容包撞车`)
  }
  for (const bad of ['first', 'second', 'third', 'a pair']) {
    ok(!byEn.get(bad), `「${bad}」不该在看图数字包里 —— 一张静态图教不了它`)
  }
  ok((byEn.get('zero').say || '').includes('没有'), '零读出来要点明「一个也没有」')
}

rmSync(OUT, { recursive: true, force: true })

if (failed > 0) {
  console.error(`\n自测失败:${failed}/${checks} 项不通过`)
  process.exit(1)
}
console.log(`✅ 自测通过:${checks} 项断言`)
