/* eslint-disable */
// 清掉所有编译中间产物,再编译就是全新的一份。
//
// 为什么需要:webpack 有文件级缓存,缓存一旦和源码对不上,
// 会编出「页面文件是新的、公共文件是旧的」这种半新半旧的产物,
// 运行时报 xxx is not a function —— 看起来像代码有 bug,其实是缓存坏了。
// 跨平台(Windows/Mac 都能跑),所以用 Node 而不是 rm -rf。
const fs = require('fs')
const path = require('path')

const targets = ['dist', '.swc', '.temp', '.rn_temp', path.join('node_modules', '.cache')]

for (const t of targets) {
  const p = path.resolve(__dirname, '..', t)
  try {
    fs.rmSync(p, { recursive: true, force: true })
    console.log('已清除', t)
  } catch (e) {
    console.log('跳过', t, e && e.message)
  }
}
console.log('清理完成,可以重新编译了。')
