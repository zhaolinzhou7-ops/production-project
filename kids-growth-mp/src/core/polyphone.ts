/**
 * 常用多音字表。
 *
 * 识字内容包里每个字只带一个拼音,但汉字里相当一部分是多音字 ——
 * 只给一个读音,孩子会把「行 xíng」当成唯一读法,以后遇到「银行 háng」就懵。
 * 这里把小学阶段最常遇到的多音字列出来,每个读音配一个组词,
 * 让孩子知道「这个字在不同词里读不一样」。
 *
 * 收录原则:只收**孩子日常真会碰到**的,不追求穷尽 ——
 * 表太长反而没人看,也会把认字页面撑得很乱。
 */
export interface PolyphoneReading {
  py: string
  /** 这个读音下的常用词,用来区分 */
  word: string
}

export const POLYPHONES: Record<string, PolyphoneReading[]> = {
  行: [{ py: 'xíng', word: '走路 / 行走' }, { py: 'háng', word: '银行 / 一行字' }],
  长: [{ py: 'cháng', word: '长短 / 很长' }, { py: 'zhǎng', word: '长大 / 长高' }],
  重: [{ py: 'zhòng', word: '很重 / 重量' }, { py: 'chóng', word: '重来 / 重复' }],
  乐: [{ py: 'lè', word: '快乐 / 高兴' }, { py: 'yuè', word: '音乐 / 乐器' }],
  会: [{ py: 'huì', word: '开会 / 会说' }, { py: 'kuài', word: '会计' }],
  好: [{ py: 'hǎo', word: '很好 / 好人' }, { py: 'hào', word: '爱好 / 好奇' }],
  的: [{ py: 'de', word: '我的 / 红的' }, { py: 'dí', word: '的确' }],
  地: [{ py: 'dì', word: '土地 / 地方' }, { py: 'de', word: '慢慢地走' }],
  得: [{ py: 'dé', word: '得到 / 获得' }, { py: 'de', word: '跑得快' }, { py: 'děi', word: '得去' }],
  着: [{ py: 'zhe', word: '看着 / 坐着' }, { py: 'zháo', word: '着急 / 睡着' }, { py: 'zhuó', word: '穿着' }],
  了: [{ py: 'le', word: '来了 / 好了' }, { py: 'liǎo', word: '了不起 / 明了' }],
  还: [{ py: 'hái', word: '还有 / 还没' }, { py: 'huán', word: '还书 / 归还' }],
  为: [{ py: 'wèi', word: '为了 / 因为' }, { py: 'wéi', word: '成为 / 作为' }],
  和: [{ py: 'hé', word: '我和你' }, { py: 'huo', word: '暖和' }],
  中: [{ py: 'zhōng', word: '中间 / 中国' }, { py: 'zhòng', word: '中奖 / 打中' }],
  空: [{ py: 'kōng', word: '天空 / 空气' }, { py: 'kòng', word: '有空 / 空地' }],
  分: [{ py: 'fēn', word: '分开 / 十分' }, { py: 'fèn', word: '身份 / 过分' }],
  数: [{ py: 'shù', word: '数学 / 数字' }, { py: 'shǔ', word: '数一数' }],
  教: [{ py: 'jiāo', word: '教书 / 教我' }, { py: 'jiào', word: '教室 / 教师' }],
  觉: [{ py: 'jué', word: '感觉 / 觉得' }, { py: 'jiào', word: '睡觉' }],
  背: [{ py: 'bèi', word: '后背 / 背诵' }, { py: 'bēi', word: '背书包' }],
  发: [{ py: 'fā', word: '发现 / 出发' }, { py: 'fà', word: '头发' }],
  干: [{ py: 'gān', word: '干净 / 干燥' }, { py: 'gàn', word: '干活 / 能干' }],
  种: [{ py: 'zhǒng', word: '一种 / 种子' }, { py: 'zhòng', word: '种树 / 种花' }],
  少: [{ py: 'shǎo', word: '很少 / 多少' }, { py: 'shào', word: '少年 / 少先队' }],
  相: [{ py: 'xiāng', word: '相同 / 互相' }, { py: 'xiàng', word: '照相 / 相片' }],
  兴: [{ py: 'xìng', word: '高兴 / 兴趣' }, { py: 'xīng', word: '兴奋 / 兴起' }],
  只: [{ py: 'zhǐ', word: '只有 / 只是' }, { py: 'zhī', word: '一只鸟' }],
  没: [{ py: 'méi', word: '没有 / 没关系' }, { py: 'mò', word: '沉没 / 淹没' }],
  处: [{ py: 'chù', word: '到处 / 好处' }, { py: 'chǔ', word: '处理 / 相处' }],
  当: [{ py: 'dāng', word: '当时 / 应当' }, { py: 'dàng', word: '上当 / 恰当' }],
  差: [{ py: 'chà', word: '差不多 / 很差' }, { py: 'chā', word: '差别' }],
  转: [{ py: 'zhuǎn', word: '转身 / 转弯' }, { py: 'zhuàn', word: '转圈 / 打转' }],
  倒: [{ py: 'dǎo', word: '摔倒 / 倒下' }, { py: 'dào', word: '倒水 / 倒过来' }],
  参: [{ py: 'cān', word: '参加 / 参观' }, { py: 'shēn', word: '人参' }],
  藏: [{ py: 'cáng', word: '躲藏 / 收藏' }, { py: 'zàng', word: '西藏 / 宝藏' }],
  朝: [{ py: 'cháo', word: '朝着 / 朝代' }, { py: 'zhāo', word: '朝阳 / 今朝' }],
  盛: [{ py: 'shèng', word: '茂盛 / 盛开' }, { py: 'chéng', word: '盛饭' }],
  弹: [{ py: 'tán', word: '弹琴 / 弹起' }, { py: 'dàn', word: '子弹 / 弹药' }],
  角: [{ py: 'jiǎo', word: '牛角 / 角落' }, { py: 'jué', word: '角色 / 主角' }],
  尽: [{ py: 'jìn', word: '尽力 / 用尽' }, { py: 'jǐn', word: '尽管 / 尽快' }],
  几: [{ py: 'jǐ', word: '几个 / 几点' }, { py: 'jī', word: '几乎 / 茶几' }],
  卷: [{ py: 'juǎn', word: '卷起来' }, { py: 'juàn', word: '试卷 / 一卷书' }],
  量: [{ py: 'liàng', word: '数量 / 重量' }, { py: 'liáng', word: '量一量 / 测量' }],
  磨: [{ py: 'mó', word: '磨刀 / 折磨' }, { py: 'mò', word: '石磨 / 磨坊' }],
  奇: [{ py: 'qí', word: '奇怪 / 神奇' }, { py: 'jī', word: '奇数' }],
  曲: [{ py: 'qū', word: '弯曲 / 曲线' }, { py: 'qǔ', word: '歌曲 / 乐曲' }],
  舍: [{ py: 'shě', word: '舍不得 / 舍弃' }, { py: 'shè', word: '宿舍 / 房舍' }],
  调: [{ py: 'diào', word: '调走 / 声调' }, { py: 'tiáo', word: '调皮 / 调整' }],
  假: [{ py: 'jiǎ', word: '真假 / 假装' }, { py: 'jià', word: '放假 / 暑假' }],
  间: [{ py: 'jiān', word: '中间 / 房间' }, { py: 'jiàn', word: '间隔 / 间断' }],
  强: [{ py: 'qiáng', word: '强大 / 坚强' }, { py: 'qiǎng', word: '勉强 / 强迫' }],
  称: [{ py: 'chēng', word: '称呼 / 称赞' }, { py: 'chèn', word: '称心 / 对称' }],
  冲: [{ py: 'chōng', word: '冲水 / 冲上去' }, { py: 'chòng', word: '冲着' }],
  担: [{ py: 'dān', word: '担心 / 承担' }, { py: 'dàn', word: '一担水 / 扁担' }],
}

/** 查一个字的其它读音(没有多音就返回空数组) */
export function polyphoneOf(ch: string): PolyphoneReading[] {
  const list = POLYPHONES[ch]
  return Array.isArray(list) && list.length > 1 ? list : []
}

export function isPolyphone(ch: string): boolean {
  return polyphoneOf(ch).length > 1
}
