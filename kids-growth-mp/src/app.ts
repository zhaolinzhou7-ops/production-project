import { PropsWithChildren } from 'react'
import { useLaunch, useError, useDidHide } from '@tarojs/taro'
import { initCloud, pullFromCloud } from './cloud/sync'
import { writeObject, flushNow } from './store/db'
import { sanitizeData, getCurrentChildId } from './store/study'
import './app.scss'

function App({ children }: PropsWithChildren) {
  useLaunch(() => {
    // 每次启动先把本地数据体检一遍:早期版本写进去的残缺记录、孤儿卡片、
    // 指向已删卡片的复习状态,都会在页面上表现为莫名其妙的报错。
    // 以前得靠用户自己「清空本地数据」才好 —— 现在开机就静默修掉。
    try {
      sanitizeData(getCurrentChildId())
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

  // 兜底:把任何未捕获的运行时报错记下来,首页会显示出来。
  // (给非技术用户用:不用打开调试器,也能把出错原因念给我们听)
  useError((err) => {
    try {
      const msg = String(err)
      // 音频解码失败是**预期内**的:某些音源连得上但返回的是网页而不是音频,
      // 播放器解不出来就报这个。管线会自动换下一家,不该拿它去吓用户。
      if (/decode audio|MEDIA_ERR|innerAudioContext/i.test(msg)) return
      writeObject('_lastError', msg.slice(0, 400))
    } catch {
      /* 忽略 */
    }
  })

  return children
}

export default App
