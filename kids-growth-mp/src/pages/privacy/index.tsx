import { View, Text } from '@tarojs/components'
import './index.scss'

/**
 * 儿童隐私说明。
 *
 * 面向未成年人的产品必须把「收集了什么、去了哪里」讲清楚,而且要用家长
 * 读得懂的话讲。这里如实描述当前实现 —— 代码怎么写的,这页就怎么写。
 */
export default function Privacy() {
  return (
    <View className='pv'>
      <Text className='pv__h'>这个小程序怎么处理孩子的数据</Text>

      <Text className='pv__st'>学习数据存在哪里</Text>
      <Text className='pv__p'>
        学习进度、积分、贴纸、宠物等全部存在**这台手机本地**(微信的小程序存储)。
        没有账号体系,不收集姓名、生日、手机号、位置等任何个人信息。
      </Text>

      <Text className='pv__st'>录音</Text>
      <Text className='pv__p'>
        「跟读」功能会用到麦克风。录音**只在本机保存与回放,不上传**,也不用于任何分析。
        微信会在第一次使用时弹窗征求授权,拒绝也不影响其它功能。
      </Text>

      <Text className='pv__st'>会联网的部分</Text>
      <Text className='pv__p'>发音是从公开的词典/语音服务在线取回的音频。请求里只包含:</Text>
      <Text className='pv__li'>• 要朗读的那个单词或汉字本身</Text>
      <Text className='pv__p'>
        不包含孩子的任何身份信息、学习记录或录音。除此之外,小程序不会把任何数据发到外部。
      </Text>

      <Text className='pv__st'>云同步(默认关闭)</Text>
      <Text className='pv__p'>
        如果家长自行开启了微信云开发同步,会把**学习进度快照**(卡组、复习状态、积分、时长)
        存到你自己的云环境里,用于换手机时恢复。**录音永远不会被同步**。不开启就完全不联云。
      </Text>

      <Text className='pv__st'>广告与第三方</Text>
      <Text className='pv__p'>没有广告,没有推荐算法,没有第三方统计 SDK,没有任何形式的付费诱导。</Text>

      <Text className='pv__st'>家长可以做什么</Text>
      <Text className='pv__li'>• 家长中心有密码保护,可随时查看学习情况、调整护眼时长</Text>
      <Text className='pv__li'>• 首页「清空本地数据」可一键抹掉本机所有学习记录</Text>
      <Text className='pv__li'>• 删除小程序即删除全部本地数据</Text>

      <Text className='pv__foot'>
        这是一个家庭自用的小程序,不做商业运营。以上描述与代码实现一致 ——
        如果哪天实现变了,这一页会同步改。
      </Text>
    </View>
  )
}
