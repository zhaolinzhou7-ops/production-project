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
  'mathDrill',
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
const mathDrill = await load('mathDrill')

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

{
  let checked = 0
  for (let i = 0; i < 400; i++) {
    for (const kind of ['add', 'sub', 'mulTable']) {
      const p = mathDrill.generateProblem(kind, 'toddler')
      if (!p.visual) continue
      checked += 1
      const total = p.visual.groups.reduce((n, g) => n + g.n, 0)
      ok(total > 0 && total <= 20, '图示总数要在 20 个以内,多了孩子数不清')
      eq(p.visual.ops.length, Math.max(0, p.visual.groups.length - 1), '连接符个数比组数少一个')
      // 图上的东西数出来就是答案 —— 数得出来才叫数形结合
      if (kind === 'add' || kind === 'mulTable') eq(total, p.answer, `${kind}:图上的总数应等于答案`)
      if (kind === 'sub') eq(total - (p.visual.strike || 0), p.answer, 'sub:减掉划去的应等于答案')
    }
  }
  ok(checked > 500, `应抽查到足够多的带图算式(实际 ${checked})`)
}

rmSync(OUT, { recursive: true, force: true })

if (failed > 0) {
  console.error(`\n自测失败:${failed}/${checks} 项不通过`)
  process.exit(1)
}
console.log(`✅ 自测通过:${checks} 项断言`)
