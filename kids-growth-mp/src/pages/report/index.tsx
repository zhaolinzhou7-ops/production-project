import { useMemo, useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { getCurrentChildId } from '../../store/study'
import { getProfile } from '../../store/records'
import { availableYears, buildAnnualReport, type AnnualReport } from '../../store/archive'
import { playText } from '../../lib/audio'
import { withGuard } from '../../components/Guard'
import './index.scss'

/**
 * 年度成长报告 —— 纯计算视图,不存任何数据。
 *
 * 一年下来的记录散在各处,单看是流水账;汇成一页,才看得出「这一年发生了什么」。
 * 报告的语气是对孩子说的,不是给家长的考评表 —— 所以还能点「读给我听」。
 */
function Report() {
  const [childId, setChildId] = useState('')
  const [years, setYears] = useState<number[]>([])
  const [year, setYear] = useState(new Date().getFullYear())
  const [name, setName] = useState('')

  const refresh = () => {
    const cid = getCurrentChildId()
    setChildId(cid)
    const ys = availableYears(cid)
    setYears(ys)
    if (ys.indexOf(year) < 0 && ys.length > 0) setYear(ys[0])
    setName(getProfile().name)
  }

  useDidShow(refresh)

  const report: AnnualReport | null = useMemo(
    () => (childId ? buildAnnualReport(childId, year) : null),
    [childId, year],
  )

  if (!report) return <View className='rp' />

  return (
    <View className='rp'>
      <View className='rp__hero'>
        <Text className='rp__y'>{report.year}</Text>
        <Text className='rp__title'>{name ? `${name}的这一年` : '这一年'}</Text>
      </View>

      {years.length > 1 ? (
        <View className='card'>
          <Text className='card__hd'>看哪一年</Text>
          <View className='tags'>
            {years.map((y) => (
              <View key={y} className={y === year ? 'tag tag--on' : 'tag'} onClick={() => setYear(y)}>
                <Text className='tag__t'>{y}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <View className='card'>
        <Text className='card__hd'>这一年,一句话说完</Text>
        <Text className='sum'>{report.summary}</Text>
        <View className='save' onClick={() => void playText(report.summary, 'zh_CN')}>
          <Text className='save__t'>🔊 读给我听</Text>
        </View>
      </View>

      {report.hasData ? (
        <View className='card'>
          <Text className='card__hd'>数字里的这一年</Text>
          <View className='stat'>
            {report.heightGain !== null ? (
              <View className='stat__i'>
                <Text className='stat__n'>{report.heightGain}</Text>
                <Text className='stat__l'>长高(厘米)</Text>
              </View>
            ) : null}
            {report.weightGain !== null ? (
              <View className='stat__i'>
                <Text className='stat__n'>{report.weightGain}</Text>
                <Text className='stat__l'>长重(公斤)</Text>
              </View>
            ) : null}
            {report.booksRead > 0 ? (
              <View className='stat__i'>
                <Text className='stat__n'>{report.booksRead}</Text>
                <Text className='stat__l'>读完的书</Text>
              </View>
            ) : null}
            {report.studiedDays > 0 ? (
              <View className='stat__i'>
                <Text className='stat__n'>{report.studiedDays}</Text>
                <Text className='stat__l'>学习天数</Text>
              </View>
            ) : null}
            {report.masteredCards > 0 ? (
              <View className='stat__i'>
                <Text className='stat__n'>{report.masteredCards}</Text>
                <Text className='stat__l'>掌握的卡片</Text>
              </View>
            ) : null}
            {report.examCount > 0 ? (
              <View className='stat__i'>
                <Text className='stat__n'>{report.examCount}</Text>
                <Text className='stat__l'>记录的考试</Text>
              </View>
            ) : null}
            {report.shineCount > 0 ? (
              <View className='stat__i'>
                <Text className='stat__n'>{report.shineCount}</Text>
                <Text className='stat__l'>闪光时刻</Text>
              </View>
            ) : null}
          </View>
          {report.bmiLatest !== null ? (
            <Text className='hint'>最近一次 BMI 是 {report.bmiLatest}。</Text>
          ) : null}
        </View>
      ) : null}

      {report.shinePicks.length > 0 ? (
        <View className='card'>
          <Text className='card__hd'>那些闪光的时刻</Text>
          {report.shinePicks.map((s, i) => (
            <View className='pick' key={i}>
              <Text className='pick__d'>{s.date}</Text>
              <Text className='pick__c'>{s.content}</Text>
            </View>
          ))}
          {report.topTraits.length > 0 ? (
            <Text className='hint'>这一年最常被看见的:{report.topTraits.join(' · ')}</Text>
          ) : null}
        </View>
      ) : null}

      {report.awards.length > 0 || report.gradings.length > 0 ? (
        <View className='card'>
          <Text className='card__hd'>拿到的成绩</Text>
          {report.awards.map((a, i) => (
            <Text className='li' key={`aw-${i}`}>
              🏆 {a}
            </Text>
          ))}
          {report.gradings.map((g, i) => (
            <Text className='li' key={`gd-${i}`}>
              🏅 {g}
            </Text>
          ))}
        </View>
      ) : null}

      {report.bookTitles.length > 0 ? (
        <View className='card'>
          <Text className='card__hd'>读过的书</Text>
          {report.bookTitles.map((b, i) => (
            <Text className='li' key={`bk-${i}`}>
              📖 {b}
            </Text>
          ))}
        </View>
      ) : null}

      {!report.hasData ? (
        <View className='card'>
          <Text className='empty'>
            {report.year} 年还没有记录。回到成长档案随手记一条身高、一本读完的书、一件让你骄傲的事,
            这页就会自己长出来。
          </Text>
          <View className='save' onClick={() => Taro.navigateBack()}>
            <Text className='save__t'>回去记一条</Text>
          </View>
        </View>
      ) : null}

      <Text className='foot'>报告是根据你记下的内容自动算出来的,没有记的就不会出现。</Text>
    </View>
  )
}

export default withGuard(Report)
