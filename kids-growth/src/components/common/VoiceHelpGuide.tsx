/**
 * 「怎么让声音变好听」图文指引。
 *
 * 为什么需要它:网页应用只能调用**手机里已装的语音**。很多安卓机出厂自带的是
 * 老式拼接引擎(机器人味),而 Google 语音的"增强/高质量"音色、苹果的"增强版/
 * Siri"音色是神经网络合成,自然度天差地别 —— 但这些都得在系统设置里手动下载。
 * 这一步只能由家长在手机上做,所以这里给出分平台的操作步骤。
 */

type Platform = 'android' | 'ios' | 'wechat' | 'desktop'

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'desktop'
  const ua = navigator.userAgent.toLowerCase()
  if (/micromessenger/.test(ua)) return 'wechat'
  if (/iphone|ipad|ipod/.test(ua)) return 'ios'
  if (/android/.test(ua)) return 'android'
  return 'desktop'
}

const STEPS: Record<Platform, { title: string; steps: string[]; note?: string }> = {
  android: {
    title: '安卓手机:装 Google 语音的「高质量」中文音色',
    steps: [
      '打开手机「设置」→ 搜索「文字转语音」(有的机型在 系统 → 语言和输入法 → 文字转语音输出)',
      '首选引擎选「Google 文字转语音引擎」(没有就去应用商店装一个,免费)',
      '点引擎右边的齿轮 ⚙️ → 「安装语音数据」',
      '选「中文(中国)」→ 下载带「高质量 / 增强」字样的那个音色;英语选「English (United States)」同样下高质量的',
      '下载完回到本页,在上面的「设备自带音色」里选中新下载的音色,点一下试听',
    ],
    note: '小米/华为/OPPO 等自带引擎(如「小爱语音」「HMS TTS」)有的也不错,可以都下载后逐个试听挑最好的。',
  },
  ios: {
    title: '苹果手机:下载「增强版 / Siri」语音',
    steps: [
      '打开「设置」→「辅助功能」→「朗读内容」→「声音」',
      '选「中文(普通话)」→ 列表里带「增强版」或「Siri」字样的,点右边的 ⬇️ 下载',
      '英语同理:回到「声音」→ English → 下载「Enhanced / Siri」音色',
      '下载完回到本页,在「设备自带音色」里选它,点一下试听',
    ],
    note: '苹果的增强版语音体积较大(几十到几百 MB),建议连 Wi-Fi 下载。',
  },
  wechat: {
    title: '你现在用的是微信内置浏览器',
    steps: [
      '微信内置浏览器对网页语音的支持较差,声音可能更机械,也可能不出声',
      '建议点右上角「···」→「在浏览器打开」,用 Chrome / Safari / 系统浏览器体验',
      '再按下面对应手机系统的步骤,装一个高质量语音音色',
    ],
    note: '想在微信里得到自然的声音,正路是用微信小程序版(它能调用微信自家的语音服务,国内可用),那个版本的代码已经写好在 kids-growth-mp 目录里。',
  },
  desktop: {
    title: '电脑浏览器',
    steps: [
      'Chrome 通常自带 Google 的在线音色,质量较好;Edge 自带微软 Natural 神经网络音色,更自然',
      '在上面的「设备自带音色」列表里逐个试听,挑名字里带 Natural / Google 的那个',
    ],
  },
}

export function VoiceHelpGuide() {
  const p = detectPlatform()
  const other: Platform = p === 'ios' ? 'android' : 'ios'
  const blocks = p === 'wechat' ? ([p, 'android', 'ios'] as Platform[]) : ([p, other] as Platform[])

  return (
    <div className="space-y-3">
      {blocks.map((key, i) => {
        const b = STEPS[key]
        return (
          <div key={key} className={i === 0 ? '' : 'opacity-70'}>
            <div className="mb-1 text-[11px] font-bold text-gray-600">
              {i === 0 ? '👉 ' : ''}
              {b.title}
            </div>
            <ol className="ml-4 list-decimal space-y-1">
              {b.steps.map((s, j) => (
                <li key={j} className="text-[11px] leading-relaxed text-gray-500">
                  {s}
                </li>
              ))}
            </ol>
            {b.note && <p className="mt-1 text-[10px] text-gray-400">💡 {b.note}</p>}
          </div>
        )
      })}
      <p className="text-[10px] text-gray-400">
        网页应用只能用手机里已经装好的语音,装不装、装哪个只能在系统设置里选 —— 这一步做完,朗读会明显不一样。
      </p>
    </div>
  )
}
