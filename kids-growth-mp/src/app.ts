import { PropsWithChildren } from 'react'
import { useLaunch } from '@tarojs/taro'
import { initCloud, pullFromCloud } from './cloud/sync'
import './app.scss'

function App({ children }: PropsWithChildren) {
  useLaunch(() => {
    // 启动时若已配置云开发,静默拉取云端进度(云端较新时才覆盖本地)
    if (initCloud()) {
      void pullFromCloud()
    }
  })

  return children
}

export default App
