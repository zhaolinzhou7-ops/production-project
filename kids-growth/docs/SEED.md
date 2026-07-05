# 小朋友成长系统 · 种子数据（默认任务 / 奖励 / 成就 / 里程碑）

> 配套 `小朋友成长系统-ClaudeCode建设文档.md` 使用。数值和图标都可改；末尾有可直接粘贴给 Claude Code 的 JSON。图标统一用 emoji（跨平台、不依赖图标库）。

---

## 1. 默认任务清单（首次一键导入）

| 分类 | 任务 | 图标 | 类型 | 积分 |
|---|---|---|---|---|
| 生活 | 早睡早起 | 🌙 | 每日 | 10 |
| 生活 | 自己刷牙 | 🪥 | 每日 | 5 |
| 生活 | 好好吃饭不挑食 | 🍚 | 每日 | 5 |
| 生活 | 自己整理书包/穿衣 | 🎒 | 每日 | 5 |
| 学习 | 完成作业 | ✏️ | 每日 | 15 |
| 学习 | 阅读 20 分钟 | 📖 | 每日 | 10 |
| 学习 | 练琴/练字 | 🎹 | 每日 | 15 |
| 运动 | 运动 30 分钟 | ⚽ | 每日 | 10 |
| 运动 | 户外活动 | 🌳 | 每日 | 5 |
| 品德 | 礼貌待人（请/谢谢/对不起） | 🤝 | 每日 | 5 |
| 品德 | 主动分享或帮助他人 | 💗 | 每日 | 10 |
| 家务 | 整理房间 | 🧹 | 每日 | 10 |
| 家务 | 帮忙做家务（摆碗/倒垃圾） | 🧺 | 每日 | 10 |

> 参考：孩子一天实际完成一部分，约得 **60–90 分/天**，奖励定价据此设计。

---

## 2. 奖励商城清单（家长可审批兑换）

| 奖励 | 图标 | 所需积分 | 说明 |
|---|---|---|---|
| 睡前多讲一个故事 | 📚 | 40 | 小奖励 |
| 看 30 分钟动画片 | 📺 | 50 | 小奖励 |
| 多玩 20 分钟（游戏/玩具） | 🎮 | 60 | 小奖励 |
| 选今晚的一个小零食 | 🍪 | 60 | 小奖励 |
| 一次冰淇淋 | 🍦 | 80 | 中奖励 |
| 决定周末晚餐吃什么 | 🍜 | 120 | 中奖励 |
| 选一本新书 | 📖 | 150 | 中奖励 |
| 周末去公园/游乐场 | 🎡 | 250 | 大奖励 |
| 去电影院看一场电影 | 🎬 | 300 | 大奖励 |
| 一个心愿小礼物（家长设上限） | 🎁 | 500 | 大奖励 |

---

## 3. 成就 / 徽章清单（规则可自动判定）

| 徽章 | 图标 | 解锁条件 | 规则 |
|---|---|---|---|
| 初来乍到 | 🐣 | 完成第一个任务 | firstCheckin |
| 坚持之星 | 🔥 | 连续打卡 7 天 | streak · 7 |
| 毅力大师 | 🏆 | 连续打卡 30 天 | streak · 30 |
| 完美一天 | 🌟 | 某天当日任务全部完成 | perfectDay |
| 全勤一周 | 📅 | 最近 7 天每天都有完成 | weekFull |
| 勤学小能手 | 📚 | "学习"类累计完成 30 次 | categoryCheckins · 学习 · 30 |
| 运动健将 | 🏃 | "运动"类累计完成 30 次 | categoryCheckins · 运动 · 30 |
| 家务小帮手 | 🧹 | "家务"类累计完成 20 次 | categoryCheckins · 家务 · 20 |
| 百题达成 | 💯 | 累计完成 100 个任务 | totalCheckins · 100 |
| 第一次兑换 | 🎁 | 首次兑换成功 | firstRedeem |
| 成长开始 | 📏 | 首次记录身高体重 | firstGrowth |
| 小小艺术家 | 🎨 | 首件作品入档 | firstPortfolio |
| 节节高升 | ⬆️ | 达到 Lv5 | level · 5 |
| 成长大师 | 👑 | 达到 Lv10 | level · 10 |

**规则类型说明（给 Claude Code 实现用）**
- `firstCheckin`：第一条 done 打卡即解锁
- `streak(days)`：连续打卡天数 ≥ days
- `perfectDay`：某一天该孩子当日所有生效任务都 done
- `weekFull`：最近 7 天每天都至少有一次 done
- `totalCheckins(count)`：累计 done 次数 ≥ count
- `categoryCheckins(category, count)`：某分类累计 done ≥ count
- `firstRedeem` / `firstGrowth` / `firstPortfolio`：对应模块首次记录
- `level(level)`：等级 ≥ level

---

## 4. 里程碑预设（发育记录里选用）

第一次翻身 · 第一次坐 · 第一次爬 · 第一次走路 · 长第一颗牙 · 第一次叫爸爸/妈妈 · 说第一句完整的话 · 第一天上幼儿园 · 第一天上小学 · 第一次自己睡 · 第一次不用辅助轮骑车 · 第一次游泳 · 掉第一颗乳牙 · 第一次登台表演 · 第一次得奖/满分（+ 自定义）

---

## 5. 等级阶梯（与建设文档一致，可调）

| 等级 | 称号 | 累计 XP |
|---|---|---|
| Lv1 | 🌱 萌芽 | 0 |
| Lv2 | 🌿 嫩苗 | 100 |
| Lv3 | 🌳 小树 | 250 |
| Lv4 | 💪 茁壮 | 500 |
| Lv5 | 🍃 繁叶 | 900 |
| Lv6 | 🌸 开花 | 1500 |
| Lv7 | 🍎 结果 | 2200 |
| Lv8 | 🌲 大树 | 3000 |
| Lv9 | ✨ 森林之星 | 4000 |
| Lv10 | ⭐ 成长大师 | 5200 |

---

## 6. 可直接使用的 JSON（丢给 Claude Code 当种子数据）

```json
{
  "defaultTasks": [
    { "title": "早睡早起", "icon": "🌙", "category": "生活", "type": "daily", "points": 10 },
    { "title": "自己刷牙", "icon": "🪥", "category": "生活", "type": "daily", "points": 5 },
    { "title": "好好吃饭不挑食", "icon": "🍚", "category": "生活", "type": "daily", "points": 5 },
    { "title": "自己整理书包/穿衣", "icon": "🎒", "category": "生活", "type": "daily", "points": 5 },
    { "title": "完成作业", "icon": "✏️", "category": "学习", "type": "daily", "points": 15 },
    { "title": "阅读20分钟", "icon": "📖", "category": "学习", "type": "daily", "points": 10 },
    { "title": "练琴/练字", "icon": "🎹", "category": "学习", "type": "daily", "points": 15 },
    { "title": "运动30分钟", "icon": "⚽", "category": "运动", "type": "daily", "points": 10 },
    { "title": "户外活动", "icon": "🌳", "category": "运动", "type": "daily", "points": 5 },
    { "title": "礼貌待人", "icon": "🤝", "category": "品德", "type": "daily", "points": 5 },
    { "title": "主动分享或帮助他人", "icon": "💗", "category": "品德", "type": "daily", "points": 10 },
    { "title": "整理房间", "icon": "🧹", "category": "家务", "type": "daily", "points": 10 },
    { "title": "帮忙做家务", "icon": "🧺", "category": "家务", "type": "daily", "points": 10 }
  ],
  "defaultRewards": [
    { "name": "睡前多讲一个故事", "icon": "📚", "costPoints": 40 },
    { "name": "看30分钟动画片", "icon": "📺", "costPoints": 50 },
    { "name": "多玩20分钟", "icon": "🎮", "costPoints": 60 },
    { "name": "选今晚的一个小零食", "icon": "🍪", "costPoints": 60 },
    { "name": "一次冰淇淋", "icon": "🍦", "costPoints": 80 },
    { "name": "决定周末晚餐吃什么", "icon": "🍜", "costPoints": 120 },
    { "name": "选一本新书", "icon": "📖", "costPoints": 150 },
    { "name": "周末去公园/游乐场", "icon": "🎡", "costPoints": 250 },
    { "name": "去电影院看一场电影", "icon": "🎬", "costPoints": 300 },
    { "name": "一个心愿小礼物", "icon": "🎁", "costPoints": 500 }
  ],
  "achievements": [
    { "code": "first_checkin", "name": "初来乍到", "icon": "🐣", "desc": "完成第一个任务", "rule": { "type": "firstCheckin" } },
    { "code": "streak_7", "name": "坚持之星", "icon": "🔥", "desc": "连续打卡7天", "rule": { "type": "streak", "days": 7 } },
    { "code": "streak_30", "name": "毅力大师", "icon": "🏆", "desc": "连续打卡30天", "rule": { "type": "streak", "days": 30 } },
    { "code": "perfect_day", "name": "完美一天", "icon": "🌟", "desc": "某天任务全部完成", "rule": { "type": "perfectDay" } },
    { "code": "week_full", "name": "全勤一周", "icon": "📅", "desc": "最近7天每天都有完成", "rule": { "type": "weekFull" } },
    { "code": "study_30", "name": "勤学小能手", "icon": "📚", "desc": "学习类累计完成30次", "rule": { "type": "categoryCheckins", "category": "学习", "count": 30 } },
    { "code": "sport_30", "name": "运动健将", "icon": "🏃", "desc": "运动类累计完成30次", "rule": { "type": "categoryCheckins", "category": "运动", "count": 30 } },
    { "code": "chore_20", "name": "家务小帮手", "icon": "🧹", "desc": "家务类累计完成20次", "rule": { "type": "categoryCheckins", "category": "家务", "count": 20 } },
    { "code": "total_100", "name": "百题达成", "icon": "💯", "desc": "累计完成100个任务", "rule": { "type": "totalCheckins", "count": 100 } },
    { "code": "first_redeem", "name": "第一次兑换", "icon": "🎁", "desc": "首次兑换成功", "rule": { "type": "firstRedeem" } },
    { "code": "first_growth", "name": "成长开始", "icon": "📏", "desc": "首次记录身高体重", "rule": { "type": "firstGrowth" } },
    { "code": "first_portfolio", "name": "小小艺术家", "icon": "🎨", "desc": "首件作品入档", "rule": { "type": "firstPortfolio" } },
    { "code": "level_5", "name": "节节高升", "icon": "⬆️", "desc": "达到Lv5", "rule": { "type": "level", "level": 5 } },
    { "code": "level_10", "name": "成长大师", "icon": "👑", "desc": "达到Lv10", "rule": { "type": "level", "level": 10 } }
  ],
  "milestonePresets": [
    "第一次翻身", "第一次坐", "第一次爬", "第一次走路", "长第一颗牙",
    "第一次叫爸爸/妈妈", "说第一句完整的话", "第一天上幼儿园", "第一天上小学",
    "第一次自己睡", "第一次不用辅助轮骑车", "第一次游泳", "掉第一颗乳牙",
    "第一次登台表演", "第一次得奖/满分"
  ],
  "levelLadder": [
    { "level": 1, "title": "🌱 萌芽", "requiredXP": 0 },
    { "level": 2, "title": "🌿 嫩苗", "requiredXP": 100 },
    { "level": 3, "title": "🌳 小树", "requiredXP": 250 },
    { "level": 4, "title": "💪 茁壮", "requiredXP": 500 },
    { "level": 5, "title": "🍃 繁叶", "requiredXP": 900 },
    { "level": 6, "title": "🌸 开花", "requiredXP": 1500 },
    { "level": 7, "title": "🍎 结果", "requiredXP": 2200 },
    { "level": 8, "title": "🌲 大树", "requiredXP": 3000 },
    { "level": 9, "title": "✨ 森林之星", "requiredXP": 4000 },
    { "level": 10, "title": "⭐ 成长大师", "requiredXP": 5200 }
  ]
}
```
