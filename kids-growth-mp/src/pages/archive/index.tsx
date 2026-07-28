import { useState } from 'react'
import { View, Text, Input, Picker } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { getCurrentChildId } from '../../store/study'
import {
  getProfile,
  saveProfile,
  countRecordsByModule,
  listGrowth,
  listExams,
  listAnecdotes,
  exportArchive,
  importArchive,
  type ChildProfile,
} from '../../store/records'
import { buildTimeline, type TimelineItem } from '../../store/archive'
import { RECORD_MODULES, GROUP_LABEL, type RecordModuleGroup } from '../../core/recordModules'
import { todayISO } from '../../core/dateUtils'
import { withGuard } from '../../components/Guard'
import './index.scss'

const GROUPS: RecordModuleGroup[] = ['health', 'talent', 'wellbeing', 'learning']

/**
 * 成长档案首页。
 *
 * 学习那半边是孩子自己用的;这半边是**家长记、孩子看**的:
 * 长高了多少、考了什么、拿了什么奖、哪天做了件让人骄傲的事。
 * 十年以后,这条时间线比任何一次考试成绩都值钱。
 */
function Archive() {
  const [childId, setChildId] = useState('')
  const [profile, setProfile] = useState<ChildProfile>({ name: '', gender: 'male', birthdate: '' })
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [growthN, setGrowthN] = useState(0)
  const [examN, setExamN] = useState(0)
  const [anecN, setAnecN] = useState(0)
  const [timeline, setTimeline] = useState<TimelineItem[]>([])
  const [editing, setEditing] = useState(false)

  const refresh = () => {
    const cid = getCurrentChildId()
    setChildId(cid)
    const p = getProfile()
    setProfile(p)
    setCounts(countRecordsByModule(cid))
    setGrowthN(listGrowth(cid).length)
    setExamN(listExams(cid).length)
    setAnecN(listAnecdotes(cid).length)
    setTimeline(buildTimeline(cid, 30))
    // 还没填过档案就直接展开表单 —— 没有生日就算不了百分位,不填等于半残
    if (!p.birthdate) setEditing(true)
  }

  useDidShow(refresh)

  const go = (url: string) => Taro.navigateTo({ url })

  const commitProfile = (next: ChildProfile) => {
    setProfile(next)
    saveProfile(next)
  }

  const doExport = () => {
    const text = exportArchive()
    Taro.setClipboardData({
      data: text,
      success: () =>
        Taro.showModal({
          title: '已复制到剪贴板',
          content: `共 ${Math.round(text.length / 100) / 10}KB。现在去微信里发给自己,或粘到备忘录存着。`,
          showCancel: false,
        }),
      fail: () => Taro.showToast({ title: '复制失败,再试一次', icon: 'none' }),
    })
  }

  const doImport = () => {
    Taro.getClipboardData({
      success: (res) => {
        const text = (res.data || '').trim()
        if (!text) {
          Taro.showToast({ title: '剪贴板是空的', icon: 'none' })
          return
        }
        Taro.showModal({
          title: '从剪贴板恢复?',
          content: '会把备份里的记录并进来。同一条不会重复导入,本地已有的也不会被删掉。',
          success: (r) => {
            if (!r.confirm) return
            const out = importArchive(text)
            Taro.showModal({ title: out.ok ? '恢复完成' : '恢复失败', content: out.message, showCancel: false })
            if (out.ok) refresh()
          },
        })
      },
      fail: () => Taro.showToast({ title: '读不到剪贴板', icon: 'none' }),
    })
  }

  return (
    <View className='arc'>
      <View className='arc__hero'>
        <Text className='arc__title'>{profile.name ? `${profile.name}的成长档案` : '成长档案'}</Text>
        <Text className='arc__sub'>
          {profile.birthdate ? `${profile.birthdate} 出生 · ${profile.gender === 'male' ? '男孩' : '女孩'}` : '先填一下生日和性别'}
        </Text>
        <View className='arc__edit tap' onClick={() => setEditing(!editing)}>
          <Text className='arc__editT'>{editing ? '收起' : '编辑资料'}</Text>
        </View>
      </View>

      {editing ? (
        <View className='card'>
          <Text className='card__hd'>孩子资料</Text>
          <Text className='fl'>名字</Text>
          <Input
            className='fi'
            value={profile.name}
            placeholder='怎么称呼'
            onInput={(e) => commitProfile({ ...profile, name: e.detail.value })}
          />
          <Text className='fl'>生日</Text>
          <Picker
            mode='date'
            value={profile.birthdate || todayISO()}
            onChange={(e) => commitProfile({ ...profile, birthdate: String(e.detail.value) })}
          >
            <View className='fi fi--pick'>
              <Text className='fi__v'>{profile.birthdate || '点这里选日期'}</Text>
            </View>
          </Picker>
          <Text className='fl'>性别</Text>
          <View className='segs'>
            <View
              className={profile.gender === 'male' ? 'seg seg--on' : 'seg'}
              onClick={() => commitProfile({ ...profile, gender: 'male' })}
            >
              <Text className='seg__t'>男孩</Text>
            </View>
            <View
              className={profile.gender === 'female' ? 'seg seg--on' : 'seg'}
              onClick={() => commitProfile({ ...profile, gender: 'female' })}
            >
              <Text className='seg__t'>女孩</Text>
            </View>
          </View>
          <Text className='hint'>
            生长曲线要跟同年龄、同性别的孩子比才有意义,所以这两项是必填的。资料只存在这台手机上。
          </Text>
        </View>
      ) : null}

      {/* 三个「有专门页面」的大项 */}
      <View className='card'>
        <Text className='card__hd'>重点记录</Text>
        <View className='big entry' onClick={() => go('/pages/growth/index')}>
          <Text className='big__e'>📏</Text>
          <View className='big__m'>
            <Text className='big__t'>身高体重 · 生长曲线</Text>
            <Text className='big__d'>{growthN > 0 ? `已记 ${growthN} 次,可看百分位` : '记下身高体重,自动算百分位'}</Text>
          </View>
          <Text className='big__a'>›</Text>
        </View>
        <View className='big entry' onClick={() => go('/pages/exams/index')}>
          <Text className='big__e'>📝</Text>
          <View className='big__m'>
            <Text className='big__t'>考试成绩</Text>
            <Text className='big__d'>{examN > 0 ? `已记 ${examN} 次考试,可看各科趋势` : '一次考试多科成绩,按得分率看趋势'}</Text>
          </View>
          <Text className='big__a'>›</Text>
        </View>
        <View className='big entry' onClick={() => go('/pages/anecdotes/index')}>
          <Text className='big__e'>✨</Text>
          <View className='big__m'>
            <Text className='big__t'>闪光事例 · 品格画像</Text>
            <Text className='big__d'>{anecN > 0 ? `已记 ${anecN} 条` : '记具体行为,不给孩子贴标签'}</Text>
          </View>
          <Text className='big__a'>›</Text>
        </View>
        <View className='big entry' onClick={() => go('/pages/report/index')}>
          <Text className='big__e'>🎁</Text>
          <View className='big__m'>
            <Text className='big__t'>年度成长报告</Text>
            <Text className='big__d'>把这一年发生的事汇成一篇,读给孩子听</Text>
          </View>
          <Text className='big__a'>›</Text>
        </View>
      </View>

      {/* 通用记录:按分组列出 */}
      {GROUPS.map((g) => (
        <View className='card' key={g}>
          <Text className='card__hd'>{GROUP_LABEL[g]}</Text>
          <View className='grid'>
            {RECORD_MODULES.filter((m) => m.group === g).map((m) => (
              <View
                className='tile entry'
                key={m.module}
                onClick={() => go(`/pages/records/index?module=${m.module}`)}
              >
                <Text className='tile__e'>{m.icon}</Text>
                <Text className='tile__t'>{m.label}</Text>
                <Text className='tile__n'>{counts[m.module] ? `${counts[m.module]} 条` : '还没记'}</Text>
              </View>
            ))}
          </View>
        </View>
      ))}

      <View className='card'>
        <Text className='card__hd'>成长时间线</Text>
        {timeline.length === 0 ? (
          <Text className='empty'>还没有记录。上面随便记一条,这里就会长出第一个节点。</Text>
        ) : null}
        {timeline.map((it, i) => (
          <View className='tl' key={`${it.date}-${i}`}>
            <View className={`tl__dot tl__dot--${it.kind}`}>
              <Text className='tl__e'>{it.icon}</Text>
            </View>
            <View className='tl__m'>
              <Text className='tl__d'>{it.date}</Text>
              <Text className='tl__t'>{it.title}</Text>
              <Text className='tl__x'>{it.detail}</Text>
            </View>
          </View>
        ))}
      </View>

      <View className='card'>
        <Text className='card__hd'>备份与恢复</Text>
        <Text className='hint' style={{ marginTop: '0' }}>
          学习进度丢了还能重学,但「三岁那年量的身高」丢了就真没了。
          导出会把档案复制到剪贴板,粘到微信收藏或备忘录里就存住了。
        </Text>
        <View className='save save--ghost' onClick={doExport}>
          <Text className='save__t'>导出档案(复制走)</Text>
        </View>
        <View className='save save--ghost' onClick={doImport}>
          <Text className='save__t'>从剪贴板恢复</Text>
        </View>
      </View>

      <Text className='foot'>
        档案只保存在这台手机上,不会自动上传。换手机前记得先导出一份。
      </Text>
    </View>
  )
}

export default withGuard(Archive)
