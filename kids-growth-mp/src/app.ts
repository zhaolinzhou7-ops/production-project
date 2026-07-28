import { PropsWithChildren } from 'react'
import { useLaunch, useError, useDidHide } from '@tarojs/taro'
import { initCloud, pullFromCloud } from './cloud/sync'
import { flushNow } from './store/db'
import { noteError } from './lib/errlog'
import { sanitizeData, getCurrentChildId } from './store/study'
import { sanitizeRecords } from './store/records'
import { resetDeadOnLaunch } from './lib/audio'
import './app.scss'

function App({ children }: PropsWithChildren) {
  useLaunch(() => {
    // 每次启动先把本地数据体检一遍:早期版本写进去的残缺记录、孤儿卡片、
    // 指向已删卡片的复习状态,都会在页面上表现为莫名其妙的报错。
    // 以前得靠用户自己「清空本地数据」才好 —— 现在开机就静默修掉。
    try {
      sanitizeData(getCurrentChildId())
      sanitizeRecords()
      // 音源的「不通」标记每次冷启动清零 —— 上次在地铁里连不上,
      // 不代表这次在家连着 wifi 也连不上(见 lib/audio.ts 的说明)
      resetDeadOnLaunch()
      // 注:口语练习记录的体检放在口语页里做(见 pages/talk)。
      // 放这儿会把整份对话内容拖进公共包,每次冷启动都要多解析几十 KB。
    } catch {
      /* 修不了就算了,不能让体检本身挡住启动 */
    }
    // 启动时若已配置云开发,静默拉取云端进度(云端较新时才覆盖本地)
    if (initCloud()) {
      void pullFromCloud()
    }
  })

  // 切后台时把攒着的写入落盘。平时写只更新内存、合并落盘(见 store/db.ts),
  // 这里补一刀,保证退出前一定写下去。
  useDidHide(() => flushNow())

  // 兜底:把任何未捕获的运行时报错记下来(带时间、版本、页面),
  // 首页只在**当前版本**出过错时才告警 —— 见 lib/errlog.ts 的说明。
  useError((err) => noteError(err))

  return children
}

export default App
