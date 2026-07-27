/* eslint-disable */
// 校验编译产物是否自洽:每个页面 chunk 引用的「模块导出名」必须真的存在。
//
// 为什么要有这个:webpack 缓存与源码不同步时会编出「页面是新的、公共模块是旧的」
// 的产物,页面调用一个已经不存在的导出,运行时报 `xxx is not a function` ——
// 从报错完全看不出是缓存问题,排查一次要绕很久。这里在编译后直接扫一遍产物。
const fs = require('fs')
const path = require('path')

const dist = path.join(__dirname, '..', 'dist')

/**
 * 解析出「模块 id → 它导出的名字」。
 *
 * 只认**紧跟在模块开头**的 `n.d(exports, {...})`(webpack 给 ESM 模块生成的导出表)。
 * 必须先按模块边界切开再找,否则正则会跨过模块边界,把后一个模块的导出表
 * 算到前一个模块头上 —— React 这类 CommonJS 模块就是这么被误判的。
 */
function moduleExportMap(src) {
  const map = {}
  const bound = /[,{](\d+):function\([^)]*\)\{/g
  const starts = []
  let m
  while ((m = bound.exec(src))) starts.push({ id: m[1], at: m.index + m[0].length })
  for (let i = 0; i < starts.length; i++) {
    const seg = src.slice(starts[i].at, starts[i + 1] ? starts[i + 1].at : src.length)
    // 导出表必须出现在模块最开头(webpack 就是这么生成的),否则不算
    const d = seg.search(/^\w+\.d\(\w+,\{/)
    if (d !== 0) continue
    const close = seg.indexOf('});')
    if (close < 0) continue
    const names = [...seg.slice(0, close).matchAll(/(\w+):function\(\)\{return/g)].map((x) => x[1])
    if (names.length) map[starts[i].id] = names
  }
  return map
}

/**
 * 微信开发者工具在「预览 / 上传」时会用一个**很老的压缩器**处理 JS。
 * 它解析不了可选链 `?.`、空值合并 `??`、无参 `catch {}` 这些较新的语法,
 * 一旦产物里留有这些,预览就会卡在「对 JS 文件进行压缩,未通过」。
 *
 * Babel 会不会降级这些语法,取决于 package.json 的 browserslist。
 * 这里把它变成硬性校验 —— 以后谁改了 browserslist 导致退化,编译当场就会报出来,
 * 而不是等到预览时才发现。
 */
function checkLegacySyntax(files) {
  const patterns = [
    { re: /\?\./g, name: '可选链 ?.' },
    { re: /\?\?/g, name: '空值合并 ??' },
    { re: /catch\s*\{/g, name: '无参 catch {}' },
  ]
  const bad = []
  for (const f of files) {
    const src = stripStrings(fs.readFileSync(f, 'utf8'))
    for (const p of patterns) {
      const n = (src.match(p.re) || []).length
      if (n > 0) bad.push(`${path.relative(dist, f)} 里有 ${n} 处${p.name}`)
    }
  }
  return bad
}

/**
 * 把字符串字面量的内容抹掉再做语法扫描。
 * 不然像贴纸册里未解锁时显示的 "???" 会被当成空值合并运算符 —— 一次真实的误报。
 */
function stripStrings(src) {
  let out = ''
  let quote = null
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quote) {
      if (c === '\\') {
        out += '  '
        i++
        continue
      }
      if (c === quote) {
        quote = null
        out += c
        continue
      }
      // 用空格占位,保持位置不变但不参与匹配
      out += c === '\n' ? '\n' : ' '
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      quote = c
      out += c
      continue
    }
    out += c
  }
  return out
}

function main() {
  if (!fs.existsSync(dist)) {
    console.error('没有 dist/,请先编译')
    process.exit(1)
  }
  let shared = ''
  for (const f of ['common.js', 'vendors.js', 'app.js', 'taro.js']) {
    const p = path.join(dist, f)
    if (fs.existsSync(p)) shared += fs.readFileSync(p, 'utf8')
  }
  const exportsById = moduleExportMap(shared)

  const pagesDir = path.join(dist, 'pages')
  const problems = []
  let checked = 0
  for (const page of fs.readdirSync(pagesDir)) {
    const file = path.join(pagesDir, page, 'index.js')
    if (!fs.existsSync(file)) continue
    const src = fs.readFileSync(file, 'utf8')
    const binds = {}
    let m
    const bindRe = /(\w+)\s*=\s*\w\((\d+)\)/g
    while ((m = bindRe.exec(src))) binds[m[1]] = m[2]
    const useRe = /\(0,\s*(\w+)\.(\w+)\)/g
    while ((m = useRe.exec(src))) {
      const [, v, name] = m
      const id = binds[v]
      if (!id) continue
      const list = exportsById[id]
      if (!list) continue // 该模块没有导出映射(可能是 CommonJS),跳过
      checked++
      if (!list.includes(name)) {
        problems.push(`pages/${page}: 引用了模块 ${id} 里不存在的导出 .${name}`)
      }
    }
  }

  // 收集所有产物 JS,检查是否残留开发者工具压缩器不认识的语法
  const allJs = []
  const walkJs = (dir) => {
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f)
      if (fs.statSync(p).isDirectory()) walkJs(p)
      else if (p.endsWith('.js') && !p.endsWith('.LICENSE.txt')) allJs.push(p)
    }
  }
  walkJs(dist)
  const legacy = checkLegacySyntax(allJs)
  if (legacy.length) {
    console.error('❌ 产物里残留了开发者工具压缩器不支持的语法(预览会报「对JS文件进行压缩,未通过」):')
    for (const l of legacy) console.error('   • ' + l)
    console.error('   → 检查 package.json 的 browserslist 是否被改成了过新的目标')
    process.exit(1)
  }

  if (problems.length) {
    console.error('❌ 产物不自洽(多半是编译缓存坏了,请跑 npm run rebuild):')
    for (const p of problems) console.error('   ' + p)
    process.exit(1)
  }
  console.log(`✅ 产物自洽:已校验 ${checked} 处跨模块引用`)
}

main()
