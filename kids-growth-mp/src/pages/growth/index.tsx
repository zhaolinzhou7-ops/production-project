import { useMemo, useState } from 'react'
import { View, Text, Input, Picker } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { getCurrentChildId } from '../../store/study'
import { getProfile, listGrowth, addGrowth, removeGrowth } from '../../store/records'
import {
  GROWTH_DATA_SOURCE,
  METRIC_LABEL,
  METRIC_UNIT,
  ageMonthsAt,
  bmiOf,
  classifyBmi,
  BMI_CATEGORY_LABEL,
  describePercentile,
  interpolateStandard,
  percentileRankFor,
  zScoreFor,
  type GrowthMetric,
} from '../../core/growthPercentile'
import { todayISO } from '../../core/dateUtils'
import { withGuard } from '../../components/Guard'
import type { GrowthRecord } from '../../types'
import './index.scss'

const METRICS: GrowthMetric[] = ['height', 'weight', 'bmi']

/** 一条记录在某个指标上的实测值 */
function valueOf(r: GrowthRecord, m: GrowthMetric): number | null {
  if (m === 'height') return typeof r.heightCm === 'number' ? r.heightCm : null
  if (m === 'weight') return typeof r.weightKg === 'number' ? r.weightKg : null
  if (m === 'headCirc') return typeof r.headCm === 'number' ? r.headCm : null
  if (r.heightCm && r.weightKg) return bmiOf(r.heightCm, r.weightKg)
  return null
}

/**
 * 身高体重与生长曲线。
 *
 * 小程序里没有图表库(recharts 依赖 DOM),折线用纯 View 定位点画出来。
 * 点少的时候画点就够看趋势了,不必强求连成平滑曲线 —— 反而更清楚。
 */
function Growth() {
  const [childId, setChildId] = useState('')
  const [rows, setRows] = useState<GrowthRecord[]>([])
  const [profile, setProfile] = useState(getProfile())
  const [metric, setMetric] = useState<GrowthMetric>('height')
  const [adding, setAdding] = useState(false)
  const [date, setDate] = useState(todayISO())
  const [h, setH] = useState('')
  const [w, setW] = useState('')
  const [hc, setHc] = useState('')
  const [note, setNote] = useState('')

  const refresh = () => {
    const cid = getCurrentChildId()
    setChildId(cid)
    setRows(listGrowth(cid))
    setProfile(getProfile())
  }

  useDidShow(refresh)

  /** 时间正序、含该指标值的点,配上月龄与百分位 */
  const points = useMemo(() => {
    if (!profile.birthdate) return []
    const out: Array<{ date: string; value: number; months: number; pct: number | null }> = []
    for (const r of [...rows].reverse()) {
      const v = valueOf(r, metric)
      if (v === null) continue
      const months = ageMonthsAt(profile.birthdate, r.date)
      out.push({ date: r.date, value: v, months, pct: percentileRankFor(metric, profile.gender, months, v) })
    }
    return out
  }, [rows, metric, profile])

  const latest = points.length > 0 ? points[points.length - 1] : null

  /** BMI 的胖瘦分级(只有身高体重都有才算得出来) */
  const bmiNote = useMemo(() => {
    if (!profile.birthdate) return ''
    const last = rows.find((r) => r.heightCm && r.weightKg)
    if (!last) return ''
    const bmi = bmiOf(last.heightCm as number, last.weightKg as number)
    const months = ageMonthsAt(profile.birthdate, last.date)
    const std = interpolateStandard('bmi', profile.gender, months)
    if (!std) return ''
    const z = zScoreFor(std.l, std.m, std.s, bmi)
    return `最近一次 BMI ${bmi},属于「${BMI_CATEGORY_LABEL[classifyBmi(z)]}」区间`
  }, [rows, profile])

  // 画图用的坐标范围
  const chart = useMemo(() => {
    if (points.length === 0) return null
    const vs = points.map((p) => p.value)
    let min = Math.min(...vs)
    let max = Math.max(...vs)
    if (max - min < 1e-6) {
      min -= 1
      max += 1
    }
    const pad = (max - min) * 0.15
    min -= pad
    max += pad
    return { min, max }
  }, [points])

  const save = () => {
    const nh = h ? Number(h) : undefined
    const nw = w ? Number(w) : undefined
    const nhc = hc ? Number(hc) : undefined
    if (nh === undefined && nw === undefined && nhc === undefined) {
      Taro.showToast({ title: '至少填一项', icon: 'none' })
      return
    }
    if ((nh !== undefined && !(nh > 0)) || (nw !== undefined && !(nw > 0)) || (nhc !== undefined && !(nhc > 0))) {
      Taro.showToast({ title: '数值要大于 0', icon: 'none' })
      return
    }
    addGrowth(childId, { date, heightCm: nh, weightKg: nw, headCm: nhc, note: note || undefined })
    setH('')
    setW('')
    setHc('')
    setNote('')
    setAdding(false)
    refresh()
    Taro.showToast({ title: '记下了', icon: 'success' })
  }

  const del = (r: GrowthRecord) => {
    Taro.showModal({
      title: '删掉这条记录?',
      content: `${r.date} 的记录删掉后就找不回来了。`,
      success: (res) => {
        if (!res.confirm) return
        removeGrowth(r.id)
        refresh()
      },
    })
  }

  return (
    <View className='gw'>
      <View className='gw__hero'>
        <Text className='gw__title'>生长曲线</Text>
        <Text className='gw__sub'>跟同年龄、同性别的孩子比,才知道现在处在什么位置</Text>
      </View>

      {!profile.birthdate ? (
        <View className='card'>
          <Text className='card__hd'>还差一步</Text>
          <Text className='hint'>
            要先在「成长档案」里填好生日和性别,才能算百分位 —— 不然只有一串数字,看不出高矮胖瘦。
          </Text>
          <View className='save' onClick={() => Taro.navigateBack()}>
            <Text className='save__t'>去填资料</Text>
          </View>
        </View>
      ) : null}

      <View className='card'>
        <Text className='card__hd'>看哪个指标</Text>
        <View className='segs'>
          {METRICS.map((m) => (
            <View key={m} className={metric === m ? 'seg seg--on' : 'seg'} onClick={() => setMetric(m)}>
              <Text className='seg__t'>{METRIC_LABEL[m]}</Text>
            </View>
          ))}
        </View>

        {latest && latest.pct !== null ? (
          <View className='pct'>
            <Text className='pct__n'>P{Math.round(latest.pct)}</Text>
            <Text className='pct__d'>{describePercentile(latest.pct, metric)}</Text>
            <Text className='pct__m'>
              最近一次:{latest.date} · {latest.value}
              {METRIC_UNIT[metric]}
            </Text>
          </View>
        ) : null}

        {chart && points.length > 0 ? (
          <View className='chart'>
            {points.map((p, i) => (
              <View
                key={`${p.date}-${i}`}
                className='chart__dot'
                style={{
                  left: `${points.length === 1 ? 50 : 8 + (i / (points.length - 1)) * 84}%`,
                  top: `${88 - ((p.value - chart.min) / (chart.max - chart.min)) * 76}%`,
                }}
              />
            ))}
            <Text className='chart__ax' style={{ top: '8px' }}>
              {Math.round(chart.max * 10) / 10}
            </Text>
            <Text className='chart__ax' style={{ bottom: '8px' }}>
              {Math.round(chart.min * 10) / 10}
            </Text>
          </View>
        ) : (
          <Text className='empty'>还没有{METRIC_LABEL[metric]}数据。下面记一条就能看到了。</Text>
        )}

        {points.length === 1 ? <Text className='hint'>只有一个点还看不出趋势,过一两个月再量一次。</Text> : null}
        {bmiNote && metric === 'bmi' ? <Text className='hint'>{bmiNote}</Text> : null}
        <Text className='warn'>
          百分位仅供家庭参考,不是诊断。数据来源:{GROWTH_DATA_SOURCE}。孩子长得快慢差异很大,单次偏离不必紧张;
          持续低于 P3 或高于 P97,建议找儿保科医生看看。
        </Text>
      </View>

      {adding ? (
        <View className='card'>
          <Text className='card__hd'>记一次测量</Text>
          <Text className='fl'>日期</Text>
          <Picker mode='date' value={date} onChange={(e) => setDate(String(e.detail.value))}>
            <View className='fi fi--pick'>
              <Text className='fi__v'>{date}</Text>
            </View>
          </Picker>
          <Text className='fl'>身高(cm)</Text>
          <Input className='fi' type='digit' value={h} placeholder='如 112.5' onInput={(e) => setH(e.detail.value)} />
          <Text className='fl'>体重(kg)</Text>
          <Input className='fi' type='digit' value={w} placeholder='如 20.3' onInput={(e) => setW(e.detail.value)} />
          <Text className='fl'>头围(cm,小宝宝才需要)</Text>
          <Input className='fi' type='digit' value={hc} placeholder='可不填' onInput={(e) => setHc(e.detail.value)} />
          <Text className='fl'>备注</Text>
          <Input className='fi' value={note} placeholder='如「体检时量的」' onInput={(e) => setNote(e.detail.value)} />
          <View className='save' onClick={save}>
            <Text className='save__t'>保存</Text>
          </View>
          <View className='save save--ghost' onClick={() => setAdding(false)}>
            <Text className='save__t'>取消</Text>
          </View>
        </View>
      ) : null}

      {/* ⚠️ 拆成两个各自独立的「有/无」:同一位置在带 onClick 与不带的节点之间
          互换,真机上会报 componentsAlias[...]._num(见 pages/habits 的注释)。*/}
      {!adding ? (
        <View className='save' onClick={() => setAdding(true)}>
          <Text className='save__t'>+ 记一次身高体重</Text>
        </View>
      ) : null}

      <View className='card'>
        <Text className='card__hd'>全部记录({rows.length})</Text>
        {rows.length === 0 ? <Text className='empty'>还没有记录。</Text> : null}
        {rows.map((r) => (
          <View className='row' key={r.id}>
            <View className='row__m'>
              <Text className='row__d'>{r.date}</Text>
              <Text className='row__t'>
                {[
                  r.heightCm ? `身高 ${r.heightCm} cm` : '',
                  r.weightKg ? `体重 ${r.weightKg} kg` : '',
                  r.headCm ? `头围 ${r.headCm} cm` : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
              {r.note ? <Text className='row__x'>{r.note}</Text> : null}
            </View>
            <Text className='row__del' onClick={() => del(r)}>
              删除
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}

export default withGuard(Growth)
