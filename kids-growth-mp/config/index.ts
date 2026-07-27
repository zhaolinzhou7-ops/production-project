import { defineConfig } from '@tarojs/cli'
import devConfig from './dev'
import prodConfig from './prod'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default defineConfig<'webpack5'>(async (merge: any) => {
  const baseConfig = {
    projectName: 'kids-growth-mp',
    date: '2026-7-5',
    designWidth: 750,
    deviceRatio: { 640: 2.34 / 2, 750: 1, 375: 2, 828: 1.81 / 2 },
    sourceRoot: 'src',
    outputRoot: 'dist',
    plugins: [],
    defineConstants: {},
    copy: { patterns: [], options: {} },
    framework: 'react',
    compiler: { type: 'webpack5', prebundle: { enable: false } },
    cache: { enable: false },
    mini: {
      /**
       * 关掉 webpack 的体积告警。
       *
       * 它按**网页**的标准提醒「单文件超过 244KB 会影响性能」,但这里是小程序:
       * 代码包是一次性下载后常驻本地的,真正的硬指标是**主包 2MB 上限**,
       * 我们连 800KB 都不到。留着这条告警只会让每次编译都像出了问题。
       * (体积主要来自 32 个内容包的 JSON,webpack 已把它们编译成 JSON.parse
       *  的形式,解析很快;而且 learningContent 里是用到才 require。)
       */
      webpackChain(chain: { merge: (o: unknown) => void }) {
        chain.merge({ performance: { hints: false } })
      },
      postcss: {
        pxtransform: { enable: true, config: {} },
        cssModules: {
          enable: false,
          config: {
            namingPattern: 'module',
            generateScopedName: '[name]__[local]___[hash:base64:5]',
          },
        },
      },
    },
    h5: {},
  }

  if (process.env.NODE_ENV === 'development') {
    return merge({}, baseConfig, devConfig)
  }
  return merge({}, baseConfig, prodConfig)
})
