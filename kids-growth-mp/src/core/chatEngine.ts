import type { DialogLevel } from './talkContent'

/**
 * 本地英语对话引擎 —— 让孩子能「随便说点什么」,而不是照着剧本念。
 *
 * 为什么不接真·大模型:小程序里调大模型必须有服务器中转(密钥不能放前端,
 * 域名也要备案+加白名单),还要按量付费。对一个家庭自用的学习机来说,
 * 这三样都是持续负担。这里用规则引擎做到「看起来像在聊天」——
 * 关键是**回应要贴题、要多变、要能接着往下问**,而不是真的理解语义。
 *
 * 设计上刻意做了四件事,少一件都会露馅:
 *
 * 1. **按关键词识别话题**,不是死记整句。孩子说 "I like dog" 和
 *    "my dog is big" 都该落到「宠物」这个话题上。
 * 2. **同一个话题准备多条回应,轮着用**。重复是最容易被识破的 ——
 *    孩子说两次同样的话得到一模一样的回复,立刻就没兴趣了。
 * 3. **每次回应都带一个追问**。真人聊天是「回应 + 抛回去」,
 *    只回应不追问,三句话就冷场了。
 * 4. **听不懂时不装懂**。规则引擎必然有盖不住的输入,这时候要
 *    自然地把话题拉回来(「我不太确定,那你喜欢什么?」),
 *    而不是硬答一句不相干的。
 */

export interface ChatTopic {
  key: string
  /** 命中这些词就算说到了这个话题(小写匹配) */
  keys: string[]
  /** 机器人的回应,轮着用 */
  replies: string[]
  repliesZh: string[]
  /** 追问,接在回应后面 */
  asks: string[]
  asksZh: string[]
  /**
   * 通用「粘合」话题(是/否/喜欢/不喜欢)。
   *
   * 这类词几乎每句话里都可能出现,但信息量最低。
   * 「I like my dog」如果按最长关键词算,会命中 `i like` 而不是 `dog`,
   * 于是回一句「你为什么喜欢?」—— 不算错,但远不如
   * 「它叫什么名字?」贴题。所以具体话题一律优先于通用话题。
   */
  generic?: boolean
}

/** 开场白:每次进来随机挑一条,不要每次都是同一句 */
export const OPENERS: Array<{ en: string; zh: string }> = [
  { en: 'Hi! I am Robo. What is your name?', zh: '嗨!我是小机器人。你叫什么名字?' },
  { en: 'Hello there! How are you today?', zh: '你好呀!你今天怎么样?' },
  { en: 'Hi! Nice to see you. What did you do today?', zh: '嗨!很高兴见到你。你今天做了什么?' },
  { en: 'Hey! I am Robo. Do you want to talk with me?', zh: '嘿!我是小机器人。想和我聊聊吗?' },
  { en: 'Hello! What are you doing right now?', zh: '你好!你现在在做什么?' },
]

export const TOPICS: ChatTopic[] = [
  {
    key: 'name',
    keys: ['my name', 'i am', 'call me', 'name is'],
    replies: [
      'Nice to meet you!',
      'What a nice name!',
      'Great to meet you!',
    ],
    repliesZh: ['很高兴认识你!', '这名字真好听!', '认识你真好!'],
    asks: ['How old are you?', 'Where do you live?', 'What do you like to do?'],
    asksZh: ['你几岁了?', '你住在哪里?', '你喜欢做什么?'],
  },
  {
    key: 'age',
    keys: ['years old', 'i am five', 'i am six', 'i am seven', 'i am eight', 'my age'],
    replies: [
      'Wow, you are a big kid!',
      'That is a great age!',
      'You are growing up fast!',
    ],
    repliesZh: ['哇,你是大孩子了!', '这个年纪真好!', '你长得真快!'],
    asks: ['Do you go to school?', 'What is your favorite thing to do?', 'Do you have any friends at school?'],
    asksZh: ['你上学了吗?', '你最喜欢做什么?', '你在学校有朋友吗?'],
  },
  {
    key: 'feeling-good',
    keys: ['i am fine', 'i am good', 'i am happy', 'very well', 'i am great', 'so happy'],
    replies: [
      'I am happy to hear that!',
      'That is wonderful!',
      'Great! Me too!',
    ],
    repliesZh: ['听你这么说我真高兴!', '太好了!', '太棒了!我也是!'],
    asks: ['What made you happy today?', 'What are you going to do next?', 'Did something fun happen?'],
    asksZh: ['今天什么事让你开心?', '接下来你要做什么?', '发生什么好玩的事了吗?'],
  },
  {
    key: 'feeling-bad',
    keys: ['i am sad', 'i am tired', 'not good', 'i am angry', 'i am scared', 'not happy'],
    replies: [
      'Oh, I am sorry to hear that.',
      'That sounds hard. I am here with you.',
      'It is okay to feel that way sometimes.',
    ],
    repliesZh: ['哦,听到这个我有点难过。', '这听起来不容易。我陪着你。', '偶尔有这种感觉是正常的。'],
    asks: ['Do you want to tell me what happened?', 'What would make you feel better?', 'Can I help you?'],
    asksZh: ['想跟我说说发生了什么吗?', '做什么能让你好受一点?', '我能帮你吗?'],
  },
  {
    key: 'pet',
    keys: ['dog', 'cat', 'pet', 'puppy', 'kitten', 'rabbit', 'fish', 'bird', 'hamster'],
    replies: [
      'I love animals too!',
      'Animals are so cute!',
      'That sounds like a lovely animal!',
    ],
    repliesZh: ['我也喜欢动物!', '动物太可爱了!', '听起来是只可爱的小动物!'],
    asks: ['What color is it?', 'What is its name?', 'Do you play with it every day?'],
    asksZh: ['它是什么颜色的?', '它叫什么名字?', '你每天都和它玩吗?'],
  },
  {
    key: 'food',
    keys: ['eat', 'food', 'apple', 'rice', 'noodle', 'bread', 'milk', 'cake', 'hungry', 'ice cream', 'banana', 'egg'],
    replies: [
      'Yummy! That sounds delicious!',
      'I like that too!',
      'That is a good choice!',
    ],
    repliesZh: ['好吃!听起来很美味!', '我也喜欢那个!', '选得好!'],
    asks: ['Who cooks it for you?', 'Do you eat it every day?', 'What else do you like to eat?'],
    asksZh: ['谁给你做的?', '你每天都吃吗?', '你还喜欢吃什么?'],
  },
  {
    key: 'color',
    keys: ['red', 'blue', 'green', 'yellow', 'pink', 'black', 'white', 'orange', 'purple', 'color'],
    replies: [
      'That is a beautiful color!',
      'Nice! I like that color too!',
      'What a bright color!',
    ],
    repliesZh: ['这个颜色真漂亮!', '不错!我也喜欢这个颜色!', '多鲜亮的颜色!'],
    asks: ['What else is that color?', 'Is that your favorite color?', 'What color is your bag?'],
    asksZh: ['还有什么是这个颜色的?', '这是你最喜欢的颜色吗?', '你书包是什么颜色的?'],
  },
  {
    key: 'school',
    keys: ['school', 'teacher', 'class', 'homework', 'study', 'classmate', 'book', 'read'],
    replies: [
      'School is a good place to learn!',
      'That sounds interesting!',
      'Learning new things is fun!',
    ],
    repliesZh: ['学校是个学东西的好地方!', '听起来很有意思!', '学新东西很有趣!'],
    asks: ['What subject do you like best?', 'Who is your favorite teacher?', 'Do you have many friends there?'],
    asksZh: ['你最喜欢哪门课?', '你最喜欢哪位老师?', '你在那儿朋友多吗?'],
  },
  {
    key: 'play',
    keys: ['play', 'game', 'toy', 'ball', 'run', 'jump', 'swim', 'ride', 'bike', 'football', 'basketball'],
    replies: [
      'That sounds like so much fun!',
      'Playing is important!',
      'I wish I could play too!',
    ],
    repliesZh: ['听起来太好玩了!', '玩耍很重要!', '真希望我也能一起玩!'],
    asks: ['Who do you play with?', 'Where do you play?', 'When do you usually play?'],
    asksZh: ['你和谁一起玩?', '你在哪里玩?', '你一般什么时候玩?'],
  },
  {
    key: 'family',
    keys: ['mom', 'mother', 'dad', 'father', 'sister', 'brother', 'family', 'grandma', 'grandpa', 'parents'],
    replies: [
      'Family is very important!',
      'That is so nice!',
      'They must love you a lot!',
    ],
    repliesZh: ['家人很重要!', '真好!', '他们一定很爱你!'],
    asks: ['What do you do together?', 'Do you help them at home?', 'Tell me more about them!'],
    asksZh: ['你们一起做什么?', '你在家帮他们做事吗?', '再多说说他们!'],
  },
  {
    key: 'weather',
    keys: ['sunny', 'rain', 'snow', 'cloudy', 'hot', 'cold', 'weather', 'windy', 'warm'],
    replies: [
      'The weather changes every day!',
      'I like that kind of weather!',
      'That sounds nice!',
    ],
    repliesZh: ['天气每天都在变!', '我喜欢这种天气!', '听起来不错!'],
    asks: ['Do you like this weather?', 'What do you wear today?', 'Can you play outside?'],
    asksZh: ['你喜欢这种天气吗?', '你今天穿的什么?', '能出去玩吗?'],
  },
  {
    key: 'like',
    generic: true,
    keys: ['i like', 'i love', 'favorite', 'i want'],
    replies: [
      'That is great!',
      'I can tell you really like it!',
      'Good choice!',
    ],
    repliesZh: ['很好啊!', '看得出你真的很喜欢!', '选得好!'],
    asks: ['Why do you like it?', 'When did you start liking it?', 'What else do you like?'],
    asksZh: ['你为什么喜欢它?', '你什么时候开始喜欢的?', '你还喜欢什么?'],
  },
  {
    key: 'dislike',
    generic: true,
    keys: ['i do not like', 'i dont like', 'i hate', 'boring'],
    replies: [
      'That is okay. Everyone likes different things.',
      'I understand.',
      'It is fine not to like everything!',
    ],
    repliesZh: ['没关系,每个人喜欢的东西不一样。', '我明白。', '不是什么都得喜欢!'],
    asks: ['What do you like instead?', 'Is there something you enjoy more?', 'What makes you happy?'],
    asksZh: ['那你喜欢什么呢?', '有没有你更喜欢的?', '什么让你开心?'],
  },
  {
    key: 'yes',
    generic: true,
    keys: ['yes', 'yeah', 'sure', 'of course', 'i do', 'i can'],
    replies: ['Great!', 'Wonderful!', 'That is good to hear!'],
    repliesZh: ['太好了!', '真棒!', '听到这个真高兴!'],
    asks: ['Can you tell me more?', 'Why is that?', 'What happens next?'],
    asksZh: ['能多说一点吗?', '为什么呢?', '然后呢?'],
  },
  {
    key: 'no',
    generic: true,
    keys: ['no', 'not really', 'i cannot', 'i dont', 'i do not'],
    replies: ['That is okay!', 'No problem!', 'That is fine.'],
    repliesZh: ['没关系!', '没问题!', '这样也挺好。'],
    asks: ['What would you like to talk about?', 'Is there something else?', 'What do you want to do?'],
    asksZh: ['那你想聊点什么?', '有别的吗?', '你想做什么?'],
  },
  {
    key: 'bye',
    keys: ['bye', 'goodbye', 'see you', 'good night'],
    replies: [
      'Goodbye! You did great today!',
      'See you next time! Well done!',
      'Bye bye! I had fun talking with you!',
    ],
    repliesZh: ['再见!你今天表现很棒!', '下次见!做得好!', '拜拜!和你聊天很开心!'],
    asks: ['Come back and talk with me again!', 'See you soon!', 'Have a nice day!'],
    asksZh: ['下次再来和我聊天!', '回头见!', '祝你今天愉快!'],
  },
]

/** 听不懂时的回应 —— 不装懂,自然地把话题拉回来 */
const FALLBACKS: Array<{ en: string; zh: string }> = [
  { en: 'I am not sure I got that. Can you say it again?', zh: '我没太听清,能再说一遍吗?' },
  { en: 'Interesting! Tell me more.', zh: '有意思!再多说点。' },
  { en: 'Hmm, I do not know that one. What do you like to do?', zh: '嗯,这个我不太懂。你喜欢做什么?' },
  { en: 'Okay! What else can you tell me?', zh: '好的!你还能告诉我什么?' },
  { en: 'Sorry, my English is small too. Can you use easier words?', zh: '抱歉,我的英语也不多。能说得简单一点吗?' },
]

export interface ChatReply {
  en: string
  zh: string
  /** 命中的话题(没听懂时是空串),用来避免连着聊同一个话题 */
  topic: string
  /** 是不是没听懂的兜底回应 */
  fallback: boolean
}

export interface ChatState {
  /** 每个话题已经用到第几条回应 —— 保证不重复 */
  used: Record<string, number>
  /** 最近聊过的话题,用来避免绕圈 */
  recent: string[]
  turns: number
}

export function newChatState(): ChatState {
  return { used: {}, recent: [], turns: 0 }
}

function pick<T>(arr: T[], n: number): T {
  return arr[n % arr.length]
}

/** 规范化孩子说的话:小写、去标点,方便做关键词匹配 */
function norm(s: string): string {
  return ` ${String(s || '').toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim()} `
}

/**
 * 找出这句话说的是哪个话题。
 *
 * 匹配的是**词边界**而不是子串 —— 否则 "no" 会命中 "know"、
 * "i do not like" 里的 "no" 也会先命中「否定」话题,答得驴唇不对马嘴。
 * 长关键词优先:"i do not like" 应该胜过单独的 "no"。
 */
export function detectTopic(said: string, state: ChatState): ChatTopic | null {
  const t = norm(said)
  if (t.trim().length === 0) return null

  /** 关键词必须整词命中,不能是子串 —— 否则 "know" 里的 "no" 会命中否定话题 */
  const hits = (k: string): boolean =>
    new RegExp(`(^|\\s)${k.replace(/\s+/g, '\\s+')}(\\s|$)`).test(t)

  // 收集所有命中的话题,长关键词优先:
  // "i do not like" 必须胜过里面那个孤立的 "no",否则答得驴唇不对马嘴。
  const matched: Array<{ topic: ChatTopic; len: number }> = []
  for (const topic of TOPICS) {
    let best = 0
    for (const k of topic.keys) {
      if (hits(k) && k.length > best) best = k.length
    }
    if (best > 0) matched.push({ topic, len: best })
  }
  if (matched.length === 0) return null
  // 先按「具体优先于通用」,同类再按关键词长短
  matched.sort((a, b) => {
    const ga = a.topic.generic ? 1 : 0
    const gb = b.topic.generic ? 1 : 0
    if (ga !== gb) return ga - gb
    return b.len - a.len
  })

  // 刚聊过的话题往后排 —— 连着三轮都在说狗,孩子会腻。
  // 只有在还有别的话题可选时才让位。
  const recent = state.recent.slice(-2)
  const fresh = matched.find((m) => recent.indexOf(m.topic.key) < 0)
  return (fresh ?? matched[0]).topic
}

/**
 * 生成一句回应。
 *
 * 结构固定为「回应 + 追问」—— 真人聊天就是这样:先接住对方说的,
 * 再把球抛回去。只回应不追问,三句话就冷场;只追问不回应,像在审问。
 */
export function respond(said: string, state: ChatState): { reply: ChatReply; next: ChatState } {
  const topic = detectTopic(said, state)
  const turns = state.turns + 1

  if (!topic) {
    const n = state.used.__fb ?? 0
    const fb = pick(FALLBACKS, n)
    return {
      reply: { en: fb.en, zh: fb.zh, topic: '', fallback: true },
      next: { used: { ...state.used, __fb: n + 1 }, recent: state.recent, turns },
    }
  }

  const n = state.used[topic.key] ?? 0
  const en = `${pick(topic.replies, n)} ${pick(topic.asks, n)}`
  const zh = `${pick(topic.repliesZh, n)} ${pick(topic.asksZh, n)}`
  return {
    reply: { en, zh, topic: topic.key, fallback: false },
    next: {
      used: { ...state.used, [topic.key]: n + 1 },
      recent: [...state.recent, topic.key].slice(-5),
      turns,
    },
  }
}

/**
 * 给孩子的「可以这样说」提示。
 *
 * 自由对话最大的门槛是「不知道能说什么」—— 尤其对五六岁的孩子,
 * 给一个空白输入框等于把他晾在那儿。所以每一轮都给三个可以直接照说的句子,
 * 难度跟着档位走。这不是作弊,是脚手架:说顺了自然就不看提示了。
 */
export function suggestions(level: DialogLevel, lastTopic: string): string[] {
  const easy: Record<string, string[]> = {
    '': ['My name is Tom', 'I am five years old', 'I am fine'],
    name: ['I am five years old', 'I like dogs', 'I go to school'],
    age: ['I like to play', 'I have a cat', 'I go to school'],
    pet: ['It is white', 'Its name is Lucky', 'Yes, I play with it'],
    food: ['I like apples', 'My mom cooks it', 'Yes, every day'],
    color: ['My bag is blue', 'Yes, I like red', 'The sky is blue'],
    play: ['I play with my friends', 'I play at home', 'I like ball games'],
    family: ['I love my mom', 'We eat together', 'Yes, I help them'],
    school: ['I like drawing', 'My teacher is nice', 'Yes, many friends'],
    weather: ['Yes, I like it', 'It is sunny today', 'I wear a coat'],
  }
  const harder: Record<string, string[]> = {
    '': ['My name is Tom and I am nine', 'I am doing my homework', 'Today was a good day'],
    name: ['I am in grade three', 'I live near the park', 'I like reading books'],
    age: ['Yes, I go to primary school', 'I like science the most', 'I have two good friends'],
    pet: ['It is a brown puppy', 'We got it last year', 'I walk it every evening'],
    food: ['My grandma cooks the best noodles', 'I eat it twice a week', 'I also love dumplings'],
    color: ['My favorite color is deep blue', 'Because it looks like the sea', 'My room is green'],
    play: ['I play basketball after school', 'We play in the school yard', 'Usually on weekends'],
    family: ['We go to the park on Sundays', 'I help wash the dishes', 'My sister is four years old'],
    school: ['Science is my favorite subject', 'Because we do experiments', 'I have many classmates'],
    weather: ['I like sunny days best', 'I am wearing a jacket', 'Yes, we can play outside'],
  }
  const table = level === 'easy' ? easy : harder
  return table[lastTopic] ?? table['']
}
