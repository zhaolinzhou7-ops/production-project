# 成长学习 · 微信小程序（学习模块）

把 `kids-growth/` 的**学习引擎**（背单词/古诗/识字/口算/错题）搬到微信小程序，并新增**录音回放、发音打分、趣味化、云同步**。用 **Taro 4 + React 语法**编写，编译到微信小程序（weapp）。

> Web/PWA 版仍在 `kids-growth/`，本目录是**独立**的小程序工程。

## 已完成（批次 A–D，均通过 `tsc --noEmit` + `taro build --type weapp` 编译验证）

- **A · 骨架 + 核心**：Taro 工程；复用 Web 版纯逻辑核心（SRS `src/core/srs.ts`、口算生成器 `mathDrill.ts`、练习模式配置、`dateUtils/streak/id`）与内容包（`src/data/decks/*.json` 词/诗/字）；数据层改用微信本地存储（`src/store/db.ts` + `study.ts`）；首页 + 会话页。
- **B · 录音回放 + 本地打分 + 跟读**：`src/lib/speech.ts`（微信同声传译插件 WechatSI：识别 + TTS）、`src/lib/recorder.ts`（`RecorderManager` 录音 + `InnerAudioContext` 回放，A/B 范读对比）、`src/core/score.ts`（相似度→鼓励式 0–3 星，**不上传录音**）；新增拼写/听写/跟读练法。
- **C · 语文 / 数学 / 错题 + 趣味化 + 防沉迷/隐私**：古诗（朗读背诵 / 补全诗句）、识字（认字 / 听音选字）、口算页（`pages/math`）、错题本页（`pages/errorbook` + 会话 review 重做）；连击 combo + 触感反馈（`vibrateShort`）+ 星级结算；每日学习时长与护眼提醒、连续学习天数；录音仅本地处理不上传的文案标注。
- **D · 云同步（微信云开发）**：`src/cloud/sync.ts` 把学习进度打成快照按 openid 存云端（仅创建者可读写），启动静默拉取、首页「☁️ 同步」手动上/下行，冲突按 `updatedAt` 后写覆盖；**只同步学习进度、不含录音**。

## 页面

`pages/index`（首页）· `pages/session`（练习会话，含 8 种练法）· `pages/math`（口算）· `pages/errorbook`（错题本）。

## 本地构建（命令行即可验证「能编译成合法小程序包」）

```bash
npm install
npm run typecheck      # tsc --noEmit
npm run build:weapp    # 产出 dist/(小程序包)
```

## 在微信开发者工具里预览（需你来做）

> ⚠️ 小程序的**运行时预览必须在微信开发者工具里**进行，命令行只能验证「能编译成合法小程序包」。

完整的一步步图文指引见对话里发的《微信小程序上手指引》。这里是命令速查：

```bash
# 1. 取最新代码（最新改动在 claude/new-session-lwlwrf 分支）
git fetch origin && git checkout claude/new-session-lwlwrf && git pull

# 2. 在**本目录**装依赖并构建（Windows 建议用 CMD，PowerShell 默认禁止跑 npm 脚本）
cd kids-growth-mp
npm install
npm run build:weapp        # 成功标志：Compiled successfully，且生成 dist/
```

必做的三件事（缺一个就会"没声音/启不来"）：

1. **注册小程序拿 AppID**（mp.weixin.qq.com，个人主体免费）→ 导入项目时填。
2. **后台添加「微信同声传译」插件**（设置 → 第三方设置 → 插件管理 → 添加插件 → 搜"微信同声传译"）。
   小程序的中英文朗读与跟读打分都靠它，不加会没声音。
3. **导入项目时目录选 `kids-growth-mp`**（不是 `dist`）——`project.config.json` 已把
   `miniprogramRoot` 指向 `dist/`。

已为开发方便把 `project.config.json` 的 `urlCheck` 设为 `false`（否则有道真人发音
`dict.youdao.com` 会被域名校验拦掉）。正式发布前需在 mp 后台把该域名加入
**downloadFile 合法域名**，再改回 `true`。

## 可选：云同步（多设备）

1. 开发者工具左上「云开发」→ 开通（免费基础版）→ 记下环境 ID。
2. 把环境 ID 填进 `src/cloud/config.ts` 的 `CLOUD_ENV`。
3. 云开发控制台 → 数据库 → 新建集合 `learn_snapshots`，权限选「仅创建者可读写」。
4. 重新 `npm run build:weapp`，首页出现「☁️ 同步」。

留空 `CLOUD_ENV` 时云同步自动禁用，小程序仍可完整单机使用。

## 当前内容范围（与网页版的差别）

小程序版含：英语小学 500 词、唐诗 103 首、常用识字 500 字、口算生成器、错题本、
录音回放与跟读打分、连击音效/震动、护眼提醒、云同步。

网页版后来新增、**小程序版尚未搬运**的部分：幼儿看图启蒙包（448 词）、字母 ABC /
自然拼读 / Sight Words、科学·安全·成语·地理问答、英语动画短片、英文儿歌、宠物养成
与贴纸册、1500 字识字三册。若小程序版的声音效果满意，可再把这些内容迁过去。
