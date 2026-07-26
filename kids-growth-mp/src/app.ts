import { PropsWithChildren } from 'react'
import { useLaunch, useError } from '@tarojs/taro'
import { initCloud, pullFromCloud } from './cloud/sync'
import { writeObject } from './store/db'
import './app.scss'

function App({ children }: PropsWithChildren) {
  useLaunch(() => {
    // 启动时若已配置云开发,静默拉取云端进度(云端较新时才覆盖本地)
    if (initCloud()) {
      void pullFromCloud()
    }
  })

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
