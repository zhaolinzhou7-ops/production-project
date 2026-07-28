import { useMemo, useState } from 'react'
import { View, Text, Input, Picker } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { getCurrentChildId } from '../../store/study'
import { listExams, addExam, removeExam, subjectTrends, type ExamWithScores } from '../../store/records'
import { SUBJECT_PRESETS } from '../../core/recordModules'
import { todayISO } from '../../core/dateUtils'
import { withGuard } from '../../components/Guard'
import type { ExamType } from '../../types'
import './index.scss'

const EXAM_TYPES: ExamType[] = ['单元测', '月考', '期中', '期末', '模考', '其他']

interface Draft {
  subject: string
  score: string
  fullScore: string
  classRank: string
}

const EMPTY_DRAFT: Draft = { subject: '', score: '', fullScore: '100', classRank: '' }

/**
 * 考试成绩。
 *
 * 一次考试含多科,所以录入是「先填考试信息,再逐科加分数」。
 * 趋势一律按**得分率**算而不是原始分 —— 单元测常见 50 分制,
 * 拿 48 分和期末的 92 分直接比会得出「退步了」的荒谬结论。
 */
function Exams() {
  const [childId, setChildId] = useState('')
  const [rows, setRows] = useState<ExamWithScores[]>([])
  const [adding, setAdding] = useState(false)
  const [date, setDate] = useState(todayISO())
  const [examType, setExamType] = useState<ExamType>('单元测')
  const [name, setName] = useState('')
  const [drafts, setDrafts] = useState<Draft[]>([{ ...EMPTY_DRAFT }])

  const refresh = () => {
    const cid = getCurrentChildId()
    setChildId(cid)
    setRows(listExams(cid))
  }

  useDidShow(refresh)

  const trends = useMemo(() => (childId ? subjectTrends(childId) : []), [childId, rows])

  const setDraft = (i: number, patch: Partial<Draft>) => {
    setDrafts(drafts.map((d, j) => (i === j ? { ...d, ...patch } : d)))
  }

  const save = () => {
    const scores = drafts
      .filter((d) => d.subject && d.score !== '')
      .map((d) => ({
        subject: d.subject,
        score: Number(d.score),
        fullScore: d.fullScore ? Number(d.fullScore) : undefined,
        classRank: d.classRank ? Number(d.classRank) : undefined,
      }))
      .filter((s) => !isNaN(s.score))
    if (scores.length === 0) {
      Taro.showToast({ title: '至少填一科成绩', icon: 'none' })
      return
    }
    const bad = scores.find((s) => s.fullScore !== undefined && s.score > s.fullScore)
    if (bad) {
      Taro.showToast({ title: `${bad.subject}的分数超过满分了`, icon: 'none' })
      return
    }
    addExam(childId, { date, examType, name: name || undefined }, scores)
    setName('')
    setDrafts([{ ...EMPTY_DRAFT }])
    setAdding(false)
    refresh()
    Taro.showToast({ title: '记下了', icon: 'success' })
  }

  const del = (e: ExamWithScores) => {
    Taro.showModal({
      title: '删掉这次考试?',
      content: `${e.exam.date} ${e.exam.name || e.exam.examType},含 ${e.scores.length} 科成绩。`,
      success: (res) => {
        if (!res.confirm) return
        removeExam(e.exam.id)
        refresh()
      },
    })
  }

  return (
    <View className='ex'>
      <View className='ex__hero'>
        <Text className='ex__title'>考试成绩</Text>
        <Text className='ex__sub'>按得分率看趋势,不同满分的考试才比得出来</Text>
      </View>

      {trends.length > 0 ? (
        <View className='card'>
          <Text className='card__hd'>各科趋势</Text>
          {trends.map((t) => (
            <View className='sub' key={t.subject}>
              <View className='sub__hd'>
                <Text className='sub__n'>{t.subject}</Text>
                <Text className='sub__r'>{t.latest}%</Text>
                {t.delta !== 0 ? (
                  <Text className={t.delta > 0 ? 'sub__d sub__d--up' : 'sub__d sub__d--down'}>
                    {t.delta > 0 ? `↑ ${t.delta}` : `↓ ${Math.abs(t.delta)}`}
                  </Text>
                ) : null}
              </View>
              {/* 每科一条横向柱图,柱高就是得分率 */}
              <View className='bars'>
                {t.points.slice(-10).map((p, i) => (
                  <View className='bars__c' key={`${p.date}-${i}`}>
                    <View className='bars__b' style={{ height: `${Math.max(4, p.rate)}%` }} />
                    <Text className='bars__v'>{Math.round(p.rate)}</Text>
                  </View>
                ))}
              </View>
              <Text className='sub__x'>
                最近一次 {t.points[t.points.length - 1].score}/{t.points[t.points.length - 1].fullScore} · 共 {t.points.length} 次
              </Text>
            </View>
          ))}
          <Text className='hint'>
            柱子高度是得分率(分数÷满分)。只看一两次没意义,连着看几次才能判断是真的在进步。
          </Text>
        </View>
      ) : null}

      {adding ? (
        <View className='card'>
          <Text className='card__hd'>记一次考试</Text>
          <Text className='fl'>日期</Text>
          <Picker mode='date' value={date} onChange={(e) => setDate(String(e.detail.value))}>
            <View className='fi fi--pick'>
              <Text className='fi__v'>{date}</Text>
            </View>
          </Picker>
          <Text className='fl'>考试类型</Text>
          <Picker
            mode='selector'
            range={EXAM_TYPES}
            value={EXAM_TYPES.indexOf(examType)}
            onChange={(e) => setExamType(EXAM_TYPES[Number(e.detail.value)])}
          >
            <View className='fi fi--pick'>
              <Text className='fi__v'>{examType}</Text>
            </View>
          </Picker>
          <Text className='fl'>考试名称(可不填)</Text>
          <Input
            className='fi'
            value={name}
            placeholder='如「第三单元测验」'
            onInput={(e) => setName(e.detail.value)}
          />

          <Text className='card__hd' style={{ marginTop: '28px' }}>
            各科成绩
          </Text>
          {drafts.map((d, i) => (
            <View className='sc' key={i}>
              <Text className='fl'>第 {i + 1} 科</Text>
              <View className='tags'>
                {SUBJECT_PRESETS.map((s) => (
                  <View
                    key={s}
                    className={d.subject === s ? 'tag tag--on' : 'tag'}
                    onClick={() => setDraft(i, { subject: s })}
                  >
                    <Text className='tag__t'>{s}</Text>
                  </View>
                ))}
              </View>
              <Input
                className='fi'
                value={d.subject}
                placeholder='上面没有就自己写科目名'
                onInput={(e) => setDraft(i, { subject: e.detail.value })}
              />
              <View className='pair'>
                <View className='pair__i'>
                  <Text className='fl'>得分</Text>
                  <Input
                    className='fi'
                    type='digit'
                    value={d.score}
                    placeholder='如 92'
                    onInput={(e) => setDraft(i, { score: e.detail.value })}
                  />
                </View>
                <View className='pair__i'>
                  <Text className='fl'>满分</Text>
                  <Input
                    className='fi'
                    type='digit'
                    value={d.fullScore}
                    placeholder='100'
                    onInput={(e) => setDraft(i, { fullScore: e.detail.value })}
                  />
                </View>
              </View>
              <Text className='fl'>班级排名(拿不到就不填)</Text>
              <Input
                className='fi'
                type='number'
                value={d.classRank}
                placeholder='可不填'
                onInput={(e) => setDraft(i, { classRank: e.detail.value })}
              />
            </View>
          ))}
          <View className='save save--ghost' onClick={() => setDrafts([...drafts, { ...EMPTY_DRAFT }])}>
            <Text className='save__t'>+ 再加一科</Text>
          </View>
          <View className='save' onClick={save}>
            <Text className='save__t'>保存这次考试</Text>
          </View>
          <View className='save save--ghost' onClick={() => setAdding(false)}>
            <Text className='save__t'>取消</Text>
          </View>
        </View>
      ) : (
        <View className='save' onClick={() => setAdding(true)}>
          <Text className='save__t'>+ 记一次考试</Text>
        </View>
      )}

      <View className='card'>
        <Text className='card__hd'>考试记录({rows.length})</Text>
        {rows.length === 0 ? <Text className='empty'>还没有记录。</Text> : null}
        {rows.map((e) => (
          <View className='row' key={e.exam.id}>
            <View className='row__m'>
              <Text className='row__d'>
                {e.exam.date} · {e.exam.examType}
              </Text>
              <Text className='row__t'>{e.exam.name || '这次考试'}</Text>
              <Text className='row__x'>
                {e.scores
                  .map((s) => `${s.subject} ${s.score}${s.fullScore ? `/${s.fullScore}` : ''}${s.classRank ? `(班${s.classRank})` : ''}`)
                  .join(' · ')}
              </Text>
            </View>
            <Text className='row__del' onClick={() => del(e)}>
              删除
            </Text>
          </View>
        ))}
      </View>

      <Text className='foot'>
        分数只是某一天某一张卷子的结果。真正值得看的是趋势,以及孩子有没有在学会新东西。
      </Text>
    </View>
  )
}

export default withGuard(Exams)
