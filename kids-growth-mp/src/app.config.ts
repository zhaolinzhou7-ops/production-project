export default defineAppConfig({
  pages: ['pages/index/index', 'pages/session/index'],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#FF8FA3',
    navigationBarTitleText: '成长学习',
    navigationBarTextStyle: 'white',
  },
  // 微信同声传译插件:语音识别(打分)+ 文字转语音。
  // 版本号如失效,请在 mp 后台「设置→第三方设置→插件管理」查最新版本并更新。
  plugins: {
    WechatSI: {
      version: '0.3.5',
      provider: 'wx069ba97219f66d99',
    },
  },
  permission: {
    'scope.record': {
      desc: '用于跟读打分与录音回放(仅本地处理,不上传录音)',
    },
  },
})
