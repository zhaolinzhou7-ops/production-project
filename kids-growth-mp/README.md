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

> ⚠️ 小程序的**运行时预览必须在微信开发者工具里**进行,无法在纯命令行验证。以下是你需要完成的配置。

1. **AppID**：注册小程序拿到 AppID（个人主体即可），把 `project.config.json` 的 `"appid": "touristappid"` 换成你的（先用 touristappid 也能进游客模式）。
2. **导入项目**：微信开发者工具 → 导入 → 选本目录；先 `npm run build:weapp` 生成 `dist/`。
3. **真人发音域名**：`详情 → 本地设置 → 勾选「不校验合法域名…」`；正式发布前在 mp 后台把 `dict.youdao.com` 加入 **downloadFile 合法域名**。
4. **语音识别 / TTS 插件**：小程序后台 `设置 → 第三方设置 → 插件管理` 添加「微信同声传译」；`src/app.config.ts` 里 `plugins.WechatSI.version` 若失效改成后台显示的最新版本。
5. **录音权限**：首次录音会弹授权，允许即可（`app.config.ts` 已声明 `scope.record`）。
6. **云同步（可选）**：开发者工具开通「云开发」，建一个环境，把环境 ID 填入 `src/cloud/config.ts` 的 `CLOUD_ENV`；在云开发控制台建集合 `learn_snapshots`，权限选「仅创建者可读写」。不填则小程序按纯本地单机运行。

## 验收清单（在开发者工具里点一遍）

- [ ] 首页出现词/诗/字三卡组 + 口算 + 错题本入口；成长值/连续天数显示。
- [ ] **认词/认字**：看词 → 🔊 发音 → 看意思/读音 → 记住了。
- [ ] **听音选义/选字**：自动播发音 → 四选一，选对变绿。
- [ ] **拼写/听写**：输入英文 → 检查 → 对错高亮。
- [ ] **跟读**：🔊 范读；🔴 录我读的 → ▶️ 回放能听到自己的声音；🎤 跟读打分给出星级。
- [ ] **古诗**：朗读背诵能朗读整首；补全诗句四选一。
- [ ] **口算**：选题型+题量 → 限时作答 → 结算（正确率/用时/积分）。
- [ ] **错题本**：记一道错题 → 列表出现 → 重做（看题→看答案→已掌握）。
- [ ] 练习答对有轻微震动;连对出现「🔥 连对 N」;学满 30 分钟出现护眼提醒。
- [ ] （配置云开发后）点「☁️ 同步」提示已同步；换设备/清缓存后再同步能拉回进度。
