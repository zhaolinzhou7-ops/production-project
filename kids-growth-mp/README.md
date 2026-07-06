# 成长学习 · 微信小程序（学习模块）

把 `kids-growth/` 的**学习引擎**（背单词/古诗/识字/口算/错题）搬到微信小程序，并新增**录音回放、发音打分、趣味化、云同步**。用 **Taro 4 + React 语法**编写，编译到微信小程序（weapp）。

> Web/PWA 版仍在 `kids-growth/`，本目录是**独立**的小程序工程。

## 现状（批次 A · 已完成）

- Taro 工程骨架，`npm run build:weapp` 可编译出合法小程序包。
- 复用 Web 版的**纯逻辑核心**（`src/core/`：SRS 间隔重复 `srs.ts`、口算生成器 `mathDrill.ts`、练习模式配置 `practiceModes.ts`、`dateUtils/streak/id`）与**内容包**（`src/data/decks/*.json`：小学高频词/唐诗/识字）。
- **数据层**改用微信本地存储（`src/store/db.ts` 封装 `Taro.setStorage`，`src/store/study.ts` 实现卡组实例化/取题/评分/结算/积分）。
- **首页**（`pages/index`）：进入自动分配小学词库/唐诗/识字，展示各卡组待学数与成长值。
- **会话页**（`pages/session`）：**认词/认字**（看→翻→自评）与**听音选义**（听真人发音→四选一），答对加分、SRS 排期。
- **发音**：`src/lib/audio.ts` 用 `InnerAudioContext` 播有道 `dictvoice` 真人音源。

## 后续批次

- **B**：录音回放 + 本地星级打分（`RecorderManager` 录音、`InnerAudioContext` 回放、**微信同声传译插件 WechatSI** 识别→相似度→星级）+ A/B 范读对比 + 跟读/拼写/听写。
- **C**：古诗（朗读/补全）、识字听音选字、口算、错题本；音效/连击/贴纸/每日挑战；防沉迷·护眼；未成年录音隐私。
- **D**：微信云开发（wx.cloud）云同步 / 多设备。

## 本地构建（我在 CI/沙箱里做的验证）

```bash
npm install
npm run typecheck      # tsc --noEmit
npm run build:weapp    # 产出 dist/(小程序包)
```

## 在微信开发者工具里预览（需你来做）

> ⚠️ 小程序的**运行时预览必须在微信开发者工具里**进行，无法在纯命令行验证。

1. 注册一个小程序、拿到 **AppID**（个人主体即可），把 `project.config.json` 里的 `"appid": "touristappid"` 换成你的 AppID（先用 touristappid 也能在「游客模式」打开）。
2. 安装 **微信开发者工具**，`导入项目` 选本目录（`kids-growth-mp/`），编译目标 dist 由 `npm run build:weapp` 生成。
3. 播放真人发音需要网络域名许可：开发者工具右上角 `详情 → 本地设置 → 勾选「不校验合法域名…」`；正式发布前在 mp 后台把 `dict.youdao.com` 加入 **downloadFile 合法域名**。

## 批次 A 验收清单（在开发者工具里点一遍）

- [ ] 首页出现三个卡组：小学·基础高频词 / 小学·唐诗启蒙 / 小学·常用识字，各带「待学 N」。
- [ ] 点「认词」进入会话：看到单词 → 点 🔊 能听到发音 → 「看意思」显示中文 → 「记住了/没记住」进入下一张。
- [ ] 点「听音选义」：自动播放发音 → 四个中文选项，选对变绿、选错变红，随后进入下一题。
- [ ] 一组练完出现结算页（答对数 + 积分），返回首页「成长值」增加、卡组「待学」数下降。
- [ ] 「认字」卡组：显示汉字 → 「看读音」显示拼音 + 组词。
