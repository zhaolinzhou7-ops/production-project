/**
 * 例句生成 —— 单词学完之后给 1–3 条「组词 / 短语 / 句子」。
 *
 * 为什么要有:孤立地背单词是效率最低的一种学法。孩子记住 "apple = 苹果"
 * 之后并不会用它 —— 他没见过这个词待在句子里的样子。而 **"an apple" →
 * "I see an apple." → "The apple is red."** 这一串,才是他真正能开口说的东西。
 *
 * 为什么是生成而不是一条条写:光启蒙包就有 600 多个词,手写例句既写不完,
 * 也一定会写错几条。所以做成「词类 + 规则」:每个词标一个语法类别,
 * 例句按类别的固定句型套出来 —— 句型是我写死的,一定是对的。
 *
 * **拿不准就不出。** 这是这个文件最重要的一条规矩:
 * 判断不了词类的词返回空数组,界面上就不显示例句。
 * 对一个把这套系统当作唯一英语来源的孩子来说,
 * **少一条例句没有任何损失,错一条例句是在教错。**
 */

export type WordClass =
  /** 可数名词:a cat / two cats / I see a cat. */
  | 'countNoun'
  /** 不可数的**食物**:some rice / I like rice. / I want some rice, please. */
  | 'massFood'
  /** 不可数的**东西**:some grass / Look at the grass. */
  | 'massThing'
  /** 身体部位:my hand / This is my hand. / Touch your hand. */
  | 'bodyNoun'
  /** 只有复数形式的穿戴物:my shoes / Where are my shoes?(pants、scissors 这类) */
  | 'pluralWear'
  /** 复数形式的东西:some peas / I like peas. */
  | 'pluralThing'
  /** 家人/朋友:my mom / This is my mom. / I love my mom. */
  | 'personNoun'
  /** 职业:a doctor / This is a doctor. / I want to be a doctor. */
  | 'jobNoun'
  /** 形容物的形容词:It is red. / a red car */
  | 'adjThing'
  /** 形容人的形容词:I am happy. / Are you happy? */
  | 'adjPerson'
  /** 动词:I can run. / Let's run! */
  | 'verb'
  /** 活动/球类:I like soccer. / Let's play soccer. */
  | 'activity'
  /** 数字:three apples / I have three apples. */
  | 'number'
  /** 字母:A is for Apple. */
  | 'letter'

/** 每个内容包的**默认**词类;个别词由 OVERRIDES 覆盖 */
const PACK_CLASS: Record<string, WordClass> = {
  'enlight-abc': 'letter',
  'enlight-actions': 'verb',
  'enlight-animals': 'countNoun',
  'enlight-body': 'bodyNoun',
  'enlight-clothes': 'countNoun',
  'enlight-colors': 'adjThing',
  'enlight-family': 'personNoun',
  'enlight-feelings': 'adjPerson',
  'enlight-food': 'countNoun',
  'enlight-home': 'countNoun',
  'enlight-nature': 'countNoun',
  'enlight-numbers': 'number',
  'enlight-school': 'countNoun',
  'enlight-sea': 'countNoun',
  'enlight-shapes': 'countNoun',
  'enlight-sports': 'activity',
  'enlight-transport': 'countNoun',
  'enlight-weather': 'adjThing',
  'phonics-cvc': 'countNoun',
}

/**
 * 个别词的覆盖。
 *
 * 这张表就是「拿不准就不出」那条规矩的成本:每一条都是我确认过的。
 * 值为 null 表示**这个词不出例句** —— 通常是因为它是个说明性的词组
 * (「深绿色」「一双」),套进任何句型都别扭。
 */
const OVERRIDES: Record<string, WordClass | null> = {
  // ---- 不可数:食物与自然物 ----
  rice: 'massFood',
  bread: 'massFood',
  milk: 'massFood',
  water: 'massFood',
  honey: 'massFood',
  soup: 'massFood',
  cheese: 'massFood',
  chocolate: 'massFood',
  juice: 'massFood',
  candy: 'massFood',
  corn: 'massFood',
  lettuce: 'massFood',
  broccoli: 'massFood',
  salad: 'massFood',
  'ice cream': 'massFood',
  garlic: 'massFood',
  jam: 'massFood',
  ham: 'massFood',
  grass: 'massThing',
  rain: 'massThing',
  fire: 'massThing',
  hair: 'bodyNoun',
  blood: null,
  sweat: null,
  bamboo: 'massThing',
  wheat: 'massThing',
  coral: 'massThing',
  seaweed: 'massThing',
  paper: 'massThing',
  glue: 'massThing',
  soap: 'massThing',
  homework: null,
  thunder: null,
  lightning: 'massThing',
  ice: 'massThing',
  dew: null,
  peas: 'pluralThing',
  tears: null,
  lungs: null,
  grapes: 'pluralThing',
  'fallen leaves': 'pluralThing',
  bubbles: 'pluralThing',
  hands: null,

  // ---- 只有复数形式的衣物/工具 ----
  pants: 'pluralWear',
  shoes: 'pluralWear',
  boots: 'pluralWear',
  socks: 'pluralWear',
  gloves: 'pluralWear',
  glasses: 'pluralWear',
  shorts: 'pluralWear',
  pajamas: 'pluralWear',
  slippers: 'pluralWear',
  sandals: 'pluralWear',
  'high heels': 'pluralWear',
  scissors: 'pluralWear',

  // ---- 颜色包里其实不是颜色的 ----
  rainbow: 'countNoun',
  gold: 'massThing',
  silver: 'massThing',
  'sky blue': null,
  'navy blue': null,
  'light green': null,
  'dark green': null,
  'dark red': null,

  // ---- 天气包里其实是名词的 ----
  tornado: 'countNoun',
  breeze: 'countNoun',
  sunrise: 'countNoun',
  sunset: 'countNoun',
  'full moon': 'countNoun',
  'starry sky': 'countNoun',
  spring: 'countNoun',
  summer: 'countNoun',
  autumn: 'countNoun',
  winter: 'countNoun',

  // ---- 运动包里其实是玩具(可数)的 ----
  blocks: 'pluralWear',
  puzzle: 'countNoun',
  doll: 'countNoun',
  kite: 'countNoun',
  balloon: 'countNoun',
  'teddy bear': 'countNoun',
  'puzzle cube': 'countNoun',
  'yo-yo': 'countNoun',
  'jump rope': 'countNoun',
  skateboard: 'countNoun',
  frisbee: 'countNoun',
  medal: 'countNoun',

  // ---- 职业:说「我的医生」很怪,「我想当医生」才是这个年纪会说的话 ----
  teacher: 'jobNoun',
  doctor: 'jobNoun',
  nurse: 'jobNoun',
  police: 'jobNoun',
  firefighter: 'jobNoun',
  farmer: 'jobNoun',
  cook: 'jobNoun',
  driver: 'jobNoun',
  astronaut: 'jobNoun',
  scientist: 'jobNoun',
  singer: 'jobNoun',
  painter: 'jobNoun',
  judge: 'jobNoun',
  mechanic: 'jobNoun',
  builder: 'jobNoun',
  'office worker': 'jobNoun',
  dancer: 'jobNoun',
  athlete: 'jobNoun',
  'mail carrier': 'jobNoun',
  barber: 'jobNoun',
  magician: 'jobNoun',
  student: 'jobNoun',

  // ---- 身体/家人里的特例 ----
  'left hand': null,
  twins: null,
  family: 'countNoun',
  friend: 'personNoun',
  brain: 'countNoun',
  tummy: 'countNoun',
  beard: 'countNoun',

  // ---- CVC 包里不是名词的 ----
  sad: 'adjPerson',
  red: 'adjThing',
  hot: 'adjThing',
  run: 'verb',
  cut: 'verb',
  hug: 'verb',
  zip: 'verb',
  nap: null,
  six: 'number',
  ten: 'number',

  // ---- 数字包里不是数字的 ----
  zero: 'number',
  first: null,
  second: null,
  third: null,
  'a pair': null,

  // ---- 学校/家居里的抽象词 ----
  school: 'countNoun',
  test: 'countNoun',
  'test paper': 'countNoun',
  library: 'countNoun',
  'sticky note': 'countNoun',
  certificate: 'countNoun',

  // ---- 感受包里其实是动作的 ----
  love: null,
  laughing: null,
  crying: null,

  // ---- 动作包里其实不好套句型的 ----
  share: 'verb',
}

/** 不规则复数 —— 规则加 s 会出错的那些 */
const IRREGULAR_PLURAL: Record<string, string> = {
  mouse: 'mice',
  tooth: 'teeth',
  foot: 'feet',
  goose: 'geese',
  child: 'children',
  person: 'people',
  man: 'men',
  woman: 'women',
  fish: 'fish',
  sheep: 'sheep',
  deer: 'deer',
  leaf: 'leaves',
  knife: 'knives',
  shelf: 'shelves',
  wolf: 'wolves',
  half: 'halves',
  'maple leaf': 'maple leaves',
  'tropical fish': 'tropical fish',
  'sea turtle': 'sea turtles',
}

/** 元音开头 → an;规则之外的靠这张表(hour/umbrella/university…) */
const AN_EXCEPTIONS: Record<string, boolean> = {
  umbrella: true,
  hour: true,
  uniform: false,
  university: false,
  'x-ray': true, // 读作 ex-ray
  'yo-yo': false,
}

function isVowelStart(word: string): boolean {
  const w = word.toLowerCase()
  if (w in AN_EXCEPTIONS) return AN_EXCEPTIONS[w]
  return 'aeiou'.indexOf(w[0]) >= 0
}

/** a / an */
export function articleFor(word: string): string {
  return isVowelStart(word) ? 'an' : 'a'
}

/** 复数形式 */
export function pluralOf(word: string): string {
  const w = word.toLowerCase()
  if (w in IRREGULAR_PLURAL) return IRREGULAR_PLURAL[w]
  if (/(s|x|z|ch|sh)$/.test(w)) return `${word}es`
  if (/[^aeiou]y$/.test(w)) return `${word.slice(0, -1)}ies`
  if (/[^aeiou]o$/.test(w)) return `${word}es`
  return `${word}s`
}

/** 这个词属于哪一类;判断不了返回 undefined */
export function classOf(word: string, packKey: string): WordClass | undefined {
  const w = String(word ?? '').trim().toLowerCase()
  if (!w) return undefined
  if (w in OVERRIDES) return OVERRIDES[w] ?? undefined
  const base = PACK_CLASS[packKey]
  if (!base) return undefined
  // 字母卡的卡面是「A a」,天生带空格,不能被下面的多词规则挡掉
  if (base === 'letter') return 'letter'
  /*
    多词短语在没有明确登记时一律不出例句。
    "hot air balloon" 套 "a hot air balloon" 是对的,但 "sky blue" 套什么都不对 ——
    分不清的时候,宁可不出。
  */
  if (w.indexOf(' ') >= 0 && !(w in OVERRIDES)) {
    // 名词类的多词短语按可数名词处理是安全的(a school bus / a fire truck)
    if (base === 'countNoun') return 'countNoun'
    return undefined
  }
  return base
}

/**
 * 给一个词的 1–3 条例句:**先短语,后句子**。
 *
 * 顺序是有讲究的:短语最短、最好模仿,孩子第一遍就能跟上;
 * 句子放后面,是给他「这个词能怎么用」的样子。
 *
 * `topic` 是这张卡的图所表示的东西(abc 包里 A 对应 Apple),
 * 只有字母类用得上。
 */
export function examplesFor(word: string, packKey: string, topic?: string): string[] {
  const raw = String(word ?? '').trim()
  if (!raw) return []
  const cls = classOf(raw, packKey)
  if (!cls) return []
  const w = raw.toLowerCase()

  switch (cls) {
    case 'letter': {
      const t = String(topic ?? '').trim()
      if (!t) return []
      // A a → "A"; 取首字母,句型是英文字母教学里最标准的那一句
      const letter = raw.trim()[0].toUpperCase()
      return [`${letter} is for ${t}.`, `${letter}, ${letter.toLowerCase()}, ${t}.`]
    }
    case 'countNoun': {
      const a = articleFor(w)
      return [`${a} ${w}`, `I see ${a} ${w}.`, `The ${w} is here.`]
    }
    case 'massFood':
      return [`some ${w}`, `I like ${w}.`, `I want some ${w}, please.`]
    case 'massThing':
      return [`some ${w}`, `Look at the ${w}.`]
    case 'bodyNoun':
      // 身体部位最好的例句是**能做出动作**的那种 —— 说完就能摸一下
      return [`my ${w}`, `This is my ${w}.`, `Touch your ${w}.`]
    case 'pluralWear':
      return [`my ${w}`, `I like my ${w}.`, `Where are my ${w}?`]
    case 'pluralThing':
      return [`some ${w}`, `I like ${w}.`]
    case 'personNoun':
      return [`my ${w}`, `This is my ${w}.`, `I love my ${w}.`]
    case 'jobNoun': {
      const a = articleFor(w)
      return [`${a} ${w}`, `This is ${a} ${w}.`, `I want to be ${a} ${w}.`]
    }
    case 'adjThing':
      return [`It is ${w}.`, `Look! It is ${w}.`]
    case 'adjPerson':
      return [`I am ${w}.`, `Are you ${w}?`, `He is ${w}.`]
    case 'verb':
      return [`I can ${w}.`, `Let's ${w}!`, `Can you ${w}?`]
    case 'activity':
      return [`I like ${w}.`, `Let's play ${w}.`]
    case 'number':
      // 数字后面配一个孩子一定认得的名词,让「几个」这件事落到实处
      return [`${w} apples`, `I have ${w} apples.`]
    default:
      return []
  }
}

/** 复数形式的组词,数字/可数名词卡上额外给一条(two cats) */
export function pluralPhrase(word: string, packKey: string): string | undefined {
  if (classOf(word, packKey) !== 'countNoun') return undefined
  return `two ${pluralOf(word.trim().toLowerCase())}`
}
