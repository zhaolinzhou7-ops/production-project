// 英语口语练习内容:剧本式情景对话 / 听力复述句 / 公版英文儿歌。
// 对话为固定剧本(适合孩子:可预期、可重复);真·AI 自由对话需接大模型 API,后续上云再加。

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
  /**
   * 同样正确的其它说法。
   * 一个问题常有好几个对的答法,只认一个标准答案等于在教背句子。
   * 打分时取所有候选里最高的那个。
   */
  alts?: string[]
}

/**
 * 对话难度三档。
 *
 * easy   入门:4 轮,单句 3–5 词,只问「这是什么 / 你喜欢吗」这类一步就能答的
 * medium 进阶:5 轮,带时间、地点、原因,答句 5–8 词
 * hard   挑战:6 轮,要表达看法、讲一件事、用上从句和时态变化
 *
 * 之所以做成**可手动选**而不是只跟年龄走:同一个孩子听力可能超前、口语落后,
 * 或者某天状态好想挑战一下。把选择权交出去,比替他决定更管用。
 */
export type DialogLevel = 'easy' | 'medium' | 'hard'

export const LEVEL_LABEL: Record<DialogLevel, string> = {
  easy: '入门',
  medium: '进阶',
  hard: '挑战',
}

export const LEVEL_DESC: Record<DialogLevel, string> = {
  easy: '4 轮短句,答一两个词就行',
  medium: '5 轮,会问时间地点和原因',
  hard: '6 轮,要说想法、讲经过',
}

export interface Dialog {
  key: string
  title: string
  icon: string
  level: DialogLevel
  turns: DialogTurn[]
}

export const DIALOGS: Dialog[] = [
  {
    key: 'greeting',
    title: '打招呼',
    icon: '👋',
    level: 'easy',
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
    level: 'easy',
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
    level: 'easy',
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
    level: 'easy',
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
    level: 'easy',
    turns: [
      { bot: 'How many ducks?', botZh: '有几只鸭子?', emoji: '🦆🦆', expect: 'Two', expectZh: '两只' },
      { bot: 'How many apples?', botZh: '有几个苹果?', emoji: '🍎🍎🍎', expect: 'Three', expectZh: '三个' },
      { bot: 'How many stars?', botZh: '有几颗星星?', emoji: '⭐⭐⭐⭐⭐', expect: 'Five', expectZh: '五颗' },
      { bot: 'How old are you?', botZh: '你几岁啦?', emoji: '🎂', expect: 'I am four', expectZh: '我四岁(按实际年龄说也算对)' },
    ],
  },
  {
    key: 'family',
    title: '我的家人',
    icon: '👨‍👩‍👧',
    level: 'easy',
    turns: [
      { bot: 'Who is this?', botZh: '这是谁?', emoji: '👩', expect: 'This is my mom', expectZh: '这是我妈妈' },
      { bot: 'And who is this?', botZh: '那这是谁?', emoji: '👨', expect: 'This is my dad', expectZh: '这是我爸爸' },
      { bot: 'Do you have a brother or a sister?', botZh: '你有兄弟姐妹吗?', emoji: '🧒', expect: 'Yes, I have a sister', expectZh: '有,我有一个姐妹' },
      { bot: 'Do you love your family?', botZh: '你爱你的家人吗?', emoji: '❤️', expect: 'Yes, I love my family', expectZh: '是的,我爱我的家人' },
    ],
  },
  {
    key: 'toys',
    title: '我的玩具',
    icon: '🧸',
    level: 'easy',
    turns: [
      { bot: 'What is your toy?', botZh: '你的玩具是什么?', emoji: '🧸', expect: 'It is a teddy bear', expectZh: '是一只泰迪熊' },
      { bot: 'Is it big or small?', botZh: '它是大的还是小的?', emoji: '📏', expect: 'It is small', expectZh: '它很小' },
      { bot: 'Can I play with you?', botZh: '我可以和你一起玩吗?', emoji: '🤗', expect: 'Yes, you can', expectZh: '可以呀' },
      { bot: 'Let us play together!', botZh: '我们一起玩吧!', emoji: '🎉', expect: 'OK, let us play', expectZh: '好的,一起玩' },
    ],
  },
  {
    key: 'body',
    title: '我的身体',
    icon: '🖐️',
    level: 'easy',
    turns: [
      { bot: 'Where are your eyes?', botZh: '你的眼睛在哪里?', emoji: '👀', expect: 'Here are my eyes', expectZh: '我的眼睛在这里' },
      { bot: 'Touch your nose!', botZh: '摸摸你的鼻子!', emoji: '👃', expect: 'This is my nose', expectZh: '这是我的鼻子' },
      { bot: 'How many hands do you have?', botZh: '你有几只手?', emoji: '✋', expect: 'I have two hands', expectZh: '我有两只手' },
      { bot: 'Can you clap your hands?', botZh: '你会拍手吗?', emoji: '👏', expect: 'Yes, I can', expectZh: '是的,我会' },
    ],
  },
  {
    key: 'weather',
    title: '今天天气',
    icon: '☀️',
    level: 'easy',
    turns: [
      { bot: 'How is the weather today?', botZh: '今天天气怎么样?', emoji: '☀️', expect: 'It is sunny', expectZh: '今天晴天' },
      { bot: 'Is it hot or cold?', botZh: '天气热还是冷?', emoji: '🌡️', expect: 'It is hot', expectZh: '很热' },
      { bot: 'What do you see in the sky?', botZh: '你在天上看到什么?', emoji: '☁️', expect: 'I see clouds', expectZh: '我看到云' },
      { bot: 'Do you want to go outside?', botZh: '你想出去玩吗?', emoji: '🚪', expect: 'Yes, I do', expectZh: '是的,我想' },
    ],
  },
  {
    key: 'feelings',
    title: '我的心情',
    icon: '😊',
    level: 'easy',
    turns: [
      { bot: 'How do you feel today?', botZh: '你今天感觉怎么样?', emoji: '😊', expect: 'I am happy', expectZh: '我很开心' },
      { bot: 'Why are you happy?', botZh: '你为什么开心?', emoji: '🎈', expect: 'Because I can play', expectZh: '因为我可以玩' },
      { bot: 'Are you sad?', botZh: '你难过吗?', emoji: '😢', expect: 'No, I am not', expectZh: '不,我不难过' },
      { bot: 'Give me a smile!', botZh: '笑一个!', emoji: '😄', expect: 'I am smiling', expectZh: '我在笑' },
    ],
  },
  {
    key: 'pets',
    title: '我的宠物',
    icon: '🐱',
    level: 'easy',
    turns: [
      { bot: 'Do you have a pet?', botZh: '你有宠物吗?', emoji: '🐱', expect: 'Yes, I have a cat', expectZh: '有,我有一只猫' },
      { bot: 'What is its name?', botZh: '它叫什么名字?', emoji: '🏷️', expect: 'Its name is Mimi', expectZh: '它叫咪咪' },
      { bot: 'Is it cute?', botZh: '它可爱吗?', emoji: '🥰', expect: 'Yes, it is very cute', expectZh: '是的,非常可爱' },
      { bot: 'What does a cat say?', botZh: '小猫怎么叫?', emoji: '🔊', expect: 'Meow meow', expectZh: '喵喵' },
    ],
  },
  {
    key: 'bedtime',
    title: '睡觉啦',
    icon: '🌙',
    level: 'easy',
    turns: [
      { bot: 'It is bedtime!', botZh: '该睡觉啦!', emoji: '🌙', expect: 'OK, good night', expectZh: '好的,晚安' },
      { bot: 'Did you brush your teeth?', botZh: '你刷牙了吗?', emoji: '🪥', expect: 'Yes, I did', expectZh: '刷了' },
      { bot: 'Do you want a story?', botZh: '要听故事吗?', emoji: '📖', expect: 'Yes, please', expectZh: '好的,谢谢' },
      { bot: 'Sweet dreams!', botZh: '做个好梦!', emoji: '😴', expect: 'Good night, see you tomorrow', expectZh: '晚安,明天见' },
    ],
  },
  {
    key: 'kindergarten',
    title: '在幼儿园',
    icon: '🎒',
    level: 'easy',
    turns: [
      { bot: 'Good morning! What is your name?', botZh: '早上好!你叫什么名字?', emoji: '🎒', expect: 'My name is Doudou', expectZh: '我叫豆豆' },
      { bot: 'Do you want to draw?', botZh: '你想画画吗?', emoji: '🖍️', expect: 'Yes, I want to draw', expectZh: '想,我想画画' },
      { bot: 'Can you share your crayons?', botZh: '你可以分享蜡笔吗?', emoji: '🤝', expect: 'Yes, of course', expectZh: '当然可以' },
      { bot: 'It is time to go home!', botZh: '该回家啦!', emoji: '🏠', expect: 'See you tomorrow', expectZh: '明天见' },
    ],
  },
  {
    key: 'introduce',
    title: '自我介绍',
    icon: '🙋',
    level: 'medium',
    turns: [
      { bot: 'Hi! What is your name?', botZh: '嗨!你叫什么名字?', emoji: '🙋', expect: 'My name is Lily', expectZh: '我叫莉莉' },
      { bot: 'How old are you?', botZh: '你多大了?', emoji: '🎂', expect: 'I am eight years old', expectZh: '我八岁' },
      { bot: 'Where are you from?', botZh: '你来自哪里?', emoji: '🌏', expect: 'I am from China', expectZh: '我来自中国' },
      { bot: 'What grade are you in?', botZh: '你上几年级?', emoji: '🏫', expect: 'I am in grade two', expectZh: '我上二年级' },
      { bot: 'What do you like to do?', botZh: '你喜欢做什么?', emoji: '⚽', expect: 'I like playing football', expectZh: '我喜欢踢足球' },
      { bot: 'Nice talking to you!', botZh: '和你聊天很开心!', emoji: '😊', expect: 'Nice talking to you too', expectZh: '我也很开心' },
    ],
  },
  {
    key: 'school',
    title: '在学校',
    icon: '🏫',
    level: 'medium',
    turns: [
      { bot: 'What is your favorite subject?', botZh: '你最喜欢什么科目?', emoji: '📚', expect: 'My favorite subject is math', expectZh: '我最喜欢数学' },
      { bot: 'Who is your teacher?', botZh: '你的老师是谁?', emoji: '👩‍🏫', expect: 'My teacher is Miss Li', expectZh: '我的老师是李老师' },
      { bot: 'How do you go to school?', botZh: '你怎么去上学?', emoji: '🚌', expect: 'I go to school by bus', expectZh: '我坐公交车上学' },
      { bot: 'What time does school start?', botZh: '学校几点开始上课?', emoji: '⏰', expect: 'School starts at eight', expectZh: '八点开始上课' },
      { bot: 'Do you have homework today?', botZh: '你今天有作业吗?', emoji: '📝', expect: 'Yes, I have some homework', expectZh: '有,我有一些作业' },
      { bot: 'Good luck with your study!', botZh: '学习加油!', emoji: '💪', expect: 'Thank you very much', expectZh: '非常感谢' },
    ],
  },
  {
    key: 'shopping',
    title: '买东西',
    icon: '🛒',
    level: 'medium',
    turns: [
      { bot: 'Can I help you?', botZh: '需要帮忙吗?', emoji: '🛒', expect: 'Yes, I want to buy a pen', expectZh: '是的,我想买支笔' },
      { bot: 'What color do you want?', botZh: '你想要什么颜色?', emoji: '🖊️', expect: 'I want a blue one', expectZh: '我想要蓝色的' },
      { bot: 'How many do you need?', botZh: '你需要几支?', emoji: '🔢', expect: 'I need two pens', expectZh: '我需要两支笔' },
      { bot: 'It is ten yuan.', botZh: '一共十块钱。', emoji: '💰', expect: 'Here you are', expectZh: '给你' },
      { bot: 'Here is your change.', botZh: '这是找您的零钱。', emoji: '🪙', expect: 'Thank you very much', expectZh: '非常感谢' },
      { bot: 'Have a nice day!', botZh: '祝你今天愉快!', emoji: '👋', expect: 'You too, goodbye', expectZh: '你也是,再见' },
    ],
  },
  {
    key: 'restaurant',
    title: '在餐厅',
    icon: '🍽️',
    level: 'medium',
    turns: [
      { bot: 'Welcome! What would you like?', botZh: '欢迎!您想吃点什么?', emoji: '🍽️', expect: 'I would like some noodles', expectZh: '我想要一碗面' },
      { bot: 'Anything to drink?', botZh: '要喝点什么吗?', emoji: '🥤', expect: 'I would like some water', expectZh: '我想要一杯水' },
      { bot: 'Do you want some fruit?', botZh: '要来点水果吗?', emoji: '🍉', expect: 'Yes, please', expectZh: '好的,谢谢' },
      { bot: 'Here is your food. Enjoy!', botZh: '您的餐来了,请慢用!', emoji: '😋', expect: 'Thank you, it looks great', expectZh: '谢谢,看起来真棒' },
      { bot: 'How does it taste?', botZh: '味道怎么样?', emoji: '👍', expect: 'It is delicious', expectZh: '很好吃' },
      { bot: 'See you next time!', botZh: '下次见!', emoji: '👋', expect: 'Goodbye, thank you', expectZh: '再见,谢谢' },
    ],
  },
  {
    key: 'birthday',
    title: '生日派对',
    icon: '🎂',
    level: 'medium',
    turns: [
      { bot: 'Happy birthday!', botZh: '生日快乐!', emoji: '🎂', expect: 'Thank you so much', expectZh: '太谢谢你了' },
      { bot: 'How old are you today?', botZh: '你今天几岁啦?', emoji: '🕯️', expect: 'I am nine years old', expectZh: '我九岁了' },
      { bot: 'This is a gift for you.', botZh: '这是给你的礼物。', emoji: '🎁', expect: 'Thank you, I love it', expectZh: '谢谢,我很喜欢' },
      { bot: 'Do you want some cake?', botZh: '想吃蛋糕吗?', emoji: '🍰', expect: 'Yes, please', expectZh: '好的,谢谢' },
      { bot: 'Make a wish!', botZh: '许个愿吧!', emoji: '🌟', expect: 'I wish to be happy every day', expectZh: '我希望每天都开心' },
      { bot: 'Let us sing together!', botZh: '我们一起唱歌吧!', emoji: '🎶', expect: 'Great, let us sing', expectZh: '太好了,一起唱' },
    ],
  },
  {
    key: 'doctor',
    title: '看医生',
    icon: '🩺',
    level: 'medium',
    turns: [
      { bot: 'What is wrong with you?', botZh: '你哪里不舒服?', emoji: '🤒', expect: 'I have a headache', expectZh: '我头疼' },
      { bot: 'How long have you been sick?', botZh: '你病了多久了?', emoji: '📅', expect: 'Since yesterday', expectZh: '从昨天开始' },
      { bot: 'Do you have a fever?', botZh: '你发烧了吗?', emoji: '🌡️', expect: 'Yes, a little', expectZh: '有一点' },
      { bot: 'Take this medicine twice a day.', botZh: '这个药一天吃两次。', emoji: '💊', expect: 'OK, I will', expectZh: '好的,我会的' },
      { bot: 'Drink more water and rest.', botZh: '多喝水,好好休息。', emoji: '💧', expect: 'Thank you, doctor', expectZh: '谢谢医生' },
      { bot: 'Get well soon!', botZh: '早日康复!', emoji: '🍀', expect: 'Thank you very much', expectZh: '非常感谢' },
    ],
  },
  {
    key: 'directions',
    title: '问路',
    icon: '🗺️',
    level: 'medium',
    turns: [
      { bot: 'Excuse me, where is the library?', botZh: '打扰一下,图书馆在哪里?', emoji: '🗺️', expect: 'It is over there', expectZh: '就在那边' },
      { bot: 'Is it far from here?', botZh: '离这里远吗?', emoji: '📏', expect: 'No, it is very close', expectZh: '不远,很近' },
      { bot: 'How can I get there?', botZh: '我怎么去那里?', emoji: '🚶', expect: 'Go straight and turn left', expectZh: '直走然后左转' },
      { bot: 'How long does it take?', botZh: '要走多久?', emoji: '⏱️', expect: 'About five minutes', expectZh: '大约五分钟' },
      { bot: 'Thank you for your help!', botZh: '谢谢你的帮助!', emoji: '🙏', expect: 'You are welcome', expectZh: '不客气' },
    ],
  },
  {
    key: 'hobbies',
    title: '兴趣爱好',
    icon: '🎨',
    level: 'medium',
    turns: [
      { bot: 'What is your hobby?', botZh: '你的爱好是什么?', emoji: '🎨', expect: 'My hobby is drawing', expectZh: '我的爱好是画画' },
      { bot: 'How often do you draw?', botZh: '你多久画一次?', emoji: '📆', expect: 'Every weekend', expectZh: '每个周末' },
      { bot: 'Can you play any instrument?', botZh: '你会乐器吗?', emoji: '🎹', expect: 'Yes, I can play the piano', expectZh: '会,我会弹钢琴' },
      { bot: 'Do you like sports?', botZh: '你喜欢运动吗?', emoji: '🏀', expect: 'Yes, I like basketball', expectZh: '喜欢,我喜欢篮球' },
      { bot: 'What do you want to learn next?', botZh: '接下来你想学什么?', emoji: '✨', expect: 'I want to learn swimming', expectZh: '我想学游泳' },
    ],
  },
  {
    key: 'daily',
    title: '一天的安排',
    icon: '⏰',
    level: 'medium',
    turns: [
      { bot: 'What time do you get up?', botZh: '你几点起床?', emoji: '⏰', expect: 'I get up at seven', expectZh: '我七点起床' },
      { bot: 'What do you have for breakfast?', botZh: '你早饭吃什么?', emoji: '🥛', expect: 'I have bread and milk', expectZh: '我吃面包喝牛奶' },
      { bot: 'What do you do after school?', botZh: '放学后你做什么?', emoji: '📖', expect: 'I do my homework', expectZh: '我做作业' },
      { bot: 'Do you help your parents?', botZh: '你帮爸爸妈妈做事吗?', emoji: '🧹', expect: 'Yes, I clean my room', expectZh: '会,我打扫房间' },
      { bot: 'What time do you go to bed?', botZh: '你几点睡觉?', emoji: '🛏️', expect: 'I go to bed at nine', expectZh: '我九点睡觉' },
    ],
  },
  {
    key: 'sports',
    title: '运动时间',
    icon: '⚽',
    level: 'medium',
    turns: [
      { bot: 'Do you like sports?', botZh: '你喜欢运动吗?', emoji: '⚽', expect: 'Yes, I love sports', expectZh: '喜欢,我很爱运动' },
      { bot: 'What sport do you play?', botZh: '你玩什么运动?', emoji: '🏀', expect: 'I play basketball', expectZh: '我打篮球' },
      { bot: 'Who do you play with?', botZh: '你和谁一起玩?', emoji: '👬', expect: 'I play with my friends', expectZh: '我和朋友一起玩' },
      { bot: 'Can you swim?', botZh: '你会游泳吗?', emoji: '🏊', expect: 'Yes, I can swim', expectZh: '会,我会游泳' },
      { bot: 'Let us go and play!', botZh: '我们去玩吧!', emoji: '🎽', expect: 'Great idea, let us go', expectZh: '好主意,走吧' },
    ],
  },
  {
    key: 'travel',
    title: '去旅行',
    icon: '✈️',
    level: 'medium',
    turns: [
      { bot: 'Where do you want to go?', botZh: '你想去哪里?', emoji: '✈️', expect: 'I want to go to Beijing', expectZh: '我想去北京' },
      { bot: 'How will you get there?', botZh: '你怎么去那里?', emoji: '🚄', expect: 'I will go by train', expectZh: '我要坐火车去' },
      { bot: 'Who will go with you?', botZh: '谁和你一起去?', emoji: '👨‍👩‍👦', expect: 'My family will go with me', expectZh: '我的家人和我一起去' },
      { bot: 'What will you see there?', botZh: '你会在那里看什么?', emoji: '🏯', expect: 'I will see the Great Wall', expectZh: '我会去看长城' },
      { bot: 'Have a nice trip!', botZh: '旅途愉快!', emoji: '🧳', expect: 'Thank you very much', expectZh: '非常感谢' },
    ],
  },
  {
    key: 'library',
    title: '在图书馆',
    icon: '📚',
    level: 'medium',
    turns: [
      { bot: 'What book are you looking for?', botZh: '你在找什么书?', emoji: '📚', expect: 'I am looking for a story book', expectZh: '我在找一本故事书' },
      { bot: 'Do you like reading?', botZh: '你喜欢阅读吗?', emoji: '🤓', expect: 'Yes, I read every day', expectZh: '喜欢,我每天都读' },
      { bot: 'How many books can I borrow?', botZh: '我可以借几本书?', emoji: '🔢', expect: 'You can borrow three books', expectZh: '你可以借三本' },
      { bot: 'Please keep quiet here.', botZh: '这里请保持安静。', emoji: '🤫', expect: 'OK, I am sorry', expectZh: '好的,对不起' },
      { bot: 'Enjoy your reading!', botZh: '阅读愉快!', emoji: '😊', expect: 'Thank you', expectZh: '谢谢' },
    ],
  },
  {
    key: 'weekend',
    title: '周末计划',
    icon: '🗓️',
    level: 'medium',
    turns: [
      { bot: 'What will you do this weekend?', botZh: '这个周末你要做什么?', emoji: '🗓️', expect: 'I will visit my grandma', expectZh: '我要去看外婆' },
      { bot: 'Will you go to the park?', botZh: '你会去公园吗?', emoji: '🌳', expect: 'Yes, on Sunday morning', expectZh: '会,周日早上去' },
      { bot: 'What is the weather like?', botZh: '天气怎么样?', emoji: '🌤️', expect: 'It will be sunny', expectZh: '会是晴天' },
      { bot: 'Do you want to come with me?', botZh: '你想和我一起来吗?', emoji: '🤝', expect: 'Sure, I would love to', expectZh: '当然,我很乐意' },
      { bot: 'See you on Sunday!', botZh: '周日见!', emoji: '👋', expect: 'See you then', expectZh: '到时候见' },
    ],
  },
  {
    key: 'help',
    title: '请求帮助',
    icon: '🆘',
    level: 'medium',
    turns: [
      { bot: 'You look worried. What happened?', botZh: '你看起来很担心,怎么了?', emoji: '😟', expect: 'I cannot find my bag', expectZh: '我找不到我的书包' },
      { bot: 'Where did you see it last?', botZh: '你最后在哪里看到它的?', emoji: '🔎', expect: 'I saw it in the classroom', expectZh: '我在教室里看到的' },
      { bot: 'Can I help you find it?', botZh: '我可以帮你找吗?', emoji: '🙋', expect: 'Yes, please help me', expectZh: '好的,请帮帮我' },
      { bot: 'Is this your bag?', botZh: '这是你的书包吗?', emoji: '🎒', expect: 'Yes, it is mine', expectZh: '是的,是我的' },
      { bot: 'I am glad we found it!', botZh: '找到了真好!', emoji: '🎉', expect: 'Thank you for your help', expectZh: '谢谢你的帮助' },
    ],
  },
  {
    key: 'seasons',
    title: '四季',
    icon: '🍂',
    level: 'medium',
    turns: [
      { bot: 'What season is it now?', botZh: '现在是什么季节?', emoji: '🍂', expect: 'It is autumn', expectZh: '现在是秋天' },
      { bot: 'Which season do you like best?', botZh: '你最喜欢哪个季节?', emoji: '❄️', expect: 'I like winter best', expectZh: '我最喜欢冬天' },
      { bot: 'Why do you like it?', botZh: '为什么喜欢?', emoji: '⛄', expect: 'Because I can play with snow', expectZh: '因为我可以玩雪' },
      { bot: 'What do you wear in winter?', botZh: '冬天你穿什么?', emoji: '🧣', expect: 'I wear a warm coat', expectZh: '我穿厚外套' },
      { bot: 'Winter is coming soon!', botZh: '冬天快到啦!', emoji: '🎿', expect: 'I cannot wait', expectZh: '我等不及了' },
    ],
  },
  {
    key: 'phone',
    title: '打电话',
    icon: '📞',
    level: 'medium',
    turns: [
      { bot: 'Hello, who is speaking?', botZh: '你好,请问是哪位?', emoji: '📞', expect: 'This is Tom speaking', expectZh: '我是汤姆' },
      { bot: 'Can I speak to your mother?', botZh: '我可以和你妈妈说话吗?', emoji: '👩', expect: 'Sorry, she is not at home', expectZh: '抱歉,她不在家' },
      { bot: 'When will she be back?', botZh: '她什么时候回来?', emoji: '🕕', expect: 'She will be back at six', expectZh: '她六点回来' },
      { bot: 'Can you take a message?', botZh: '你能帮我留个言吗?', emoji: '📝', expect: 'Sure, no problem', expectZh: '当然可以' },
      { bot: 'Thank you. Goodbye!', botZh: '谢谢,再见!', emoji: '👋', expect: 'Goodbye', expectZh: '再见' },
    ],
  },
// ---------------- 入门档新增 ----------------
  {
    key: 'brushteeth',
    title: '刷牙洗脸',
    icon: '🪥',
    level: 'easy',
    turns: [
      { bot: 'Good morning! Time to get up.', botZh: '早上好!该起床啦。', emoji: '🌅', expect: 'Good morning', expectZh: '早上好', alts: ['Good morning Mom', 'Morning'] },
      { bot: 'Let us brush your teeth.', botZh: '我们来刷牙吧。', emoji: '🪥', expect: 'OK, I will brush my teeth', expectZh: '好,我来刷牙', alts: ['I brush my teeth', 'OK'] },
      { bot: 'Now wash your face.', botZh: '现在洗洗脸。', emoji: '🚿', expect: 'I am washing my face', expectZh: '我在洗脸', alts: ['I wash my face'] },
      { bot: 'You look so clean!', botZh: '你看起来真干净!', emoji: '✨', expect: 'Thank you', expectZh: '谢谢', alts: ['Thank you very much', 'Thanks'] },
    ],
  },
  {
    key: 'clothes',
    title: '穿衣服',
    icon: '👕',
    level: 'easy',
    turns: [
      { bot: 'What color is your shirt?', botZh: '你的上衣是什么颜色?', emoji: '👕', expect: 'It is blue', expectZh: '是蓝色的', alts: ['Blue', 'My shirt is blue'] },
      { bot: 'Can you put on your shoes?', botZh: '你会自己穿鞋吗?', emoji: '👟', expect: 'Yes, I can', expectZh: '是的,我会', alts: ['Yes', 'I can do it'] },
      { bot: 'It is cold today. Take your coat.', botZh: '今天很冷,带上外套。', emoji: '🧥', expect: 'OK, I will take my coat', expectZh: '好,我拿外套', alts: ['OK', 'Here is my coat'] },
      { bot: 'Great! You are ready.', botZh: '太好了!你准备好了。', emoji: '🎉', expect: 'Let us go', expectZh: '我们走吧', alts: ['I am ready'] },
    ],
  },
  {
    key: 'shapes',
    title: '认形状',
    icon: '🔷',
    level: 'easy',
    turns: [
      { bot: 'Look at this. What shape is it?', botZh: '看这个,是什么形状?', emoji: '⭕', expect: 'It is a circle', expectZh: '是圆形', alts: ['A circle', 'Circle'] },
      { bot: 'And this one?', botZh: '那这个呢?', emoji: '🔺', expect: 'It is a triangle', expectZh: '是三角形', alts: ['A triangle', 'Triangle'] },
      { bot: 'What about this?', botZh: '这个是什么?', emoji: '🟦', expect: 'It is a square', expectZh: '是正方形', alts: ['A square', 'Square'] },
      { bot: 'You know all the shapes!', botZh: '所有形状你都认识!', emoji: '👏', expect: 'Yes, I do', expectZh: '是的,我认识', alts: ['I know them'] },
    ],
  },
  {
    key: 'fruit',
    title: '买水果',
    icon: '🍓',
    level: 'easy',
    turns: [
      { bot: 'What fruit do you like?', botZh: '你喜欢什么水果?', emoji: '🍎', expect: 'I like apples', expectZh: '我喜欢苹果', alts: ['Apples', 'I like apple'] },
      { bot: 'How many do you want?', botZh: '你要几个?', emoji: '🔢', expect: 'I want three', expectZh: '我要三个', alts: ['Three', 'Three please'] },
      { bot: 'Do you want bananas too?', botZh: '还要香蕉吗?', emoji: '🍌', expect: 'Yes, please', expectZh: '好的,谢谢', alts: ['Yes', 'No, thank you'] },
      { bot: 'Here you are!', botZh: '给你!', emoji: '🛍️', expect: 'Thank you', expectZh: '谢谢', alts: ['Thanks a lot'] },
    ],
  },
  {
    key: 'newfriend',
    title: '交新朋友',
    icon: '🧒',
    level: 'easy',
    turns: [
      { bot: 'Hi! What is your name?', botZh: '嗨!你叫什么名字?', emoji: '👋', expect: 'My name is Tom', expectZh: '我叫汤姆', alts: ['I am Tom', 'Tom'] },
      { bot: 'How old are you?', botZh: '你几岁了?', emoji: '🎂', expect: 'I am five years old', expectZh: '我五岁了', alts: ['Five', 'I am five'] },
      { bot: 'Do you want to play with me?', botZh: '你想和我一起玩吗?', emoji: '⚽', expect: 'Yes, I do', expectZh: '是的,我想', alts: ['Yes', 'Sure'] },
      { bot: 'Let us be friends!', botZh: '我们做朋友吧!', emoji: '🤝', expect: 'We are friends now', expectZh: '我们现在是朋友了', alts: ['Yes, friends'] },
    ],
  },
  {
    key: 'backpack',
    title: '我的书包',
    icon: '🎒',
    level: 'easy',
    turns: [
      { bot: 'What is in your bag?', botZh: '你书包里有什么?', emoji: '🎒', expect: 'I have books', expectZh: '我有书', alts: ['Books', 'There are books'] },
      { bot: 'Do you have a pencil?', botZh: '你有铅笔吗?', emoji: '✏️', expect: 'Yes, I have a pencil', expectZh: '是的,我有一支铅笔', alts: ['Yes I do', 'Yes'] },
      { bot: 'Where is your water bottle?', botZh: '你的水壶在哪?', emoji: '🍶', expect: 'It is in my bag', expectZh: '在我书包里', alts: ['In my bag', 'Here it is'] },
      { bot: 'Good. You have everything!', botZh: '很好,你都带齐了!', emoji: '✅', expect: 'I am ready for school', expectZh: '我准备好上学了', alts: ['I am ready'] },
    ],
  },
  {
    key: 'tidyup',
    title: '收拾玩具',
    icon: '🧸',
    level: 'easy',
    turns: [
      { bot: 'Wow, so many toys on the floor!', botZh: '哇,地上好多玩具!', emoji: '🧸', expect: 'I was playing', expectZh: '我刚才在玩', alts: ['I played with them', 'Sorry'] },
      { bot: 'Can you put them in the box?', botZh: '你能把它们放进盒子吗?', emoji: '📦', expect: 'Yes, I can', expectZh: '好的,我可以', alts: ['Yes', 'OK'] },
      { bot: 'Where does the ball go?', botZh: '球该放哪里?', emoji: '⚽', expect: 'It goes in the box', expectZh: '放进盒子里', alts: ['In the box', 'Here'] },
      { bot: 'All clean! Well done!', botZh: '都收拾好了!真棒!', emoji: '🌟', expect: 'I did it', expectZh: '我做到了', alts: ['Thank you'] },
    ],
  },
  {
    key: 'breakfast',
    title: '吃早饭',
    icon: '🥞',
    level: 'easy',
    turns: [
      { bot: 'Are you hungry?', botZh: '你饿了吗?', emoji: '😋', expect: 'Yes, I am hungry', expectZh: '是的,我饿了', alts: ['Yes', 'I am hungry'] },
      { bot: 'What do you want for breakfast?', botZh: '早饭想吃什么?', emoji: '🍳', expect: 'I want eggs', expectZh: '我想吃鸡蛋', alts: ['Eggs please', 'Bread'] },
      { bot: 'Do you want milk or juice?', botZh: '你要牛奶还是果汁?', emoji: '🥛', expect: 'Milk, please', expectZh: '请给我牛奶', alts: ['I want milk', 'Juice please'] },
      { bot: 'Here you are. Enjoy!', botZh: '给你,好好吃!', emoji: '🍽️', expect: 'It is yummy', expectZh: '真好吃', alts: ['Thank you', 'It is delicious'] },
    ],
  },

  // ---------------- 进阶档新增 ----------------
  {
    key: 'supermarket',
    title: '逛超市',
    icon: '🛒',
    level: 'medium',
    turns: [
      { bot: 'We need to buy some things. What do we need?', botZh: '我们要买些东西。需要什么?', emoji: '📝', expect: 'We need milk and bread', expectZh: '我们需要牛奶和面包', alts: ['Milk and bread', 'We need some milk'] },
      { bot: 'Where can we find the milk?', botZh: '牛奶在哪里能找到?', emoji: '🥛', expect: 'It is over there', expectZh: '在那边', alts: ['Over there', 'I think it is there'] },
      { bot: 'How much does it cost?', botZh: '这个多少钱?', emoji: '💰', expect: 'It costs ten yuan', expectZh: '十块钱', alts: ['Ten yuan', 'It is ten yuan'] },
      { bot: 'Can you carry the bag?', botZh: '你能拿一下袋子吗?', emoji: '🛍️', expect: 'Yes, I can help you', expectZh: '可以,我来帮你', alts: ['Sure', 'Let me help'] },
      { bot: 'Thank you for helping me!', botZh: '谢谢你帮忙!', emoji: '💗', expect: 'You are welcome', expectZh: '不客气', alts: ['No problem', 'It is my pleasure'] },
    ],
  },
  {
    key: 'whattime',
    title: '现在几点',
    icon: '🕐',
    level: 'medium',
    turns: [
      { bot: 'Excuse me, what time is it?', botZh: '打扰一下,现在几点?', emoji: '⌚', expect: 'It is three o clock', expectZh: '三点了', alts: ['Three o clock', 'It is three'] },
      { bot: 'When does your class start?', botZh: '你的课几点开始?', emoji: '🏫', expect: 'It starts at eight', expectZh: '八点开始', alts: ['At eight', 'Eight o clock'] },
      { bot: 'How long is your lunch break?', botZh: '午休有多长?', emoji: '🍱', expect: 'It is one hour', expectZh: '一个小时', alts: ['One hour', 'About one hour'] },
      { bot: 'What time do you go to bed?', botZh: '你几点睡觉?', emoji: '🌙', expect: 'I go to bed at nine', expectZh: '我九点睡觉', alts: ['At nine', 'Nine o clock'] },
      { bot: 'That is a good habit!', botZh: '这是个好习惯!', emoji: '👍', expect: 'Thank you', expectZh: '谢谢', alts: ['I try to sleep early'] },
    ],
  },
  {
    key: 'chores',
    title: '做家务',
    icon: '🧹',
    level: 'medium',
    turns: [
      { bot: 'Can you help me at home?', botZh: '你能在家帮帮我吗?', emoji: '🏠', expect: 'Yes, what can I do', expectZh: '可以,我能做什么', alts: ['Sure', 'Of course'] },
      { bot: 'Could you wash the dishes?', botZh: '你能洗碗吗?', emoji: '🍽️', expect: 'Sure, I will wash them', expectZh: '好的,我来洗', alts: ['Yes I can', 'No problem'] },
      { bot: 'What else can you do?', botZh: '你还会做什么?', emoji: '🤔', expect: 'I can sweep the floor', expectZh: '我会扫地', alts: ['I can clean my room', 'I can water the plants'] },
      { bot: 'Do you do this every day?', botZh: '你每天都做吗?', emoji: '📅', expect: 'I do it every weekend', expectZh: '我每个周末做', alts: ['Yes, every day', 'Sometimes'] },
      { bot: 'You are a big help!', botZh: '你帮了大忙!', emoji: '🌟', expect: 'I am happy to help', expectZh: '我很乐意帮忙', alts: ['Thank you'] },
    ],
  },
  {
    key: 'movie',
    title: '看电影',
    icon: '🎬',
    level: 'medium',
    turns: [
      { bot: 'Do you want to watch a movie?', botZh: '你想看电影吗?', emoji: '🎬', expect: 'Yes, I would love to', expectZh: '好啊,我很想看', alts: ['Yes', 'Sure, that sounds fun'] },
      { bot: 'What kind of movie do you like?', botZh: '你喜欢什么类型的电影?', emoji: '🍿', expect: 'I like cartoons', expectZh: '我喜欢动画片', alts: ['Cartoons', 'I like funny movies'] },
      { bot: 'Who is your favorite character?', botZh: '你最喜欢哪个角色?', emoji: '🦸', expect: 'My favorite is the little bear', expectZh: '我最喜欢那只小熊', alts: ['I like the bear', 'The little bear'] },
      { bot: 'Why do you like him?', botZh: '为什么喜欢他?', emoji: '💭', expect: 'Because he is brave and kind', expectZh: '因为他勇敢又善良', alts: ['Because he is funny', 'He is very brave'] },
      { bot: 'That is a great reason!', botZh: '这个理由很好!', emoji: '👏', expect: 'Thank you', expectZh: '谢谢', alts: ['I think so too'] },
    ],
  },
  {
    key: 'invite',
    title: '邀请朋友',
    icon: '💌',
    level: 'medium',
    turns: [
      { bot: 'Are you free this Saturday?', botZh: '这周六你有空吗?', emoji: '📅', expect: 'Yes, I am free', expectZh: '有空', alts: ['Yes', 'I think so'] },
      { bot: 'Would you like to come to my house?', botZh: '你想来我家吗?', emoji: '🏠', expect: 'That sounds great', expectZh: '听起来很棒', alts: ['Yes, I would love to', 'Sure'] },
      { bot: 'We can play games and eat cake.', botZh: '我们可以玩游戏、吃蛋糕。', emoji: '🎂', expect: 'I love cake', expectZh: '我喜欢蛋糕', alts: ['That sounds fun', 'I like games'] },
      { bot: 'Can you come at two in the afternoon?', botZh: '你下午两点能来吗?', emoji: '🕑', expect: 'Yes, I will be there at two', expectZh: '好,我两点到', alts: ['Two is fine', 'Yes I can'] },
      { bot: 'See you on Saturday!', botZh: '周六见!', emoji: '👋', expect: 'See you then', expectZh: '到时候见', alts: ['See you', 'Bye'] },
    ],
  },
  {
    key: 'lostitem',
    title: '东西找不到了',
    icon: '🔎',
    level: 'medium',
    turns: [
      { bot: 'You look worried. What happened?', botZh: '你看起来很着急,怎么了?', emoji: '😟', expect: 'I cannot find my book', expectZh: '我找不到我的书了', alts: ['I lost my book', 'My book is missing'] },
      { bot: 'Where did you see it last?', botZh: '你最后在哪里见过它?', emoji: '🤔', expect: 'I had it in the classroom', expectZh: '我在教室里还拿着', alts: ['In the classroom', 'It was on my desk'] },
      { bot: 'What does it look like?', botZh: '它长什么样?', emoji: '📕', expect: 'It is a red book with a cat on it', expectZh: '是一本红色的书,上面有只猫', alts: ['It is red', 'A red book'] },
      { bot: 'Is this one yours?', botZh: '这本是你的吗?', emoji: '📖', expect: 'Yes, that is mine', expectZh: '是的,那是我的', alts: ['Yes it is', 'That is my book'] },
      { bot: 'I am glad we found it.', botZh: '找到了太好了。', emoji: '😊', expect: 'Thank you so much', expectZh: '太谢谢你了', alts: ['Thank you for helping'] },
    ],
  },

  // ---------------- 挑战档(全新) ----------------
  {
    key: 'introduce-adv',
    title: '介绍我自己',
    icon: '🎤',
    level: 'hard',
    turns: [
      { bot: 'Please tell me a little about yourself.', botZh: '请介绍一下你自己。', emoji: '🎤', expect: 'My name is Tom and I am nine years old', expectZh: '我叫汤姆,今年九岁', alts: ['I am Tom, I am nine', 'My name is Tom'] },
      { bot: 'Which grade are you in?', botZh: '你上几年级?', emoji: '🏫', expect: 'I am in grade three', expectZh: '我上三年级', alts: ['Grade three', 'I am a third grader'] },
      { bot: 'What subject do you like best, and why?', botZh: '你最喜欢哪门课?为什么?', emoji: '📚', expect: 'I like science because it is interesting', expectZh: '我喜欢科学,因为很有意思', alts: ['I like math because it is fun', 'Science, because I like experiments'] },
      { bot: 'What do you usually do after school?', botZh: '放学后你通常做什么?', emoji: '🏃', expect: 'I usually do my homework and play basketball', expectZh: '我通常写作业然后打篮球', alts: ['I do my homework', 'I play with my friends'] },
      { bot: 'Do you have any brothers or sisters?', botZh: '你有兄弟姐妹吗?', emoji: '👧', expect: 'I have a little sister who is four', expectZh: '我有个四岁的妹妹', alts: ['I have one sister', 'No, I am the only child'] },
      { bot: 'It was nice talking with you.', botZh: '和你聊天很愉快。', emoji: '🤝', expect: 'It was nice talking with you too', expectZh: '我也很高兴和你聊天', alts: ['Nice talking to you', 'Thank you'] },
    ],
  },
  {
    key: 'hobby-adv',
    title: '聊聊爱好',
    icon: '🎨',
    level: 'hard',
    turns: [
      { bot: 'What do you like doing in your free time?', botZh: '空闲时间你喜欢做什么?', emoji: '🎨', expect: 'I like drawing and reading books', expectZh: '我喜欢画画和读书', alts: ['I like painting', 'I enjoy drawing'] },
      { bot: 'How long have you been drawing?', botZh: '你画画多久了?', emoji: '⏳', expect: 'I have been drawing for two years', expectZh: '我画了两年了', alts: ['For two years', 'About two years'] },
      { bot: 'What do you like to draw most?', botZh: '你最喜欢画什么?', emoji: '🖼️', expect: 'I like drawing animals and the sea', expectZh: '我喜欢画动物和大海', alts: ['I draw animals', 'Animals'] },
      { bot: 'Who taught you how to draw?', botZh: '谁教你画画的?', emoji: '👩‍🏫', expect: 'My art teacher taught me at school', expectZh: '学校的美术老师教我的', alts: ['My teacher', 'I taught myself'] },
      { bot: 'Do you want to be an artist one day?', botZh: '你以后想当画家吗?', emoji: '🌈', expect: 'Maybe, but I am not sure yet', expectZh: '也许吧,不过我还没想好', alts: ['Yes I do', 'I am not sure'] },
      { bot: 'Keep drawing. You will get better and better.', botZh: '继续画,你会越来越好的。', emoji: '💪', expect: 'Thank you, I will keep practicing', expectZh: '谢谢,我会继续练习', alts: ['I will', 'Thank you'] },
    ],
  },
  {
    key: 'future',
    title: '长大以后',
    icon: '🚀',
    level: 'hard',
    turns: [
      { bot: 'What do you want to be when you grow up?', botZh: '你长大想做什么?', emoji: '🚀', expect: 'I want to be a doctor', expectZh: '我想当医生', alts: ['A doctor', 'I want to be a teacher'] },
      { bot: 'That is wonderful. Why did you choose that?', botZh: '很棒。为什么选这个?', emoji: '💭', expect: 'Because I want to help sick people', expectZh: '因为我想帮助生病的人', alts: ['Because I want to help people', 'I like helping others'] },
      { bot: 'What do you need to study for that job?', botZh: '做这个工作要学什么?', emoji: '📖', expect: 'I need to study science very hard', expectZh: '我要努力学习科学', alts: ['I need to study biology', 'Science and math'] },
      { bot: 'Do you think it will be difficult?', botZh: '你觉得会很难吗?', emoji: '⛰️', expect: 'Yes, but I will try my best', expectZh: '会,但我会尽力', alts: ['It will be hard', 'Yes, but I am not afraid'] },
      { bot: 'Where would you like to work?', botZh: '你想在哪里工作?', emoji: '🏥', expect: 'I would like to work in a big hospital', expectZh: '我想在大医院工作', alts: ['In a hospital', 'In my hometown'] },
      { bot: 'I believe you can do it.', botZh: '我相信你能做到。', emoji: '⭐', expect: 'Thank you for believing in me', expectZh: '谢谢你相信我', alts: ['Thank you', 'I will work hard'] },
    ],
  },
  {
    key: 'describe',
    title: '看图说话',
    icon: '🖼️',
    level: 'hard',
    turns: [
      { bot: 'Look at this picture. What can you see?', botZh: '看这幅图,你看到什么?', emoji: '🏞️', expect: 'I can see a river and some trees', expectZh: '我看到一条河和一些树', alts: ['A river and trees', 'There is a river'] },
      { bot: 'How many people are there?', botZh: '图里有几个人?', emoji: '👨‍👩‍👧', expect: 'There are three people', expectZh: '有三个人', alts: ['Three', 'Three people'] },
      { bot: 'What are they doing?', botZh: '他们在做什么?', emoji: '🎣', expect: 'They are fishing by the river', expectZh: '他们在河边钓鱼', alts: ['They are fishing', 'Fishing'] },
      { bot: 'What is the weather like in the picture?', botZh: '图里天气怎么样?', emoji: '☀️', expect: 'It is sunny and warm', expectZh: '晴朗又温暖', alts: ['It is sunny', 'Sunny'] },
      { bot: 'How do you think they feel?', botZh: '你觉得他们心情怎么样?', emoji: '😊', expect: 'I think they feel happy and relaxed', expectZh: '我觉得他们开心又放松', alts: ['They look happy', 'They are happy'] },
      { bot: 'You described it very clearly!', botZh: '你描述得很清楚!', emoji: '👏', expect: 'Thank you very much', expectZh: '非常感谢', alts: ['Thank you'] },
    ],
  },
  {
    key: 'story',
    title: '讲一件事',
    icon: '📖',
    level: 'hard',
    turns: [
      { bot: 'Tell me something interesting that happened last week.', botZh: '说说上周发生的有趣的事。', emoji: '📖', expect: 'Last week I went to the zoo with my family', expectZh: '上周我和家人去了动物园', alts: ['I went to the zoo', 'We visited the zoo'] },
      { bot: 'Who did you go with?', botZh: '你和谁一起去的?', emoji: '👨‍👩‍👦', expect: 'I went with my parents and my sister', expectZh: '我和爸爸妈妈还有妹妹一起去的', alts: ['With my family', 'My parents'] },
      { bot: 'What did you see there?', botZh: '你在那里看到了什么?', emoji: '🦒', expect: 'We saw pandas giraffes and monkeys', expectZh: '我们看到了熊猫、长颈鹿和猴子', alts: ['We saw pandas', 'Many animals'] },
      { bot: 'What was the best part?', botZh: '哪部分最棒?', emoji: '🌟', expect: 'The best part was feeding the goats', expectZh: '最棒的是喂山羊', alts: ['Feeding the animals', 'I liked the pandas most'] },
      { bot: 'Would you like to go again?', botZh: '你还想再去吗?', emoji: '🔁', expect: 'Yes, I would love to go again', expectZh: '想,我很想再去', alts: ['Yes', 'I hope so'] },
      { bot: 'Thank you for sharing your story.', botZh: '谢谢你分享这个故事。', emoji: '💛', expect: 'You are welcome', expectZh: '不客气', alts: ['Thank you for listening'] },
    ],
  },
  {
    key: 'opinion',
    title: '说说我的看法',
    icon: '💭',
    level: 'hard',
    turns: [
      { bot: 'Some children play video games every day. What do you think?', botZh: '有些孩子每天打游戏,你怎么看?', emoji: '🎮', expect: 'I think too much game time is not good', expectZh: '我觉得玩太久不太好', alts: ['I think it is not good', 'It is not healthy'] },
      { bot: 'Why do you think so?', botZh: '为什么这么想?', emoji: '💭', expect: 'Because it is bad for our eyes', expectZh: '因为对眼睛不好', alts: ['It hurts our eyes', 'Because we need to rest'] },
      { bot: 'How much time is fine, in your opinion?', botZh: '你觉得多长时间合适?', emoji: '⏰', expect: 'I think half an hour a day is enough', expectZh: '我觉得一天半小时就够了', alts: ['Half an hour', 'About thirty minutes'] },
      { bot: 'What can children do instead?', botZh: '孩子们可以做什么代替?', emoji: '🌳', expect: 'They can read books or play outside', expectZh: '他们可以读书或者去外面玩', alts: ['Play outside', 'Read books'] },
      { bot: 'Do your friends agree with you?', botZh: '你的朋友同意你吗?', emoji: '🧑‍🤝‍🧑', expect: 'Some of them agree but some do not', expectZh: '有些同意,有些不同意', alts: ['Some do', 'Not all of them'] },
      { bot: 'You explained your idea very well.', botZh: '你的想法讲得很清楚。', emoji: '🏅', expect: 'Thank you for listening', expectZh: '谢谢你听我说', alts: ['Thank you'] },
    ],
  },
  {
    key: 'problem',
    title: '遇到麻烦',
    icon: '🧩',
    level: 'hard',
    turns: [
      { bot: 'You look upset. Is something wrong?', botZh: '你看起来不开心,出什么事了?', emoji: '😔', expect: 'I had an argument with my friend', expectZh: '我和朋友吵架了', alts: ['I fought with my friend', 'My friend is angry with me'] },
      { bot: 'What was the argument about?', botZh: '为什么吵架?', emoji: '💬', expect: 'We both wanted to use the same book', expectZh: '我们都想用同一本书', alts: ['About a book', 'We wanted the same thing'] },
      { bot: 'How do you feel now?', botZh: '你现在感觉怎么样?', emoji: '💔', expect: 'I feel sad because he is my best friend', expectZh: '我很难过,因为他是我最好的朋友', alts: ['I feel sad', 'I am not happy'] },
      { bot: 'What could you do to make it better?', botZh: '你可以做点什么让事情好起来?', emoji: '🤝', expect: 'I could say sorry and talk to him', expectZh: '我可以道歉,和他谈谈', alts: ['I can say sorry', 'I will talk to him'] },
      { bot: 'That is a brave choice. Will you do it today?', botZh: '这是个勇敢的决定,今天就去吗?', emoji: '💪', expect: 'Yes, I will talk to him tomorrow morning', expectZh: '嗯,我明天早上就跟他说', alts: ['Yes I will', 'I will try'] },
      { bot: 'I am proud of you.', botZh: '我为你骄傲。', emoji: '🌟', expect: 'Thank you for helping me', expectZh: '谢谢你帮我', alts: ['Thank you'] },
    ],
  },
  {
    key: 'planet',
    title: '保护地球',
    icon: '🌍',
    level: 'hard',
    turns: [
      { bot: 'Why should we protect the environment?', botZh: '我们为什么要保护环境?', emoji: '🌍', expect: 'Because the earth is our home', expectZh: '因为地球是我们的家', alts: ['It is our home', 'Because we live here'] },
      { bot: 'What do you do to help?', botZh: '你做了什么?', emoji: '♻️', expect: 'I turn off the lights when I leave', expectZh: '我离开时会关灯', alts: ['I save water', 'I recycle paper'] },
      { bot: 'Do you save water at home?', botZh: '你在家节约用水吗?', emoji: '💧', expect: 'Yes, I take short showers', expectZh: '是的,我洗澡很快', alts: ['Yes I do', 'I try to'] },
      { bot: 'What about plastic bags?', botZh: '塑料袋呢?', emoji: '🛍️', expect: 'We use cloth bags when we go shopping', expectZh: '我们买东西时用布袋', alts: ['We use cloth bags', 'We do not use them'] },
      { bot: 'What can your school do better?', botZh: '你们学校可以做得更好些什么?', emoji: '🏫', expect: 'We can plant more trees in the playground', expectZh: '我们可以在操场多种树', alts: ['Plant more trees', 'We can recycle more'] },
      { bot: 'Those are great ideas!', botZh: '这些想法很棒!', emoji: '🌱', expect: 'I hope everyone will help', expectZh: '我希望大家都能出份力', alts: ['Thank you'] },
    ],
  },
  {
    key: 'china',
    title: '介绍我的家乡',
    icon: '🏯',
    level: 'hard',
    turns: [
      { bot: 'Where are you from?', botZh: '你来自哪里?', emoji: '🗺️', expect: 'I am from China', expectZh: '我来自中国', alts: ['China', 'I come from China'] },
      { bot: 'What is your hometown like?', botZh: '你的家乡是什么样的?', emoji: '🏙️', expect: 'It is a big city with many parks', expectZh: '是个有很多公园的大城市', alts: ['It is a big city', 'It is a small town'] },
      { bot: 'What food should I try there?', botZh: '在那里我该尝什么美食?', emoji: '🥟', expect: 'You should try our dumplings', expectZh: '你该尝尝我们的饺子', alts: ['You should try dumplings', 'Our noodles are great'] },
      { bot: 'What is the most famous place?', botZh: '最有名的地方是哪里?', emoji: '🏯', expect: 'The old temple is the most famous place', expectZh: '那座老庙最有名', alts: ['The old temple', 'The city park'] },
      { bot: 'When is the best time to visit?', botZh: '什么时候去最好?', emoji: '🍂', expect: 'Autumn is the best time because it is cool', expectZh: '秋天最好,因为很凉爽', alts: ['In autumn', 'Spring is nice too'] },
      { bot: 'I really want to visit one day!', botZh: '我真想有一天去看看!', emoji: '✈️', expect: 'You are welcome any time', expectZh: '随时欢迎你来', alts: ['Please come', 'I can show you around'] },
    ],
  },
  {
    key: 'reporter',
    title: '小记者采访',
    icon: '📰',
    level: 'hard',
    turns: [
      { bot: 'I am a reporter. May I ask you some questions?', botZh: '我是记者,可以问你几个问题吗?', emoji: '📰', expect: 'Of course, go ahead', expectZh: '当然可以,请问', alts: ['Sure', 'Yes, please'] },
      { bot: 'What makes you happiest at school?', botZh: '在学校什么让你最开心?', emoji: '😃', expect: 'Playing with my friends makes me happiest', expectZh: '和朋友一起玩最让我开心', alts: ['Playing with friends', 'My friends'] },
      { bot: 'What is the hardest thing for you?', botZh: '对你来说最难的是什么?', emoji: '😣', expect: 'Getting up early is the hardest thing', expectZh: '早起最难', alts: ['Getting up early', 'Doing homework'] },
      { bot: 'If you could change one thing, what would it be?', botZh: '如果能改变一件事,你会改什么?', emoji: '✨', expect: 'I would give students more time to play', expectZh: '我会给学生更多玩的时间', alts: ['More play time', 'Less homework'] },
      { bot: 'What would you say to younger children?', botZh: '你想对更小的孩子说什么?', emoji: '🧒', expect: 'Do not be afraid to ask questions', expectZh: '不要害怕提问', alts: ['Be brave', 'Try your best'] },
      { bot: 'Thank you for the interview!', botZh: '谢谢你接受采访!', emoji: '🎙️', expect: 'Thank you for having me', expectZh: '谢谢你请我来', alts: ['You are welcome', 'Thank you'] },
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
  { en: 'My ball is blue', zh: '我的球是蓝色的' },
  { en: 'I am five years old', zh: '我五岁了' },
  { en: 'Look at the moon', zh: '看月亮' },
  { en: 'The bus is coming', zh: '公交车来了' },
  { en: 'I like ice cream', zh: '我喜欢冰淇淋' },
  { en: 'Wash your hands', zh: '洗洗手' },
  { en: 'The bird can fly', zh: '小鸟会飞' },
  { en: 'It is raining', zh: '下雨了' },
  { en: 'I have a new hat', zh: '我有一顶新帽子' },
  { en: 'Sit down please', zh: '请坐下' },
  { en: 'The sun is bright', zh: '太阳很亮' },
  { en: 'I am so happy', zh: '我很开心' },
  { en: 'Where is my shoe?', zh: '我的鞋在哪里?' },
  { en: 'Give me a hug', zh: '抱抱我' },
  { en: 'The flower is pretty', zh: '这朵花很漂亮' },
  { en: 'Time to go home', zh: '该回家啦' },
  { en: 'I can count to ten', zh: '我能数到十' },
  { en: 'Thank you, teacher', zh: '谢谢老师' },
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
  { en: 'My brother is playing the piano', zh: '我弟弟在弹钢琴' },
  { en: 'We visited the museum last Sunday', zh: '上周日我们参观了博物馆' },
  { en: 'There is a big park near my home', zh: '我家附近有一个大公园' },
  { en: 'I finished my homework before dinner', zh: '我在晚饭前做完了作业' },
  { en: 'The library closes at six in the evening', zh: '图书馆晚上六点关门' },
  { en: 'My best friend lives next door', zh: '我最好的朋友住在隔壁' },
  { en: 'We should protect the environment', zh: '我们应该保护环境' },
  { en: 'He runs faster than anyone in our class', zh: '他跑得比班上任何人都快' },
  { en: 'I usually read for half an hour before bed', zh: '我通常睡前读半小时书' },
  { en: 'The weather will be sunny tomorrow', zh: '明天天气会很晴朗' },
  { en: 'She helps her mother wash the dishes', zh: '她帮妈妈洗碗' },
  { en: 'Our teacher told us an interesting story', zh: '老师给我们讲了个有趣的故事' },
  { en: 'I am learning to play the guitar', zh: '我正在学吉他' },
  { en: 'They are planting trees in the garden', zh: '他们在花园里种树' },
  { en: 'Please remember to turn off the lights', zh: '请记得关灯' },
  { en: 'We had a wonderful time at the beach', zh: '我们在海边玩得很开心' },
  { en: 'Reading books makes me feel happy', zh: '读书让我觉得快乐' },
  { en: 'I will try my best in the exam', zh: '考试我会尽最大努力' },
]


/** 挑战档:长句、从句、时态变化 —— 复述这些才真正在练听力保持 */
const RETELL_HARD: RetellSentence[] = [
  { en: 'The boy who won the race is my classmate', zh: '赢得比赛的那个男孩是我同学' },
  { en: 'If it rains tomorrow, we will stay at home', zh: '如果明天下雨,我们就待在家里' },
  { en: 'She has been learning English for three years', zh: '她学英语已经三年了' },
  { en: 'I was doing my homework when the phone rang', zh: '电话响的时候我正在写作业' },
  { en: 'The book that I borrowed last week is very interesting', zh: '我上周借的那本书非常有意思' },
  { en: 'My father told me that he would come back on Friday', zh: '爸爸告诉我他周五会回来' },
  { en: 'Although he was tired, he finished all his work', zh: '虽然他很累,还是完成了所有工作' },
  { en: 'The higher you climb, the more you can see', zh: '爬得越高,看得越远' },
  { en: 'We should not judge people by how they look', zh: '我们不该以貌取人' },
  { en: 'Nobody knows what will happen in the future', zh: '没人知道未来会发生什么' },
  { en: 'The teacher asked us to hand in our papers before noon', zh: '老师让我们中午前交论文' },
  { en: 'This is the most beautiful place I have ever seen', zh: '这是我见过最美的地方' },
  { en: 'He practices the piano every day so that he can play well', zh: '他每天练钢琴,为的是能弹得好' },
  { en: 'They have lived in this city since they were children', zh: '他们从小就住在这座城市' },
  { en: 'Learning a language takes time and a lot of patience', zh: '学一门语言需要时间和大量耐心' },
  { en: 'I would rather read a book than watch television', zh: '比起看电视我更愿意读书' },
  { en: 'The more you practice, the better you will become', zh: '练得越多,进步越大' },
  { en: 'She was so excited that she could not fall asleep', zh: '她激动得睡不着' },
  { en: 'Please remind me to call the doctor this afternoon', zh: '请提醒我下午给医生打电话' },
  { en: 'It is important to keep trying even when things are hard', zh: '即使很难也要坚持下去,这很重要' },
]

export function retellSentencesFor(stage: AgeStage): RetellSentence[] {
  return stage === 'toddler' ? RETELL_TODDLER : RETELL_OLDER
}

/** 按难度档取复述句 */
export function retellByLevel(level: DialogLevel): RetellSentence[] {
  if (level === 'easy') return RETELL_TODDLER
  if (level === 'medium') return RETELL_OLDER
  return RETELL_HARD
}

/** 按学段筛选对话:幼儿只看短对话,小学及以上全部可练(先易后难) */
export function dialogsFor(stage: AgeStage): Dialog[] {
  if (stage === 'toddler') return DIALOGS.filter((d) => d.level === 'easy')
  return DIALOGS
}

/**
 * 学段对应的默认难度。
 * 这只是**起点**,孩子和家长随时可以自己往上或往下调 ——
 * 听力超前口语落后、或者今天状态好想挑战一下,都是很常见的事。
 */
export function defaultLevelFor(stage: AgeStage): DialogLevel {
  if (stage === 'toddler') return 'easy'
  if (stage === 'primary') return 'medium'
  return 'hard'
}

/** 按难度档取对话 */
export function dialogsByLevel(level: DialogLevel): Dialog[] {
  return DIALOGS.filter((d) => d.level === level)
}

/**
 * 按难度档取动画短片。
 * 挑战档没有专门的动画(自制动画本来就偏低龄),这时回落到进阶档,
 * 免得孩子选了「挑战」这一栏就空了。
 */
export function cartoonsByLevel(level: DialogLevel): Cartoon[] {
  const hit = CARTOONS.filter((c) => c.level === level)
  return hit.length > 0 ? hit : CARTOONS
}

/** 每档各有多少个对话 —— 难度选择器上显示数量 */
export function dialogCounts(): Record<DialogLevel, number> {
  return {
    easy: dialogsByLevel('easy').length,
    medium: dialogsByLevel('medium').length,
    hard: dialogsByLevel('hard').length,
  }
}


// ============ 英语动画短片(自制:emoji 场景 + CSS 动画 + 真人音朗读) ============
// 说明:市面上的英文动画片没有可合法内置的免费片源,所以这里用**自制动画短片**
// 代替 —— 每句一个会动的大场景 + 英中双语字幕 + 真人音源朗读 + 跟读打分,
// 孩子可以"看着动画跟着说"。内容全部原创,可放心使用。

export type SceneAnim = 'pop' | 'bounce' | 'slide' | 'spin' | 'shake' | 'float'

export interface CartoonLine {
  /** 场景大图(emoji,可多个组合) */
  scene: string
  en: string
  zh: string
  anim?: SceneAnim
}

export interface Cartoon {
  key: string
  title: string
  titleZh: string
  icon: string
  level: DialogLevel
  lines: CartoonLine[]
}

export const CARTOONS: Cartoon[] = [
  {
    key: 'morning',
    title: 'Good Morning',
    titleZh: '早上好',
    icon: '🌅',
    level: 'easy',
    lines: [
      { scene: '🌅', en: 'The sun is up.', zh: '太阳出来了。', anim: 'float' },
      { scene: '⏰', en: 'My clock says seven.', zh: '我的钟表七点了。', anim: 'shake' },
      { scene: '🛏️', en: 'I wake up and stretch.', zh: '我起床伸个懒腰。', anim: 'pop' },
      { scene: '🪥', en: 'I brush my teeth.', zh: '我刷牙。', anim: 'bounce' },
      { scene: '🥛🍞', en: 'I eat bread and drink milk.', zh: '我吃面包喝牛奶。', anim: 'pop' },
      { scene: '🎒', en: 'I put on my backpack.', zh: '我背上书包。', anim: 'slide' },
      { scene: '👋', en: 'Goodbye, Mom!', zh: '再见,妈妈!', anim: 'bounce' },
      { scene: '🏫', en: 'I go to school. Good morning!', zh: '我去上学。早上好!', anim: 'slide' },
    ],
  },
  {
    key: 'park',
    title: 'At the Park',
    titleZh: '在公园',
    icon: '🌳',
    level: 'easy',
    lines: [
      { scene: '🌳🌞', en: 'Today we go to the park.', zh: '今天我们去公园。', anim: 'float' },
      { scene: '🐦', en: 'I see a little bird.', zh: '我看见一只小鸟。', anim: 'float' },
      { scene: '🌸', en: 'The flowers are pink.', zh: '花是粉色的。', anim: 'pop' },
      { scene: '⚽', en: 'I play with my ball.', zh: '我玩我的球。', anim: 'bounce' },
      { scene: '🛝', en: 'I go down the slide. Wheee!', zh: '我滑滑梯。哇哦!', anim: 'slide' },
      { scene: '🐶', en: 'A dog runs to me.', zh: '一只小狗跑向我。', anim: 'bounce' },
      { scene: '🍦', en: 'We eat ice cream.', zh: '我们吃冰淇淋。', anim: 'pop' },
      { scene: '🏠', en: 'Now we go home. What a nice day!', zh: '现在我们回家。真是美好的一天!', anim: 'slide' },
    ],
  },
  {
    key: 'cat',
    title: 'Where Is My Cat',
    titleZh: '我的小猫在哪里',
    icon: '🐱',
    level: 'easy',
    lines: [
      { scene: '🐱', en: 'I have a little cat.', zh: '我有一只小猫。', anim: 'pop' },
      { scene: '❓', en: 'Where is my cat?', zh: '我的小猫在哪里?', anim: 'shake' },
      { scene: '🛋️', en: 'Is it under the sofa? No.', zh: '在沙发下面吗?不在。', anim: 'shake' },
      { scene: '📦', en: 'Is it in the box? No.', zh: '在箱子里吗?不在。', anim: 'shake' },
      { scene: '🌳', en: 'Is it up the tree? No.', zh: '在树上吗?不在。', anim: 'shake' },
      { scene: '🛏️', en: 'Look! It is on my bed.', zh: '看!它在我床上。', anim: 'pop' },
      { scene: '😴', en: 'My cat is sleeping.', zh: '我的小猫在睡觉。', anim: 'float' },
      { scene: '🥰', en: 'Good night, little cat.', zh: '晚安,小猫。', anim: 'bounce' },
    ],
  },
  {
    key: 'rain',
    title: 'A Rainy Day',
    titleZh: '下雨天',
    icon: '🌧️',
    level: 'easy',
    lines: [
      { scene: '☁️', en: 'The sky is gray.', zh: '天空是灰色的。', anim: 'float' },
      { scene: '🌧️', en: 'Rain, rain, it is raining!', zh: '雨,雨,下雨啦!', anim: 'shake' },
      { scene: '☂️', en: 'I open my umbrella.', zh: '我打开雨伞。', anim: 'pop' },
      { scene: '🥾', en: 'I put on my boots.', zh: '我穿上雨靴。', anim: 'bounce' },
      { scene: '💦', en: 'I jump in the water. Splash!', zh: '我在水里跳。啪嗒!', anim: 'bounce' },
      { scene: '🐸', en: 'A frog says hello.', zh: '一只青蛙问好。', anim: 'bounce' },
      { scene: '🌈', en: 'The rain stops. A rainbow!', zh: '雨停了。彩虹!', anim: 'pop' },
      { scene: '😄', en: 'I love rainy days.', zh: '我喜欢下雨天。', anim: 'float' },
    ],
  },
  {
    key: 'farm',
    title: 'On the Farm',
    titleZh: '在农场',
    icon: '🚜',
    level: 'easy',
    lines: [
      { scene: '🚜', en: 'We go to the farm.', zh: '我们去农场。', anim: 'slide' },
      { scene: '🐮', en: 'The cow says moo.', zh: '奶牛哞哞叫。', anim: 'bounce' },
      { scene: '🐷', en: 'The pig says oink.', zh: '小猪呼呼叫。', anim: 'bounce' },
      { scene: '🐔', en: 'The hen has three eggs.', zh: '母鸡有三个蛋。', anim: 'pop' },
      { scene: '🐑', en: 'The sheep is white and soft.', zh: '绵羊又白又软。', anim: 'float' },
      { scene: '🌽', en: 'We pick corn and carrots.', zh: '我们摘玉米和胡萝卜。', anim: 'pop' },
      { scene: '🐴', en: 'I ride the brown horse.', zh: '我骑棕色的马。', anim: 'bounce' },
      { scene: '👋', en: 'Bye bye, farm animals!', zh: '再见,农场的动物们!', anim: 'bounce' },
    ],
  },
  {
    key: 'birthday',
    title: 'My Birthday',
    titleZh: '我的生日',
    icon: '🎂',
    level: 'easy',
    lines: [
      { scene: '🎂', en: 'Today is my birthday!', zh: '今天是我的生日!', anim: 'pop' },
      { scene: '🎈🎈', en: 'We have red and blue balloons.', zh: '我们有红气球和蓝气球。', anim: 'float' },
      { scene: '👦👧', en: 'My friends come to my home.', zh: '我的朋友们来我家。', anim: 'slide' },
      { scene: '🎁', en: 'They give me a big gift.', zh: '他们给我一个大礼物。', anim: 'pop' },
      { scene: '🕯️', en: 'I have six candles.', zh: '我有六根蜡烛。', anim: 'shake' },
      { scene: '🌟', en: 'I close my eyes and make a wish.', zh: '我闭上眼睛许个愿。', anim: 'float' },
      { scene: '🍰', en: 'We eat the cake. Yummy!', zh: '我们吃蛋糕。真好吃!', anim: 'bounce' },
      { scene: '🥳', en: 'Thank you, everyone!', zh: '谢谢大家!', anim: 'bounce' },
    ],
  },
  {
    key: 'moon',
    title: 'To the Moon',
    titleZh: '去月球',
    icon: '🚀',
    level: 'medium',
    lines: [
      { scene: '🌙', en: 'At night I look at the moon.', zh: '晚上我看月亮。', anim: 'float' },
      { scene: '💭', en: 'I want to fly to the moon.', zh: '我想飞到月球上。', anim: 'float' },
      { scene: '🚀', en: 'I build a big rocket.', zh: '我造了一个大火箭。', anim: 'pop' },
      { scene: '🔢', en: 'Three, two, one. Go!', zh: '三,二,一。出发!', anim: 'shake' },
      { scene: '✨', en: 'I fly past the shining stars.', zh: '我飞过闪亮的星星。', anim: 'slide' },
      { scene: '🌕', en: 'I land on the moon. It is very quiet.', zh: '我在月球着陆。这里很安静。', anim: 'pop' },
      { scene: '👨‍🚀', en: 'I jump high because the moon is light.', zh: '因为月球很轻,我跳得很高。', anim: 'bounce' },
      { scene: '🌍', en: 'I look at the Earth. It is blue and beautiful.', zh: '我看着地球。它又蓝又美。', anim: 'float' },
      { scene: '🏠', en: 'Then I fly home and go to bed.', zh: '然后我飞回家去睡觉。', anim: 'slide' },
    ],
  },
  {
    key: 'shop',
    title: 'At the Shop',
    titleZh: '去买东西',
    icon: '🛒',
    level: 'medium',
    lines: [
      { scene: '🛒', en: 'Mom and I go to the shop.', zh: '妈妈和我去商店。', anim: 'slide' },
      { scene: '📝', en: 'We have a shopping list.', zh: '我们有一张购物清单。', anim: 'pop' },
      { scene: '🍎', en: 'First we buy four apples.', zh: '我们先买四个苹果。', anim: 'pop' },
      { scene: '🥛', en: 'Then we buy a bottle of milk.', zh: '然后买一瓶牛奶。', anim: 'pop' },
      { scene: '🍞', en: 'The bread smells so good.', zh: '面包闻起来真香。', anim: 'float' },
      { scene: '💰', en: 'Mom pays twenty yuan.', zh: '妈妈付了二十块钱。', anim: 'shake' },
      { scene: '🛍️', en: 'I help carry the bag.', zh: '我帮忙拿袋子。', anim: 'bounce' },
      { scene: '🏠', en: 'We walk home together.', zh: '我们一起走回家。', anim: 'slide' },
    ],
  },
]

/** 按学段筛选:幼儿只看短片易档 */
export function cartoonsFor(stage: AgeStage): Cartoon[] {
  if (stage === 'toddler') return CARTOONS.filter((c) => c.level === 'easy')
  return CARTOONS
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
  {
    key: 'mary',
    title: 'Mary Had a Little Lamb',
    titleZh: '玛丽有只小羊羔',
    icon: '🐑',
    lines: [
      'Mary had a little lamb',
      'Its fleece was white as snow',
      'And everywhere that Mary went',
      'The lamb was sure to go',
    ],
  },
  {
    key: 'macdonald',
    title: 'Old MacDonald Had a Farm',
    titleZh: '老麦克唐纳有个农场',
    icon: '🚜',
    lines: [
      'Old MacDonald had a farm',
      'E I E I O',
      'And on his farm he had a cow',
      'E I E I O',
      'With a moo moo here and a moo moo there',
      'Old MacDonald had a farm',
      'E I E I O',
    ],
  },
  {
    key: 'wheels',
    title: 'The Wheels on the Bus',
    titleZh: '公交车的轮子',
    icon: '🚌',
    lines: [
      'The wheels on the bus go round and round',
      'Round and round, round and round',
      'The wheels on the bus go round and round',
      'All through the town',
    ],
  },
  {
    key: 'head',
    title: 'Head, Shoulders, Knees and Toes',
    titleZh: '头肩膝脚趾',
    icon: '🙆',
    lines: [
      'Head, shoulders, knees and toes',
      'Knees and toes',
      'Eyes and ears and mouth and nose',
      'Head, shoulders, knees and toes',
    ],
  },
  {
    key: 'happy',
    title: 'If You Are Happy',
    titleZh: '如果感到幸福',
    icon: '😄',
    lines: [
      'If you are happy and you know it',
      'Clap your hands',
      'If you are happy and you know it',
      'Clap your hands',
      'If you are happy and you know it',
      'And you really want to show it',
      'If you are happy and you know it',
      'Clap your hands',
    ],
  },
  {
    key: 'hickory',
    title: 'Hickory Dickory Dock',
    titleZh: '嘀嗒嘀嗒钟',
    icon: '🕐',
    lines: [
      'Hickory dickory dock',
      'The mouse ran up the clock',
      'The clock struck one',
      'The mouse ran down',
      'Hickory dickory dock',
    ],
  },
  {
    key: 'humpty',
    title: 'Humpty Dumpty',
    titleZh: '蛋头先生',
    icon: '🥚',
    lines: [
      'Humpty Dumpty sat on a wall',
      'Humpty Dumpty had a great fall',
      'All the king horses and all the king men',
      'Could not put Humpty together again',
    ],
  },
  {
    key: 'bridge',
    title: 'London Bridge Is Falling Down',
    titleZh: '伦敦桥要倒了',
    icon: '🌉',
    lines: [
      'London Bridge is falling down',
      'Falling down, falling down',
      'London Bridge is falling down',
      'My fair lady',
    ],
  },
  {
    key: 'sleeping',
    title: 'Are You Sleeping',
    titleZh: '你睡了吗',
    icon: '😴',
    lines: [
      'Are you sleeping, are you sleeping',
      'Brother John, Brother John',
      'Morning bells are ringing',
      'Morning bells are ringing',
      'Ding dang dong, ding dang dong',
    ],
  },
  {
    key: 'bingo',
    title: 'BINGO',
    titleZh: '宾狗小狗',
    icon: '🐶',
    lines: [
      'There was a farmer had a dog',
      'And Bingo was his name-o',
      'B I N G O, B I N G O',
      'B I N G O',
      'And Bingo was his name-o',
    ],
  },
]
