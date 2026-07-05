// 把 dist-artifact 的 JS/CSS 内联成一个可独立打开的 HTML 片段(Artifact 发布用,也可本地直接打开)
import fs from 'fs'
import path from 'path'

const dist = path.resolve(process.cwd(), 'dist-artifact')
const assetsDir = path.join(dist, 'assets')
const files = fs.readdirSync(assetsDir)
const jsFile = files.find((f) => f.endsWith('.js'))
const cssFile = files.find((f) => f.endsWith('.css'))
if (!jsFile || !cssFile) {
  console.error('构建产物缺少 js/css,先运行 vite build --config vite.artifact.config.ts')
  process.exit(1)
}

let js = fs.readFileSync(path.join(assetsDir, jsFile), 'utf-8')
const css = fs.readFileSync(path.join(assetsDir, cssFile), 'utf-8')
// 防止内联脚本被字符串中的 </script> 提前截断(只可能出现在字符串/正则里,转义等价)
js = js.replaceAll('</script', '<\\/script')

const html = `<title>小朋友成长系统</title>
<style>
${css}
</style>
<div id="root"></div>
<script type="module">
${js}
</script>
`

const out = path.join(dist, 'artifact.html')
fs.writeFileSync(out, html)
console.log(`written ${out} (${(html.length / 1024 / 1024).toFixed(2)} MB)`)
