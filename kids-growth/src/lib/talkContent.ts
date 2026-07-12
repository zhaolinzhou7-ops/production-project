// 英语口语练习内容:剧本式情景对话 / 听力复述句 / 公版英文儿歌。
// 对话为固定剧本(适合幼儿:可预期、可重复);真·AI 自由对话需接大模型 API,后续上云再加。

import type { AgeStage } from '../types'

// ============ 情景对话 ============

export interface DialogTurn {
  /** 机器人说的话 */
  bot: string
  botZh: string
  /** 配图(可选) */
  emoji?: string
  /** 期望孩子回答的句子(评分基准) */
  expect: string
  expectZh: string
}

export interface Dialog {
  key: string
  title: string
  icon: string
  turns: DialogTurn[]
}

export const DIALOGS: Dialog[] = [
  {
    key: 'greeting',
    title: '打招呼',
    icon: '👋',
    turns: [
      { bot: 'Hello!', botZh: '你好!', emoji: '👋', expect: 'Hello', expectZh: '你好' },
      { bot: 'How are you?', botZh: '你好吗?', emoji: '🙂', expect: 'I am fine, thank you', expectZh: '我很好,谢谢' },
      { bot: 'Nice to meet you!', botZh: '很高兴认识你!', emoji: '🤝', expect: 'Nice to meet you too', expectZh: '我也很高兴认识你' },
      { bot: 'Goodbye!', botZh: '再见!', emoji: '👋', expect: 'Goodbye', expectZh: '再见' },
    ],
  },
  {
    key: 'zoo',
    title: '动物园',
    icon: '🦁',
    turns: [
      { bot: 'Look! What is it?', botZh: '看!这是什么?', emoji: '🐼', expect: 'It is a panda', expectZh: '这是一只熊猫' },
      { bot: 'Wow! And what is it?', botZh: '哇!那这是什么?', emoji: '🐘', expect: 'It is an elephant', expectZh: '这是一头大象' },
      { bot: 'What is it? It says woof woof!', botZh: '这是什么?它汪汪叫!', emoji: '🐶', expect: 'It is a dog', expectZh: '这是一只狗' },
      { bot: 'Do you like animals?', botZh: '你喜欢动物吗?', emoji: '🐾', expect: 'Yes, I do', expectZh: '是的,我喜欢' },
    ],
  },
  {
    key: 'food',
    title: '我饿啦',
    icon: '🍎',
    turns: [
      { bot: 'Are you hungry?', botZh: '你饿了吗?', emoji: '😋', expect: 'Yes, I am', expectZh: '是的,我饿了' },
      { bot: 'Do you like apples?', botZh: '你喜欢苹果吗?', emoji: '🍎', expect: 'Yes, I like apples', expectZh: '是的,我喜欢苹果' },
      { bot: 'What is this?', botZh: '这是什么?', emoji: '🍌', expect: 'It is a banana', expectZh: '这是一根香蕉' },
      { bot: 'Here you are!', botZh: '给你!', emoji: '🤲', expect: 'Thank you', expectZh: '谢谢你' },
    ],
  },
  {
    key: 'colors',
    title: '什么颜色',
    icon: '🌈',
    turns: [
      { bot: 'What color is it?', botZh: '这是什么颜色?', emoji: '🔴', expect: 'It is red', expectZh: '是红色' },
      { bot: 'And what color is it?', botZh: '那这是什么颜色?', emoji: '🔵', expect: 'It is blue', expectZh: '是蓝色' },
      { bot: 'What color is a banana?', botZh: '香蕉是什么颜色?', emoji: '🍌', expect: 'It is yellow', expectZh: '是黄色' },
      { bot: 'What color do you like?', botZh: '你喜欢什么颜色?', emoji: '💚', expect: 'I like green', expectZh: '我喜欢绿色' },
    ],
  },
  {
    key: 'numbers',
    title: '数一数',
    icon: '🔢',
    turns: [
      { bot: 'How many ducks?', botZh: '有几只鸭子?', emoji: '🦆🦆', expect: 'Two', expectZh: '两只' },
      { bot: 'How many apples?', botZh: '有几个苹果?', emoji: '🍎🍎🍎', expect: 'Three', expectZh: '三个' },
      { bot: 'How many stars?', botZh: '有几颗星星?', emoji: '⭐⭐⭐⭐⭐', expect: 'Five', expectZh: '五颗' },
      { bot: 'How old are you?', botZh: '你几岁啦?', emoji: '🎂', expect: 'I am four', expectZh: '我四岁(按实际年龄说也算对)' },
    ],
  },
]

// ============ 听力复述句 ============

export interface RetellSentence {
  en: string
  zh: string
}

const RETELL_TODDLER: RetellSentence[] = [
  { en: 'I like cats', zh: '我喜欢猫' },
  { en: 'The dog is big', zh: '这只狗很大' },
  { en: 'It is a red apple', zh: '这是一个红苹果' },
  { en: 'I can jump', zh: '我会跳' },
  { en: 'This is my mom', zh: '这是我妈妈' },
  { en: 'Good morning', zh: '早上好' },
  { en: 'I see two birds', zh: '我看见两只鸟' },
  { en: 'The fish is small', zh: '这条鱼很小' },
  { en: 'I love you', zh: '我爱你' },
  { en: 'I want milk', zh: '我想喝牛奶' },
  { en: 'The cat is sleeping', zh: '猫在睡觉' },
  { en: 'Let us play', zh: '我们一起玩吧' },
]

const RETELL_OLDER: RetellSentence[] = [
  { en: 'There are three birds in the tree', zh: '树上有三只鸟' },
  { en: 'I go to school by bus', zh: '我坐公交车上学' },
  { en: 'My favorite color is blue', zh: '我最喜欢的颜色是蓝色' },
  { en: 'She is reading a book', zh: '她正在读一本书' },
  { en: 'We play football after school', zh: '放学后我们踢足球' },
  { en: 'The sun rises in the east', zh: '太阳从东方升起' },
  { en: 'I have breakfast at seven', zh: '我七点吃早饭' },
  { en: 'He is taller than me', zh: '他比我高' },
  { en: 'It is raining outside', zh: '外面正在下雨' },
  { en: 'I want to be a doctor', zh: '我想成为一名医生' },
  { en: 'My mother is cooking dinner', zh: '妈妈正在做晚饭' },
  { en: 'Please open the window', zh: '请打开窗户' },
]

export function retellSentencesFor(stage: AgeStage): RetellSentence[] {
  return stage === 'toddler' ? RETELL_TODDLER : RETELL_OLDER
}

// ============ 英文儿歌(公有领域传统童谣) ============

export interface Rhyme {
  key: string
  title: string
  titleZh: string
  icon: string
  lines: string[]
}

export const RHYMES: Rhyme[] = [
  {
    key: 'twinkle',
    title: 'Twinkle Twinkle Little Star',
    titleZh: '一闪一闪小星星',
    icon: '⭐',
    lines: [
      'Twinkle, twinkle, little star',
      'How I wonder what you are',
      'Up above the world so high',
      'Like a diamond in the sky',
      'Twinkle, twinkle, little star',
      'How I wonder what you are',
    ],
  },
  {
    key: 'rain',
    title: 'Rain Rain Go Away',
    titleZh: '雨啊雨快走开',
    icon: '🌧️',
    lines: [
      'Rain, rain, go away',
      'Come again another day',
      'Little children want to play',
      'Rain, rain, go away',
    ],
  },
  {
    key: 'row',
    title: 'Row Row Row Your Boat',
    titleZh: '划呀划小船',
    icon: '🚣',
    lines: [
      'Row, row, row your boat',
      'Gently down the stream',
      'Merrily, merrily, merrily, merrily',
      'Life is but a dream',
    ],
  },
  {
    key: 'baabaa',
    title: 'Baa Baa Black Sheep',
    titleZh: '咩咩黑绵羊',
    icon: '🐑',
    lines: [
      'Baa, baa, black sheep',
      'Have you any wool?',
      'Yes sir, yes sir',
      'Three bags full',
      'One for the master',
      'One for the dame',
      'And one for the little boy',
      'Who lives down the lane',
    ],
  },
  {
    key: 'spider',
    title: 'Itsy Bitsy Spider',
    titleZh: '小小蜘蛛',
    icon: '🕷️',
    lines: [
      'The itsy bitsy spider climbed up the water spout',
      'Down came the rain and washed the spider out',
      'Out came the sun and dried up all the rain',
      'And the itsy bitsy spider climbed up the spout again',
    ],
  },
]
