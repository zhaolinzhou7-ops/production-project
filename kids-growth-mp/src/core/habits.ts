import type { AgeStage } from '../types'

/**
 * 生活习惯打卡。
 *
 * 设计取向(儿童行为养成的通行做法):
 * - **按时段编排**(早上/下午/晚上)。习惯要挂在固定的时间锚点上才立得住,
 *   一张不分时段的长列表孩子既记不住也不会主动去看。
 * - **默认只开少数几条**。同时养 10 个习惯必然失败;先稳住 4–6 条,
 *   成了再加 —— 所以模板里只有一部分标了 default。
 * - **只加分不扣分**。漏做一天不惩罚,第二天照样能开始。
 * - 除了「几点睡、写作业」这类可核对的事,刻意放进一批**看不见的努力**:
 *   举手回答了一次、错了以后又试了一次、做了件不太想做但该做的事、
 *   不懂的地方问了出来。这类条目分值更高,因为它们才是真正难的部分 ——
 *   只奖励「按时完成」会养出听话的孩子,奖励「敢试、敢问、敢承担」
 *   才是我们真想要的。
 * - 习惯和学习**共用同一套成长值**:生活自理与学习同等重要,不分主次。
 */
export type HabitPeriod = 'morning' | 'noon' | 'evening'

export const PERIODS: Array<{ key: HabitPeriod; label: string; emoji: string }> = [
  { key: 'morning', label: '早上', emoji: '🌅' },
  { key: 'noon', label: '白天', emoji: '☀️' },
  { key: 'evening', label: '晚上', emoji: '🌙' },
]

/**
 * 习惯分类(与网页版一致)。
 *
 * 时段回答「什么时候做」,分类回答「这是哪方面的成长」——
 * 两者都需要:家长看分类能发现「这周全是学习,一条运动都没有」,
 * 孩子看时段才知道现在该做什么。
 */
export type HabitCategory = '生活' | '学习' | '运动' | '品德' | '家务'

export const CATEGORY_COLOR: Record<HabitCategory, string> = {
  生活: '#38bdf8',
  学习: '#a78bfa',
  运动: '#34d399',
  品德: '#fb7185',
  家务: '#fbbf24',
}

export interface HabitTemplate {
  key: string
  name: string
  emoji: string
  period: HabitPeriod
  points: number
  /** 哪方面的成长 */
  category: HabitCategory
  /**
   * 周任务:一周做一次就算(整理错题、周复盘这类)。
   * 天天要求做反而会让它变成负担,最后一条也不做。
   */
  weekly?: boolean
  /** 是否为该学段默认开启(其余的家长可自行添加) */
  default?: boolean
}

export const HABIT_TEMPLATES: Record<AgeStage, HabitTemplate[]> = {
  toddler: [
    { key: 't-poop', name: '按时蹲粑粑', emoji: '🚽', period: 'morning', category: '生活', points: 5 },
    { key: 't-handwash-home', name: '回家先洗手', emoji: '🧼', period: 'noon', category: '生活', points: 5 },
    { key: 't-tissue', name: '擤鼻涕会用纸巾', emoji: '🤧', period: 'noon', category: '生活', points: 5 },
    { key: 't-nobite', name: '没有咬手指', emoji: '🖐️', period: 'evening', category: '生活', points: 5 },
    { key: 't-bath', name: '洗澡不哭闹', emoji: '🛁', period: 'evening', category: '生活', points: 5 },
    { key: 't-sitmeal', name: '坐着把饭吃完', emoji: '🍚', period: 'noon', category: '生活', points: 5 },
    { key: 't-nail', name: '剪指甲', emoji: '✂️', period: 'evening', category: '生活', points: 5, weekly: true },
    { key: 't-sun', name: '出去晒太阳玩一会儿', emoji: '☀️', period: 'noon', category: '运动', points: 5 },
    { key: 't-run', name: '跑一跑跳一跳', emoji: '🤸', period: 'noon', category: '运动', points: 5 },
    { key: 't-thanks', name: '说了谢谢', emoji: '🙏', period: 'evening', category: '品德', points: 5 },
    { key: 't-listen', name: '别人说话听完再说', emoji: '👂', period: 'evening', category: '品德', points: 10 },
    { key: 't-shoetidy', name: '鞋子摆整齐', emoji: '👟', period: 'evening', category: '家务', points: 5 },
    { key: 't-table', name: '帮忙摆碗筷', emoji: '🍽️', period: 'noon', category: '家务', points: 5 },
    { key: 't-brave', name: '今天做了件勇敢的事', emoji: '🦁', period: 'evening', category: '品德', points: 10 },
    { key: 't-try', name: '自己先试了一次', emoji: '💪', period: 'noon', category: '品德', points: 10 },
    { key: 't-sorry', name: '做错了会说对不起', emoji: '🙇', period: 'evening', category: '品德', points: 5 },
    { key: 't-wait', name: '排队等一等没着急', emoji: '⏳', period: 'noon', category: '品德', points: 5 },
    { key: 't-hug', name: '和家人抱一下', emoji: '🤗', period: 'evening', category: '品德', points: 5 },
    { key: 't-wash', name: '饭前洗手', emoji: '🧼', period: 'noon', category: '生活', points: 5 },
    { key: 't-water', name: '主动喝水', emoji: '🥤', period: 'noon', category: '生活', points: 5 },
    { key: 't-greet', name: '见到人主动打招呼', emoji: '👋', period: 'morning', category: '品德', points: 5 },
    { key: 't-shoes', name: '鞋子摆整齐', emoji: '👟', period: 'evening', category: '家务', points: 5 },
    { key: 't-help', name: '帮爸爸妈妈做一件小事', emoji: '🤲', period: 'evening', category: '家务', points: 5 },
    { key: 't-sing', name: '唱首歌 / 跳个舞', emoji: '🎵', period: 'noon', category: '运动', points: 5 },
    { key: 't-noscreen', name: '今天没多看电视', emoji: '📵', period: 'evening', category: '生活', points: 5 },
    { key: 't-veggie', name: '吃了蔬菜', emoji: '🥦', period: 'noon', category: '生活', points: 5 },
    { key: 't-brush-am', name: '早上刷牙', emoji: '🪥', period: 'morning', category: '生活', points: 5, default: true },
    { key: 't-dress', name: '自己穿衣穿鞋', emoji: '👕', period: 'morning', category: '生活', points: 5, default: true },
    { key: 't-eat', name: '自己吃饭', emoji: '🍚', period: 'noon', category: '生活', points: 5, default: true },
    { key: 't-toilet', name: '自己上厕所', emoji: '🚽', period: 'noon', category: '生活', points: 5 },
    { key: 't-nap', name: '按时午睡', emoji: '😴', period: 'noon', category: '生活', points: 5 },
    { key: 't-outdoor', name: '出去玩一会儿', emoji: '🌳', period: 'noon', category: '运动', points: 5, default: true },
    { key: 't-toys', name: '收好玩具', emoji: '🧸', period: 'evening', category: '家务', points: 5, default: true },
    { key: 't-read', name: '听爸爸妈妈讲故事', emoji: '📖', period: 'evening', category: '生活', points: 5, default: true },
    { key: 't-brush-pm', name: '晚上刷牙', emoji: '🪥', period: 'evening', category: '生活', points: 5, default: true },
    { key: 't-polite', name: '说请、谢谢、对不起', emoji: '💗', period: 'noon', category: '品德', points: 5 },
    { key: 't-share', name: '和小朋友好好玩', emoji: '🤝', period: 'noon', category: '品德', points: 5 },
    { key: 't-sleep', name: '按时上床睡觉', emoji: '🛏️', period: 'evening', category: '生活', points: 5, default: true },
  ],
  primary: [
    { key: 'p-poop', name: '按时上大号', emoji: '🚽', period: 'morning', category: '生活', points: 5 },
    { key: 'p-posture', name: '写字坐姿端正', emoji: '🪑', period: 'noon', category: '学习', points: 5 },
    { key: 'p-bottle', name: '上学带够水', emoji: '🚰', period: 'morning', category: '生活', points: 5 },
    { key: 'p-outdoor', name: '户外活动一小时', emoji: '🌤️', period: 'noon', category: '运动', points: 10 },
    { key: 'p-bath', name: '自己洗澡洗干净', emoji: '🛁', period: 'evening', category: '生活', points: 5 },
    { key: 'p-socks', name: '换洗内衣袜子', emoji: '🧦', period: 'evening', category: '生活', points: 5 },
    { key: 'p-nail', name: '剪指甲', emoji: '✂️', period: 'evening', category: '生活', points: 5, weekly: true },
    { key: 'p-desk', name: '睡前收拾书桌', emoji: '🗂️', period: 'evening', category: '家务', points: 5 },
    { key: 'p-clothes', name: '自己叠衣服', emoji: '👕', period: 'evening', category: '家务', points: 5 },
    { key: 'p-tomorrow', name: '想一想明天要做什么', emoji: '📝', period: 'evening', category: '学习', points: 5 },
    { key: 'p-helpone', name: '主动帮了家里人一次', emoji: '🤝', period: 'evening', category: '品德', points: 10 },
    { key: 'p-nowaste', name: '光盘不浪费', emoji: '🍚', period: 'noon', category: '品德', points: 5 },
    { key: 'p-brave', name: '举手回答了一次', emoji: '🙋', period: 'noon', category: '品德', points: 10 },
    { key: 'p-hard', name: '做了一件不太想做但该做的事', emoji: '💪', period: 'evening', category: '品德', points: 15 },
    { key: 'p-ask', name: '不懂的地方问了出来', emoji: '❓', period: 'noon', category: '学习', points: 10 },
    { key: 'p-again', name: '错了以后又试了一次', emoji: '🔁', period: 'evening', category: '品德', points: 10 },
    { key: 'p-praise', name: '夸了别人一句', emoji: '👏', period: 'noon', category: '品德', points: 5 },
    { key: 'p-own', name: '自己的事自己做完了', emoji: '✅', period: 'evening', category: '生活', points: 10 },
    { key: 'p-water', name: '喝够水', emoji: '🥤', period: 'noon', category: '生活', points: 5 },
    { key: 'p-eye', name: '用眼半小时休息一次', emoji: '👀', period: 'noon', category: '生活', points: 5 },
    { key: 'p-diary', name: '写一句今天的事', emoji: '✍️', period: 'evening', category: '学习', points: 10 },
    { key: 'p-review', name: '复习今天学的', emoji: '🔁', period: 'evening', category: '学习', points: 10 },
    { key: 'p-english', name: '听 10 分钟英语', emoji: '🎧', period: 'noon', category: '学习', points: 10 },
    { key: 'p-thanks', name: '对帮过我的人说谢谢', emoji: '💗', period: 'evening', category: '品德', points: 5 },
    { key: 'p-noscreen', name: '控制看屏幕时间', emoji: '📵', period: 'evening', category: '生活', points: 10 },
    { key: 'p-table', name: '摆碗筷 / 收桌子', emoji: '🍽️', period: 'evening', category: '家务', points: 5 },
    { key: 'p-jump', name: '跳绳 / 拍球', emoji: '🤸', period: 'noon', category: '运动', points: 10 },
    { key: 'p-w-wrong', name: '整理一次错题本', emoji: '📒', period: 'evening', category: '学习', points: 15, weekly: true },
    { key: 'p-w-plan', name: '周末做下周计划', emoji: '🗓️', period: 'evening', category: '学习', points: 15, weekly: true },
    { key: 'p-w-clean', name: '周末大扫除帮忙', emoji: '🧹', period: 'noon', category: '家务', points: 15, weekly: true },
    { key: 'p-wake', name: '按时起床', emoji: '⏰', period: 'morning', category: '生活', points: 5, default: true },
    { key: 'p-brush-am', name: '早上刷牙', emoji: '🪥', period: 'morning', category: '生活', points: 5, default: true },
    { key: 'p-bag', name: '整理书包', emoji: '🎒', period: 'morning', category: '生活', points: 5 },
    { key: 'p-eat', name: '好好吃饭不挑食', emoji: '🍚', period: 'noon', category: '生活', points: 5 },
    { key: 'p-homework', name: '完成作业', emoji: '✏️', period: 'noon', category: '学习', points: 10, default: true },
    { key: 'p-read', name: '阅读 20 分钟', emoji: '📖', period: 'evening', category: '学习', points: 10, default: true },
    { key: 'p-sport', name: '运动 30 分钟', emoji: '⚽', period: 'noon', category: '运动', points: 10, default: true },
    { key: 'p-practice', name: '练琴 / 练字', emoji: '🎹', period: 'evening', category: '学习', points: 10 },
    { key: 'p-chore', name: '帮忙做家务', emoji: '🧺', period: 'evening', category: '家务', points: 5 },
    { key: 'p-room', name: '整理房间', emoji: '🧹', period: 'evening', category: '家务', points: 5 },
    { key: 'p-brush-pm', name: '晚上刷牙', emoji: '🪥', period: 'evening', category: '生活', points: 5, default: true },
    { key: 'p-sleep', name: '按时睡觉', emoji: '🌙', period: 'evening', category: '生活', points: 5, default: true },
    { key: 'p-polite', name: '礼貌待人', emoji: '🤝', period: 'noon', category: '品德', points: 5 },
    { key: 'p-help', name: '帮助别人一次', emoji: '💗', period: 'noon', category: '品德', points: 5 },
  ],
  junior: [
    { key: 'j-poop', name: '作息规律,按时排便', emoji: '🚽', period: 'morning', category: '生活', points: 5 },
    { key: 'j-exercise', name: '运动出汗 30 分钟', emoji: '🏃', period: 'noon', category: '运动', points: 10 },
    { key: 'j-eyerest', name: '用眼一小时远眺一次', emoji: '👀', period: 'noon', category: '生活', points: 5 },
    { key: 'j-bath', name: '洗澡换衣', emoji: '🛁', period: 'evening', category: '生活', points: 5 },
    { key: 'j-room', name: '收拾自己的房间', emoji: '🧹', period: 'evening', category: '家务', points: 5 },
    { key: 'j-mood', name: '记一句今天的心情', emoji: '📓', period: 'evening', category: '品德', points: 5 },
    { key: 'j-breakfast', name: '吃早饭', emoji: '🥣', period: 'morning', category: '生活', points: 5 },
    { key: 'j-hard', name: '主动做了最难的那一项', emoji: '⛰️', period: 'evening', category: '学习', points: 15 },
    { key: 'j-ask', name: '不懂就问,没糊过去', emoji: '❓', period: 'noon', category: '学习', points: 10 },
    { key: 'j-focus', name: '有一段时间完全专注', emoji: '🎯', period: 'evening', category: '学习', points: 10 },
    { key: 'j-own', name: '为自己的选择负了责', emoji: '🫡', period: 'evening', category: '品德', points: 10 },
    { key: 'j-water', name: '喝够水', emoji: '🥤', period: 'noon', category: '生活', points: 5 },
    { key: 'j-notes', name: '整理今天的笔记', emoji: '📓', period: 'evening', category: '学习', points: 10 },
    { key: 'j-english', name: '背 20 个单词', emoji: '🔤', period: 'noon', category: '学习', points: 10 },
    { key: 'j-help', name: '帮同学或家人一次', emoji: '🤝', period: 'noon', category: '品德', points: 5 },
    { key: 'j-tidy', name: '整理书桌', emoji: '🗄️', period: 'evening', category: '家务', points: 5 },
    { key: 'j-w-wrong', name: '整理错题与知识点', emoji: '📒', period: 'evening', category: '学习', points: 15, weekly: true },
    { key: 'j-w-review', name: '周复盘与下周规划', emoji: '🗓️', period: 'evening', category: '学习', points: 20, weekly: true },
    { key: 'j-wake', name: '按时起床', emoji: '⏰', period: 'morning', category: '生活', points: 5, default: true },
    { key: 'j-brush-am', name: '早上刷牙', emoji: '🪥', period: 'morning', category: '生活', points: 5, default: true },
    { key: 'j-plan', name: '列今天的计划', emoji: '🗓️', period: 'morning', category: '学习', points: 10, default: true },
    { key: 'j-homework', name: '按计划完成作业', emoji: '✏️', period: 'noon', category: '学习', points: 15, default: true },
    { key: 'j-preview', name: '预习明天的课', emoji: '📖', period: 'evening', category: '学习', points: 10 },
    { key: 'j-wrongbook', name: '整理错题', emoji: '📒', period: 'evening', category: '学习', points: 10 },
    { key: 'j-read', name: '课外阅读 30 分钟', emoji: '📚', period: 'evening', category: '学习', points: 10, default: true },
    { key: 'j-sport', name: '运动 30 分钟', emoji: '🏃', period: 'noon', category: '运动', points: 10, default: true },
    { key: 'j-screen', name: '控制手机时间', emoji: '📵', period: 'evening', category: '生活', points: 10, default: true },
    { key: 'j-chore', name: '分担家务', emoji: '🧹', period: 'evening', category: '家务', points: 5 },
    { key: 'j-talk', name: '和家人聊聊天', emoji: '💬', period: 'evening', category: '品德', points: 5 },
    { key: 'j-brush-pm', name: '晚上刷牙', emoji: '🪥', period: 'evening', category: '生活', points: 5, default: true },
    { key: 'j-sleep', name: '11 点前睡觉', emoji: '🌙', period: 'evening', category: '生活', points: 10, default: true },
  ],
  senior: [
    { key: 's-poop', name: '规律排便', emoji: '🚽', period: 'morning', category: '生活', points: 5 },
    { key: 's-exercise', name: '每天动一动', emoji: '🏃', period: 'noon', category: '运动', points: 10 },
    { key: 's-stretch', name: '久坐后起来活动', emoji: '🧘', period: 'noon', category: '生活', points: 5 },
    { key: 's-breakfast', name: '吃早饭', emoji: '🥣', period: 'morning', category: '生活', points: 5 },
    { key: 's-eyerest', name: '用眼一小时远眺一次', emoji: '👀', period: 'noon', category: '生活', points: 5 },
    { key: 's-room', name: '收拾书桌和房间', emoji: '🧹', period: 'evening', category: '家务', points: 5, weekly: true },
    { key: 's-hard', name: '先做最难的那一项', emoji: '⛰️', period: 'noon', category: '学习', points: 15 },
    { key: 's-focus', name: '有一段完全不碰手机的专注时间', emoji: '🎯', period: 'evening', category: '学习', points: 15 },
    { key: 's-own', name: '为自己的选择负了责', emoji: '🫡', period: 'evening', category: '品德', points: 10 },
    { key: 's-water', name: '喝够水', emoji: '🥤', period: 'noon', category: '生活', points: 5 },
    { key: 's-notes', name: '整理今天的笔记', emoji: '📓', period: 'evening', category: '学习', points: 10 },
    { key: 's-read', name: '课外阅读 / 时事', emoji: '📰', period: 'evening', category: '学习', points: 10 },
    { key: 's-mind', name: '静下来待十分钟', emoji: '🧘', period: 'evening', category: '生活', points: 5 },
    { key: 's-help', name: '为家人做一件事', emoji: '🤝', period: 'evening', category: '家务', points: 5 },
    { key: 's-w-wrong', name: '整理错题与知识点', emoji: '📒', period: 'evening', category: '学习', points: 15, weekly: true },
    { key: 's-w-review', name: '周复盘与下周规划', emoji: '🗓️', period: 'evening', category: '学习', points: 20, weekly: true },
    { key: 's-wake', name: '按时起床', emoji: '⏰', period: 'morning', category: '生活', points: 5, default: true },
    { key: 's-plan', name: '当日学习计划', emoji: '🗓️', period: 'morning', category: '学习', points: 10, default: true },
    { key: 's-task', name: '完成当日学习任务', emoji: '✏️', period: 'noon', category: '学习', points: 15, default: true },
    { key: 's-drill', name: '自主刷题 / 复习', emoji: '📝', period: 'evening', category: '学习', points: 15, default: true },
    { key: 's-wrongbook', name: '整理错题与知识点', emoji: '📒', period: 'evening', category: '学习', points: 10 },
    { key: 's-sport', name: '锻炼 30 分钟', emoji: '🏃', period: 'noon', category: '运动', points: 10, default: true },
    { key: 's-screen', name: '自我管理电子设备', emoji: '📵', period: 'evening', category: '生活', points: 10 },
    { key: 's-home', name: '为家里做一件事', emoji: '🏠', period: 'evening', category: '家务', points: 5 },
    { key: 's-sleep', name: '规律作息不熬夜', emoji: '🌙', period: 'evening', category: '生活', points: 10, default: true },
  ],
}

export function templatesFor(stage: AgeStage): HabitTemplate[] {
  return HABIT_TEMPLATES[stage] ?? HABIT_TEMPLATES.primary
}

export function defaultHabitsFor(stage: AgeStage): HabitTemplate[] {
  return templatesFor(stage).filter((t) => t.default)
}

/** 鼓励语:按完成比例给不同的话,避免千篇一律的「真棒」 */
export function habitCheer(done: number, total: number): string {
  if (total === 0) return '还没有安排习惯哦'
  if (done === 0) return '新的一天,从第一件小事开始 💪'
  if (done >= total) return '今天全部做到了,了不起! 🎉'
  const left = total - done
  if (left === 1) return '只差最后一件啦,加油! 🔥'
  if (done / total >= 0.5) return `已经过半,还差 ${left} 件 👍`
  return `做到了 ${done} 件,继续保持 🌱`
}
