/* eslint-disable */
// 编一份**带「微信同声传译」插件**的小程序包(用于测试插件是否可用)。
//
// 单独做成一个脚本,是因为插件是个「要么行、要么整个模拟器起不来」的开关:
// 后台没添加过该插件时,app.json 里声明它会导致「模拟器启动失败」。
// 所以默认不带,想试就跑这个;不行就跑 npm run rebuild 退回去。
// 先清缓存再编,避免半新半旧的产物。
const { spawnSync } = require('child_process')
const path = require('path')

require(path.join(__dirname, 'clean.js'))

process.env.WITH_SI = '1'
console.log('正在编译【带同声传译插件】的版本…')
// 直接用 node 跑 taro 的入口,不经过 shell(避免 Node 22 的弃用警告)
const taroBin = path.join(__dirname, '..', 'node_modules', '@tarojs', 'cli', 'bin', 'taro')
const r = spawnSync(process.execPath, [taroBin, 'build', '--type', 'weapp'], {
  stdio: 'inherit',
  env: process.env,
  cwd: path.join(__dirname, '..'),
})
if (r.status === 0) {
  const v = spawnSync('node', [path.join(__dirname, 'verify-bundle.js')], {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..'),
  })
  process.exit(v.status === null ? 1 : v.status)
}
process.exit(r.status === null ? 1 : r.status)
