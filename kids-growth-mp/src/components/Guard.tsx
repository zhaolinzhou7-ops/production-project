import { Component, type ComponentType, type ReactNode } from 'react'
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import './Guard.scss'

/**
 * 页面错误边界。
 *
 * 为什么每个页面都要包一层:小程序里页面渲染时抛异常,结果是**整页空白**,
 * 只剩导航栏,屏幕上不给任何线索,非技术用户完全无从判断。这里把异常接住,
 * 直接把原因写在屏幕上,并给一个「返回」和「清空本地数据」的自救出口。
 *
 * React 的错误边界必须是 class 组件,所以这里不用函数组件。
 */
interface Props {
  children: ReactNode
}
interface State {
  err: string
}

class ErrorBoundary extends Component<Props, State> {
  state: State = { err: '' }

  static getDerivedStateFromError(e: unknown): State {
    return { err: e instanceof Error ? `${e.message}` : String(e) }
  }

  componentDidCatch(e: unknown) {
    // 也存一份,首页会显示「上一次出错」,方便事后回看
    try {
      Taro.setStorageSync('_lastError', String(e).slice(0, 400))
    } catch {
      /* 忽略 */
    }
  }

  render() {
    if (!this.state.err) return this.props.children
    return (
      <View className='guard'>
        <Text className='guard__e'>😵</Text>
        <Text className='guard__t'>这个页面出错了</Text>
        <Text className='guard__m'>{this.state.err}</Text>
        <Text className='guard__h'>把上面这行字告诉开发者,就能定位问题。</Text>
        <View className='guard__btn' onClick={() => Taro.navigateBack()}>
          <Text className='guard__btnT'>返回上一页</Text>
        </View>
        <View
          className='guard__btn guard__btn--ghost'
          onClick={() =>
            Taro.showModal({
              title: '清空本地数据?',
              content: '会清掉本机的学习进度,通常能解决数据损坏导致的报错。',
              success: (r) => {
                if (!r.confirm) return
                try {
                  Taro.clearStorageSync()
                } catch {
                  /* 忽略 */
                }
                Taro.reLaunch({ url: '/pages/index/index' })
              },
            })
          }
        >
          <Text className='guard__btnT guard__btnT--ghost'>清空本地数据</Text>
        </View>
      </View>
    )
  }
}

/** 给页面组件包一层错误边界。用法:export default withGuard(Page) */
export function withGuard<P extends object>(Inner: ComponentType<P>): ComponentType<P> {
  return function Guarded(props: P) {
    return (
      <ErrorBoundary>
        <Inner {...props} />
      </ErrorBoundary>
    )
  }
}

export default ErrorBoundary
