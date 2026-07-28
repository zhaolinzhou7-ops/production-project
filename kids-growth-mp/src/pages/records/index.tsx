import { useMemo, useState } from 'react'
import { View, Text, Input, Picker } from '@tarojs/components'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import { getCurrentChildId } from '../../store/study'
import { listRecords, addRecord, removeRecord, validateRecord } from '../../store/records'
import { getRecordModule, type RecordFieldDef } from '../../core/recordModules'
import { todayISO } from '../../core/dateUtils'
import { withGuard } from '../../components/Guard'
import type { LogRecord, RecordFieldValue, RecordModule } from '../../types'
import './index.scss'

/**
 * 通用记录页 —— 视力/牙齿/就医/体检/疫苗/考级/获奖/情绪/阅读 共用这一个页面。
 *
 * 页面本身不知道任何一个模块的细节,全部按 core/recordModules.ts 的配置渲染。
 * 以后要加「新的记录类型」,只加一段配置,这里一行都不用改。
 */
function Records() {
  const router = useRouter()
  const moduleKey = (router.params.module || 'vision') as RecordModule
  const def = getRecordModule(moduleKey)

  const [childId, setChildId] = useState('')
  const [rows, setRows] = useState<LogRecord[]>([])
  const [adding, setAdding] = useState(false)
  const [date, setDate] = useState(todayISO())
  const [fields, setFields] = useState<Record<string, RecordFieldValue>>({})

  const refresh = () => {
    const cid = getCurrentChildId()
    setChildId(cid)
    if (def) setRows(listRecords(cid, def.module))
  }

  useDidShow(() => {
    refresh()
    if (def) Taro.setNavigationBarTitle({ title: def.label })
  })

  /** 数值字段的趋势点(配置里声明了 trendFields 才画) */
  const trends = useMemo(() => {
    if (!def || !def.trendFields) return []
    return def.trendFields
      .map((tf) => {
        const pts = [...rows]
          .reverse()
          .map((r) => ({ date: r.date, v: Number(r.fields[tf.key]) }))
          .filter((p) => !isNaN(p.v) && p.v !== 0)
        return { ...tf, pts }
      })
      .filter((t) => t.pts.length >= 2)
  }, [rows, def])

  const range = useMemo(() => {
    const all: number[] = []
    for (const t of trends) for (const p of t.pts) all.push(p.v)
    if (all.length === 0) return null
    let min = Math.min(...all)
    let max = Math.max(...all)
    if (max - min < 1e-6) {
      min -= 1
      max += 1
    }
    const pad = (max - min) * 0.15
    return { min: min - pad, max: max + pad }
  }, [trends])

  if (!def) {
    return (
      <View className='rec'>
        <Text className='empty'>没有这个记录类型。返回上一页重新进吧。</Text>
      </View>
    )
  }

  const setField = (key: string, v: RecordFieldValue) => setFields({ ...fields, [key]: v })

  const save = () => {
    const err = validateRecord(def.module, fields)
    if (err) {
      Taro.showToast({ title: err, icon: 'none' })
      return
    }
    const note = typeof fields.__note === 'string' ? fields.__note : undefined
    const clean: Record<string, RecordFieldValue> = {}
    for (const f of def.fields) {
      if (fields[f.key] !== undefined && fields[f.key] !== '') clean[f.key] = fields[f.key]
    }
    addRecord(childId, def.module, date, clean, note)
    setFields({})
    setAdding(false)
    refresh()
    Taro.showToast({ title: '记下了', icon: 'success' })
  }

  const del = (r: LogRecord) => {
    Taro.showModal({
      title: '删掉这条记录?',
      content: `${r.date} · ${def.summarize(r.fields)}`,
      success: (res) => {
        if (!res.confirm) return
        removeRecord(r.id)
        refresh()
      },
    })
  }

  /** 按字段类型渲染输入控件 */
  const renderField = (f: RecordFieldDef) => {
    const val = fields[f.key]
    if (f.type === 'select') {
      const opts = f.options || []
      return (
        <Picker
          mode='selector'
          range={opts}
          value={Math.max(0, opts.indexOf(String(val || '')))}
          onChange={(e) => setField(f.key, opts[Number(e.detail.value)])}
        >
          <View className='fi fi--pick'>
            <Text className='fi__v'>{val ? String(val) : '点这里选择'}</Text>
          </View>
        </Picker>
      )
    }
    if (f.type === 'rating') {
      const max = f.max || 5
      const cur = Number(val || 0)
      const stars: number[] = []
      for (let i = 1; i <= max; i++) stars.push(i)
      return (
        <View className='rate'>
          {stars.map((i) => (
            <Text key={i} className='rate__s' onClick={() => setField(f.key, i)}>
              {i <= cur ? '⭐' : '☆'}
            </Text>
          ))}
        </View>
      )
    }
    if (f.type === 'number') {
      return (
        <Input
          className='fi'
          type='digit'
          value={val === undefined ? '' : String(val)}
          placeholder={f.placeholder || '填数字'}
          onInput={(e) => setField(f.key, e.detail.value === '' ? '' : Number(e.detail.value))}
        />
      )
    }
    return (
      <Input
        className='fi'
        value={val === undefined ? '' : String(val)}
        placeholder={f.placeholder || ''}
        onInput={(e) => setField(f.key, e.detail.value)}
      />
    )
  }

  return (
    <View className='rec'>
      <View className='rec__hero'>
        <Text className='rec__e'>{def.icon}</Text>
        <Text className='rec__title'>{def.label}</Text>
        <Text className='rec__sub'>共 {rows.length} 条</Text>
      </View>

      {trends.length > 0 && range ? (
        <View className='card'>
          <Text className='card__hd'>变化趋势</Text>
          <View className='chart'>
            {trends.map((t) =>
              t.pts.map((p, i) => (
                <View
                  key={`${t.key}-${i}`}
                  className='chart__dot'
                  style={{
                    left: `${t.pts.length === 1 ? 50 : 8 + (i / (t.pts.length - 1)) * 84}%`,
                    top: `${88 - ((p.v - range.min) / (range.max - range.min)) * 76}%`,
                    background: t.color,
                    boxShadow: `0 0 0 4px ${t.color}33`,
                  }}
                />
              )),
            )}
            <Text className='chart__ax' style={{ top: '8px' }}>
              {Math.round(range.max * 10) / 10}
            </Text>
            <Text className='chart__ax' style={{ bottom: '8px' }}>
              {Math.round(range.min * 10) / 10}
            </Text>
          </View>
          <View className='legend'>
            {trends.map((t) => (
              <View className='legend__i' key={t.key}>
                <View className='legend__s' style={{ background: t.color }} />
                <Text className='legend__t'>{t.label}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {adding ? (
        <View className='card'>
          <Text className='card__hd'>{def.addLabel}</Text>
          <Text className='fl'>日期</Text>
          <Picker mode='date' value={date} onChange={(e) => setDate(String(e.detail.value))}>
            <View className='fi fi--pick'>
              <Text className='fi__v'>{date}</Text>
            </View>
          </Picker>
          {def.fields.map((f) => (
            <View key={f.key}>
              <Text className='fl'>
                {f.label}
                {f.unit ? `(${f.unit})` : ''}
                {f.required ? ' *' : ''}
              </Text>
              {renderField(f)}
            </View>
          ))}
          {def.hasNote ? (
            <View>
              <Text className='fl'>备注</Text>
              <Input
                className='fi'
                value={typeof fields.__note === 'string' ? fields.__note : ''}
                placeholder='想多写两句就写在这里'
                onInput={(e) => setField('__note', e.detail.value)}
              />
            </View>
          ) : null}
          <View className='save' onClick={save}>
            <Text className='save__t'>保存</Text>
          </View>
          <View className='save save--ghost' onClick={() => setAdding(false)}>
            <Text className='save__t'>取消</Text>
          </View>
        </View>
      ) : (
        <View className='save' onClick={() => setAdding(true)}>
          <Text className='save__t'>+ {def.addLabel}</Text>
        </View>
      )}

      <View className='card'>
        <Text className='card__hd'>记录列表</Text>
        {rows.length === 0 ? <Text className='empty'>还没有记录。点上面的按钮记第一条。</Text> : null}
        {rows.map((r) => (
          <View className='row' key={r.id}>
            <View className='row__m'>
              <Text className='row__d'>{r.date}</Text>
              <Text className='row__t'>{def.summarize(r.fields)}</Text>
              {r.note ? <Text className='row__x'>{r.note}</Text> : null}
            </View>
            <Text className='row__del' onClick={() => del(r)}>
              删除
            </Text>
          </View>
        ))}
      </View>

      {def.disclaimer ? <Text className='warn'>{def.disclaimer}</Text> : null}
      <Text className='foot'>记录只保存在这台手机上,不会自动上传。</Text>
    </View>
  )
}

export default withGuard(Records)
