# 小朋友成长系统

家庭自用的小朋友成长记录与习惯养成系统。本地优先、离线可用、无需账号登录，数据只存在本机浏览器中。

> 详细需求见 [`docs/SPEC.md`](docs/SPEC.md) 与种子数据 [`docs/SEED.md`](docs/SEED.md)。

## 技术栈

- React 19 + Vite + TypeScript + Tailwind CSS v4
- Zustand（应用状态：当前孩子、家长/孩子模式）
- Dexie.js（IndexedDB 本地数据库）
- react-router-dom（路由）
- lucide-react（图标）
- vite-plugin-pwa（离线可用、可添加到主屏幕）

## 开发

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # 生产构建
```

## 实施阶段

- [x] 阶段 0 · 地基：脚手架 + Dexie 数据层 + 多孩 CRUD + 双模式切换（孩子端/家长端 PIN）+ JSON 导出/导入备份
- [ ] 阶段 1 · 习惯与积分核心
- [ ] 阶段 2 · 奖励与成就
- [ ] 阶段 3 · 身体发育记录
- [ ] 阶段 4 · 学习成长档案
- [ ] 阶段 5 · 仪表盘与打磨

## 阶段 0 说明

- 默认家长 PIN 为 `1234`，可在「家长设置」中修改。
- 首次打开会引导添加第一个孩子的档案；添加后可在「家长模式 → 管理孩子」中新增、编辑或删除。
- 「家长模式 → 家长设置」中可一键导出全部数据为 JSON 备份，也可导入备份文件（导入会覆盖当前数据，操作前会二次确认）。
- 数据全部保存在浏览器 IndexedDB 中，刷新或重新打开不会丢失；照片以压缩后的 base64 存储，随备份一起导出。
