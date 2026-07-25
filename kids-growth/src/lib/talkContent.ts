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
}

/** easy=幼儿/低年级(4 轮短句);harder=小学以上(5–6 轮,含时间/地点/原因) */
export type DialogLevel = 'easy' | 'harder'

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
    level: 'harder',
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
    level: 'harder',
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
    level: 'harder',
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
    level: 'harder',
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
    level: 'harder',
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
    level: 'harder',
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
    level: 'harder',
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
    level: 'harder',
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
    level: 'harder',
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
    level: 'harder',
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
    level: 'harder',
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
    level: 'harder',
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
    level: 'harder',
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
    level: 'harder',
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
    level: 'harder',
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
    level: 'harder',
    turns: [
      { bot: 'Hello, who is speaking?', botZh: '你好,请问是哪位?', emoji: '📞', expect: 'This is Tom speaking', expectZh: '我是汤姆' },
      { bot: 'Can I speak to your mother?', botZh: '我可以和你妈妈说话吗?', emoji: '👩', expect: 'Sorry, she is not at home', expectZh: '抱歉,她不在家' },
      { bot: 'When will she be back?', botZh: '她什么时候回来?', emoji: '🕕', expect: 'She will be back at six', expectZh: '她六点回来' },
      { bot: 'Can you take a message?', botZh: '你能帮我留个言吗?', emoji: '📝', expect: 'Sure, no problem', expectZh: '当然可以' },
      { bot: 'Thank you. Goodbye!', botZh: '谢谢,再见!', emoji: '👋', expect: 'Goodbye', expectZh: '再见' },
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

export function retellSentencesFor(stage: AgeStage): RetellSentence[] {
  return stage === 'toddler' ? RETELL_TODDLER : RETELL_OLDER
}

/** 按学段筛选对话:幼儿只看短对话,小学及以上全部可练(先易后难) */
export function dialogsFor(stage: AgeStage): Dialog[] {
  if (stage === 'toddler') return DIALOGS.filter((d) => d.level === 'easy')
  return DIALOGS
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
    level: 'harder',
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
    level: 'harder',
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
