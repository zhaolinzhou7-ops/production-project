export default defineAppConfig({
  pages: [
    'pages/index/index',
    'pages/session/index',
    'pages/math/index',
    'pages/errorbook/index',
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#FF8FA3',
    navigationBarTitleText: '成长学习',
    navigationBarTextStyle: 'white',
  },
  // ⚠️ 微信同声传译插件(语音识别打分 + 中文 TTS)默认**不声明**。
  //
  // 原因:app.json 里一旦声明插件,而该 AppID 在 mp 后台没有添加过它,
  // 开发者工具会直接「模拟器启动失败」——比没有插件更糟。
  // 没有插件时,朗读会自动改用网络真人音源(见 lib/audio.ts),功能不受影响,
  // 只是「跟读打分」退化为手动确认。
  //
  // 想启用插件:先在 mp 后台「设置 → 第三方设置 → 插件管理 → 添加插件」
  // 搜索「微信同声传译」或用 AppID wx069ba97219f66d99 添加成功后,
  // 再把下面这段注释打开并重新 npm run build:weapp。
  //
  // plugins: {
  //   WechatSI: {
  //     version: '0.3.5',
  //     provider: 'wx069ba97219f66d99',
  //   },
  // },
  // ⚠️ 不要在这里写 permission['scope.record']:
  // app.json 的 permission 字段只接受定位相关的 scope,写录音会被判
  //「无效的 app.json permission["scope.record"]」。
  // 录音权限是首次调用录音时由微信自动弹窗申请的,说明文案在 mp 后台
  //「设置 → 服务内容声明 → 用户隐私保护指引」里填写。
})
