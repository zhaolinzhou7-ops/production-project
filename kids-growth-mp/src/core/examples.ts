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
  /**
   * **球类和棋类** —— 只有这一类能跟 play:I like soccer. / Let's play soccer.
   *
   * 英语里「做某项运动」有三个动词,配错了母语者一听就出戏:
   * play + 球类/棋类、go + -ing 的户外项目、do + 武术体操。
   * 原先所有运动都套 play,于是出现了 "Let's play swimming."
   * ——这是中文「玩游泳」直译过来的味道,而这个 app 是他唯一的英语来源。
   */
  | 'playSport'
  /** go + -ing 的项目:I like swimming. / Let's go swimming. */
  | 'goSport'
  /** do + 武术体操:I like karate. / Let's do karate. */
  | 'doSport'
  /** 数字:three apples / I have three apples.(1 要走单数) */
  | 'number'
  /** 字母:A is for Apple. */
  | 'letter'
  /**
   * 世上只有一个的东西:the sun / Look at the sun!
   * 不给 a,也不给复数 —— "two suns" 是明确的错。
   */
  | 'uniqueThing'
  /** 季节:in spring / I like spring.(不说 a spring) */
  | 'season'
  /**
   * 摸不到的身体部位(heart / brain / bone)。
   * 和 bodyNoun 的差别只有一条:**不给「Touch your …」** ——
   * 让孩子去摸自己的心脏或骨头,是一句说不通的话。
   */
  | 'innerBody'

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
  'enlight-sports': 'playSport',
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
  /*
    fire 原先归不可数,于是出了 "some fire" —— 这个说法不存在。
    这里指的是「一堆火」,英语里是可数的:a fire / Look at the fire!
  */
  fire: 'countNoun',
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
  /*
    lightning 语法上确实不可数,但 "some lightning" 母语者不会说 ——
    闪电不是能盛出来一些的东西。这个词只在「看!打闪了」这种场合出现,
    而那句话已经超出这套句型能安全生成的范围。按规矩:拿不准就不出。
  */
  lightning: null,
  ice: 'massThing',
  dew: null,
  peas: 'pluralThing',
  /*
    noodles / stairs 是**只有复数形式**的词。
    原先按可数名词处理,生成了 "a noodles"、"The noodles is here."、
    "two noodleses"、"two stairses" —— 四个错法凑齐了。
  */
  noodles: 'pluralThing',
  stairs: null,
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
  /*
    季节不说 a spring —— "I see a summer." 是句谁都不会说的话。
    季节的固定搭配是 in spring / I like spring.
  */
  spring: 'season',
  summer: 'season',
  autumn: 'season',
  winter: 'season',

  /*
    ---- 世上只有一个的东西 ----
    原先归可数名词,于是出现了 "two suns"、"two moons"、"I see a sea."。
    "two suns" 不是不地道,是**错**。
  */
  sun: 'uniqueThing',
  moon: 'uniqueThing',
  sea: 'uniqueThing',
  sky: 'uniqueThing',

  /*
    ---- 运动:play / go / do 三种搭配 ----
    英语里选哪个动词由项目本身决定,配错了非常刺耳。
    球类棋类 → play;-ing 的户外项目 → go;武术体操 → do。
  */
  swimming: 'goSport',
  running: 'goSport',
  cycling: 'goSport',
  skating: 'goSport',
  skiing: 'goSport',
  climbing: 'goSport',
  surfing: 'goSport',
  rowing: 'goSport',
  fishing: 'goSport',
  bowling: 'goSport',
  dancing: 'goSport',
  diving: 'goSport',
  karate: 'doSport',
  gymnastics: 'doSport',
  weightlifting: 'doSport',
  archery: 'doSport',
  boxing: 'doSport',

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
  /*
    police 不是一个可数的职业单数。原先生成了
    "a police / This is a police. / I want to be a police." ——
    这是最典型的一条中式英语,而这个 app 是他唯一的英语来源,
    错一条就是把错的教进去。正确的词是 police officer(见 PHRASE_FORM)。
  */
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
  /*
    student 归职业会出 "I want to be a student." —— 他现在就是学生,
    这句话逻辑上说不通。改走可数名词:a student / I see a student.
  */
  student: 'countNoun',

  // ---- 身体/家人里的特例 ----
  'left hand': null,
  twins: null,
  family: 'countNoun',
  friend: 'personNoun',
  /*
    摸不到的部位单独一类:只给「这是我的心脏」,不给「摸摸你的心脏」。
    原先 heart/bone 走 bodyNoun,生成了 "Touch your heart." "Touch your bone." ——
    一句说不通的话,孩子照着做只会一脸茫然。
  */
  brain: 'innerBody',
  heart: 'innerBody',
  bone: 'innerBody',
  tummy: 'bodyNoun',
  beard: 'countNoun',
  /*
    牙和指甲在英语里习惯用复数说:brush your teeth / cut your nails。
    单数 "Touch your tooth." 语法没错,但没人这么说。
    这两个词的卡面是单数,例句要用复数形 —— 交给 PHRASE_FORM。
  */
  tooth: 'bodyNoun',
  nail: 'bodyNoun',
  fist: null,

  /*
    ---- 天气包里套不进「It is …」的 ----
    drizzle 和 storm 是名词,不是形容词:"It is drizzle." / "It is storm."
    都是错句。正确说法(It is drizzling. / There is a storm.)已经超出
    这套句型能安全生成的范围 —— 按规矩:拿不准就不出。
  */
  drizzle: null,
  storm: null,

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
  /*
    touched(被感动)对 4 岁半是超纲词,而且和「摸」同形 ——
    他刚在身体包里学过 "Touch your nose",这里再来个 "I am touched.",
    只会把两个意思搅在一起。
    quiet 是可以形容人,但 "I am quiet." 不是日常会说的话,
    真正常用的是 "Be quiet." —— 不是这套句型能出的。
  */
  touched: null,
  quiet: null,

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
  /*
    ---- 下面这些原先都被规则算错了 ----

    `[^aeiou]o$ → oes` 这条规则对 tomato/potato/volcano 是对的,
    但对**外来缩略词**是错的:rhino/hippo/photo 一律只加 s。
  */
  rhino: 'rhinos',
  hippo: 'hippos',
  'yo-yo': 'yo-yos',
  // -f/-fe → -ves:scarf 和 bookshelf 漏在表外,出了 scarfs / bookshelfs
  scarf: 'scarves',
  bookshelf: 'bookshelves',
  // 鱼类单复同形(fish 已在表内,这几个同理)—— 原先出了 jellyfishes
  jellyfish: 'jellyfish',
  starfish: 'starfish',
  blowfish: 'blowfish',
  swordfish: 'swordfish',
  shrimp: 'shrimp',
  // 缩写词的复数不能把大写弄丢:TV → TVs,不是 tvs
  tv: 'TVs',
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

/**
 * 复数形式。
 *
 * ⚠️ 这个函数只在**确定这个词可数**时才该被调用。
 * 只有复数形式的词(noodles / stairs / pants)不该走到这里 ——
 * 它们在 OVERRIDES 里已经被拦掉了。
 */
export function pluralOf(word: string): string {
  const w = word.toLowerCase()
  if (w in IRREGULAR_PLURAL) return IRREGULAR_PLURAL[w]
  // 多词短语只变最后一个词:maple leaf → maple leaves(整表命中优先)
  const sp = w.lastIndexOf(' ')
  if (sp > 0) {
    const head = word.slice(0, sp + 1)
    return head + pluralOf(word.slice(sp + 1))
  }
  if (/(s|x|z|ch|sh)$/.test(w)) return `${word}es`
  if (/[^aeiou]y$/.test(w)) return `${word.slice(0, -1)}ies`
  if (/[^aeiou]o$/.test(w)) return `${word}es`
  return `${word}s`
}

/**
 * 例句里该用的词形。
 *
 * 有些词**卡面是一个形,句子里得换一个形**:
 * · police 在句子里必须是 police officer(a police 是错的)
 * · tooth / nail 在日常说法里用复数(brush your teeth,不是 touch your tooth)
 *
 * 卡面不动 —— 卡面要和图、和他听到的读音对得上;只有例句换形。
 */
const PHRASE_FORM: Record<string, string> = {
  police: 'police officer',
  tooth: 'teeth',
  nail: 'nails',
  // 骨头也一样:没人说 "my bone",说的是 "my bones"
  bone: 'bones',
  /*
    subway 单说指的是「地铁系统/线路」——"I see a subway." 母语者不会这么说
    (看得见的是车或站)。卡面保持 subway,例句里说 subway train。
  */
  subway: 'subway train',
}

/**
 * 缩写词在例句里**不能被小写掉**。
 *
 * 例句一律转小写是对的(卡面 "Apple" 在句子里就该是 "an apple"),
 * 但缩写是例外:"a tv" 看着就是个错字。
 * 判据是「整词全大写且不止一个字母」—— 这类词只可能是缩写。
 */
function keepCase(raw: string): boolean {
  const t = raw.trim()
  return t.length >= 2 && t === t.toUpperCase() && /[A-Z]/.test(t)
}

/** 例句里用的形式(默认就是词本身,缩写保持大写) */
export function phraseFormOf(word: string): string {
  const raw = String(word ?? '').trim()
  const w = raw.toLowerCase()
  if (w in PHRASE_FORM) return PHRASE_FORM[w]
  return keepCase(raw) ? raw : w
}

/**
 * 这个例句形是不是复数 —— 决定说 This is 还是 These are。
 *
 * ⚠️ 不能只看结尾有没有 s:teeth 是复数却不带 s,glass 带 s 却是单数。
 * 用一张明确的表,是这个文件「拿不准就不出」那条规矩的一贯做法。
 */
const PLURAL_PHRASE = new Set(['teeth', 'nails', 'bones', 'feet', 'hands', 'eyes', 'ears'])

function isPluralPhrase(w: string): boolean {
  return PLURAL_PHRASE.has(w)
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
  // 卡面是一个形、句子里换一个形的少数词(police → police officer)
  const w = phraseFormOf(raw)

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
      /*
        第三句原先是 "The cat is here." —— 语法没错,但没人这么教。
        换成 "Look at the cat!":这是绘本里出现最多的一句,
        而且它是**祈使句**,和前面的 "I see …" 不是同一个结构 ——
        三条例句给三种句式,比给三条同样的句子有用得多。
      */
      return [`${a} ${w}`, `I see ${a} ${w}.`, `Look at the ${w}!`]
    }
    case 'massFood':
      return [`some ${w}`, `I like ${w}.`, `I want some ${w}, please.`]
    case 'massThing':
      return [`some ${w}`, `Look at the ${w}.`]
    case 'bodyNoun': {
      // 身体部位最好的例句是**能做出动作**的那种 —— 说完就能摸一下
      // 复数形(teeth / nails)要说 These are,不是 This is
      const plural = isPluralPhrase(w)
      return [`my ${w}`, `${plural ? 'These are' : 'This is'} my ${w}.`, `Touch your ${w}.`]
    }
    case 'innerBody': {
      // 摸不到的部位:只认,不做动作
      const plural = isPluralPhrase(w)
      return [`my ${w}`, `${plural ? 'These are' : 'This is'} my ${w}.`]
    }
    case 'uniqueThing':
      // 世上只有一个 —— 不给 a,也不给复数
      return [`the ${w}`, `Look at the ${w}!`, `I can see the ${w}.`]
    case 'season':
      // 季节的固定搭配是 in spring,不是 a spring
      return [`in ${w}`, `I like ${w}.`]
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
    /*
      运动的三种搭配。配错了母语者一听就出戏,而且这是中文直译最容易踩的坑:
      「玩游泳」→ "play swimming"。
    */
    case 'playSport':
      return [`I like ${w}.`, `Let's play ${w}.`]
    case 'goSport':
      return [`I like ${w}.`, `Let's go ${w}.`]
    case 'doSport':
      return [`I like ${w}.`, `Let's do ${w}.`]
    case 'number': {
      /*
        数字后面配一个他一定认得的名词,让「几个」落到实处。

        ⚠️ 1 必须走单数。原先一律加 s,于是第一张数字卡上写着
        "one apples / I have one apples." —— 数字包本来就是教「几个」的,
        在这里出单复数错误,等于把要教的东西教反了。
        零不出例句:"zero apples" 语法对,但没人这么说,
        而「一个也没有」的正确说法(no apples / I don't have any apples)
        超出这套句型能安全生成的范围。
      */
      if (w === 'zero') return []
      const noun = w === 'one' ? 'apple' : 'apples'
      return [`${w} ${noun}`, `I have ${w} ${noun}.`]
    }
    default:
      return []
  }
}

/**
 * 复数形式的组词,可数名词卡上额外给一条(two cats)。
 *
 * 只给可数名词 —— 唯一物(the sun)、季节、不可数、只有复数形的词
 * 都不该出现在这里,"two suns" 是明确的错。
 */
export function pluralPhrase(word: string, packKey: string): string | undefined {
  if (classOf(word, packKey) !== 'countNoun') return undefined
  return `two ${pluralOf(phraseFormOf(word))}`
}
