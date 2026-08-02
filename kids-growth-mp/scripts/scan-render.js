/* eslint-disable */
/**
 * 渲染结构扫描:揪出「同一位置节点类型会变」的写法。
 *
 * 为什么必须自动化:
 * Taro 编译带事件的节点和不带事件的节点用的是**不同的节点别名**。
 * 同一个位置一会儿渲染带 onClick 的节点、一会儿渲染不带的,
 * 真机上就会报 `componentsAlias[...]._num` —— 而且是偶发,
 * 开发者工具里往往看不出来,只有用户点到那一下才炸。
 *
 * 这个检查以前是手工做的,结果漏了:第一版只认 `cond ? <A/> : <B/>`
 * 这种紧挨着的写法,而实际代码几乎都写成
 *   cond ? (
 *     <A/>
 *   ) : (
 *     <B/>
 *   )
 * —— `?` 和 `<` 之间隔着括号和换行,正则直接匹配不到,于是报「0 处」,
 * 让人以为干净了。真机上照炸不误。
 *
 * 所以现在把它接进 `npm run rebuild`,发现一处就让构建失败。
 *
 * 正确写法:把「二选一」拆成两个各自独立的「有/无」——
 *   {cond ? <A/> : null}
 *   {!cond ? <B/> : null}
 * 这样两个节点各占各的位置,只在「渲染/不渲染」之间切换,不会互换类型。
 * 或者用同一个节点,只切 className 和文字。
 *
 * 用法:node scripts/scan-render.js
 */
const fs = require('fs')
const path = require('path')

function walk(d, out = []) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f)
    fs.statSync(p).isDirectory() ? walk(p, out) : /\.tsx$/.test(f) && out.push(p)
  }
  return out
}

/** 从 src[start] 处的 `<` 开始,截出完整 JSX 元素 */
function sliceElement(src, start) {
  const m = /^<\s*([A-Za-z0-9_.]+)/.exec(src.slice(start, start + 60))
  if (!m) return null
  const tag = m[1]
  const esc = tag.replace(/\./g, '\\.')
  const sc = new RegExp(`^<\\s*${esc}(\\s[^>]*?)?/>`, 's').exec(src.slice(start))
  if (sc) return { text: sc[0], end: start + sc[0].length, tag }
  const open = new RegExp(`<\\s*${esc}[\\s>/]`, 'g')
  const close = new RegExp(`</\\s*${esc}\\s*>`, 'g')
  let idx = start
  let depth = 0
  while (idx < src.length) {
    open.lastIndex = idx
    close.lastIndex = idx
    const o = open.exec(src)
    const c = close.exec(src)
    if (!c) return null
    if (o && o.index < c.index) { depth++; idx = o.index + 1 }
    else {
      depth--
      idx = c.index + c[0].length
      if (depth === 0) return { text: src.slice(start, idx), end: idx, tag }
    }
  }
  return null
}

/** 跳过空白、换行和左括号,返回下一个 `<` 的位置 */
function skipToTag(src, i) {
  const m = /^[\s(]*/.exec(src.slice(i))
  const j = i + m[0].length
  return src[j] === '<' ? j : -1
}

/** 跳过空白、换行和右括号,返回 `:` 之后的位置 */
function skipToColon(src, i) {
  const m = /^[\s)]*:/.exec(src.slice(i))
  return m ? i + m[0].length : -1
}

const hasEvt = (s) => {
  // 只看**最外层标签**上的事件,子节点上的事件不算(那不构成同位置互换)
  const head = /^<[^>]*>/s.exec(s)
  return head ? /\son[A-Z][A-Za-z]*\s*=/.test(head[0]) : false
}
const lineOf = (src, i) => src.slice(0, i).split('\n').length

/** .ts 也要扫(showModal 不只出现在 .tsx 里) */
function walkTs(d, out = []) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f)
    if (fs.statSync(p).isDirectory()) walkTs(p, out)
    else if (/\.ts$/.test(f) && !/\.d\.ts$/.test(f)) out.push(p)
  }
  return out
}

let found = 0
for (const file of walk(path.resolve('src'))) {
  const src = fs.readFileSync(file, 'utf8')
  const rel = path.relative(process.cwd(), file)
  const re = /\?/g
  let m
  while ((m = re.exec(src))) {
    const aStart = skipToTag(src, m.index + 1)
    if (aStart < 0) continue
    const a = sliceElement(src, aStart)
    if (!a) continue
    const colonEnd = skipToColon(src, a.end)
    if (colonEnd < 0) continue
    const bStart = skipToTag(src, colonEnd)
    if (bStart < 0) continue
    const b = sliceElement(src, bStart)
    if (!b) continue

    const ea = hasEvt(a.text)
    const eb = hasEvt(b.text)
    const problems = []
    if (ea !== eb) problems.push(`事件有无不一致(${a.tag}:${ea} vs ${b.tag}:${eb})`)
    if (a.tag !== b.tag) problems.push(`标签不同(${a.tag} vs ${b.tag})`)
    if (problems.length > 0) {
      found++
      console.log(`\n⚠️  ${rel}:${lineOf(src, m.index)}  ${problems.join(' + ')}`)
      console.log(`    A: ${a.text.slice(0, 90).replace(/\s+/g, ' ')}`)
      console.log(`    B: ${b.text.slice(0, 90).replace(/\s+/g, ' ')}`)
    }
  }
}
/*
  顺带查一件真机上才暴露的事:`showModal({ editable: true })` 的输入框很难用 ——
  键盘常常挡住输入区、有时干脆点不进去。用户的原话是「计算本身不难,
  难的是无法输入正确」—— 一个功能卡在输入这一步,后面做得再好都到不了他手上。

  页面内的 <Input>(见 components/Prompt.tsx)没有这个问题:键盘弹起时
  页面会自己让位,输入全程看得见。所以这个写法一律禁掉。
*/
let editableHits = 0
for (const file of [...walk(path.resolve('src')), ...walkTs(path.resolve('src'))]) {
  const src = fs.readFileSync(file, 'utf8')
  if (!/editable:\s*true/.test(src)) continue
  // Prompt/ParentGate 的注释里会提到它,注释不算
  const lines = src.split('\n')
  lines.forEach((ln, i) => {
    if (!/editable:\s*true/.test(ln)) return
    if (/^\s*(\/\/|\*|\/\*)/.test(ln)) return
    editableHits++
    console.log(`\n⚠️  ${path.relative(process.cwd(), file)}:${i + 1}  用了 showModal 的 editable 输入框`)
    console.log('    真机上常常点不进去/被键盘挡住,改用 components/Prompt.tsx 的 usePrompt()')
  })
}
if (editableHits > 0) {
  console.error(`\n❌ 发现 ${editableHits} 处 showModal 可输入弹窗,改用页面内的 usePrompt()。`)
  process.exit(1)
}

if (found > 0) {
  console.error(`\n❌ 发现 ${found} 处「同位置节点类型会变」的写法(真机上会报 _num)。`)
  console.error('   改法:拆成两个独立的「有/无」条件,或用同一个节点只切 className。')
  console.error("   {cond ? <A/> : null}")
  console.error("   {!cond ? <B/> : null}")
  process.exit(1)
}
console.log('✅ 渲染结构:没有「同位置节点类型会变」的写法')
