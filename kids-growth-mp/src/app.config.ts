/**
 * 是否声明「微信同声传译」插件(WechatSI:中文 TTS + 语音识别打分)。
 *
 * ⚠️ app.json 里一旦声明插件,而该 AppID 在 mp 后台没添加过它,
 * 开发者工具会直接「模拟器启动失败」—— 比没有插件更糟。
 * 所以默认**不声明**,想试的时候用 `npm run build:si` 单独编一份带插件的,
 * 失败了跑 `npm run rebuild` 就退回到不带插件的版本,不用改任何代码。
 */
const withSI = process.env.WITH_SI === '1'

export default defineAppConfig({
  ...(withSI
    ? {
        plugins: {
          WechatSI: {
            version: '0.3.5',
            provider: 'wx069ba97219f66d99',
          },
        },
      }
    : {}),
  pages: [
    'pages/index/index',
    'pages/session/index',
    'pages/math/index',
    // 做题单独一页:顶部的系统返回箭头拦不住,拆开之后返回天然回到选题页
    'pages/math/run/index',
    'pages/errorbook/index',
    'pages/talk/index',
    'pages/packs/index',
    'pages/fun/index',
    'pages/rewards/index',
    'pages/habits/index',
    'pages/parent/index',
    'pages/score/index',
    // 阶段测验:撤掉脚手架,看看他到底会多少
    'pages/exam/index',
    'pages/privacy/index',
    // 成长档案(家长记、孩子看):档案首页 + 生长曲线 + 通用记录 + 成绩 + 事例 + 年度报告
    'pages/archive/index',
    'pages/growth/index',
    'pages/records/index',
    'pages/exams/index',
    'pages/anecdotes/index',
    'pages/report/index',
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#FF8FA3',
    navigationBarTitleText: '成长学习',
    navigationBarTextStyle: 'white',
  },
  // ⚠️ 不要在这里写 permission['scope.record']:
  // app.json 的 permission 字段只接受定位相关的 scope,写录音会被判
  //「无效的 app.json permission["scope.record"]」。
  // 录音权限是首次调用录音时由微信自动弹窗申请的,说明文案在 mp 后台
  //「设置 → 服务内容声明 → 用户隐私保护指引」里填写。
})
