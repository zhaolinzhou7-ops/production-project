import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../store/useAppStore'
import { useCurrentChild } from '../hooks/useCurrentChild'
import { buildAnnualReport } from '../lib/annualReport'

function StatTile({ value, label, emoji }: { value: string; label: string; emoji: string }) {
  return (
    <div className="rounded-2xl bg-white/70 p-3 text-center shadow-sm">
      <div className="text-xl">{emoji}</div>
      <div className="mt-0.5 text-lg font-bold text-gray-800">{value}</div>
      <div className="text-[10px] text-gray-400">{label}</div>
    </div>
  )
}

export function ParentReportPage() {
  const navigate = useNavigate()
  const currentChildId = useAppStore((s) => s.currentChildId)
  const { child } = useCurrentChild()
  const [year, setYear] = useState<number | undefined>(undefined)

  const report = useLiveQuery(
    () => (currentChildId ? buildAnnualReport(currentChildId, year) : Promise.resolve(null)),
    [currentChildId, year],
  )

  if (!currentChildId || !child || report === undefined) return null

  const name = child.nickname || child.name

  return (
    <div className="pt-4 pb-10">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => navigate('/parent')} className="p-1 text-gray-500">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-xl font-bold text-gray-800">年度成长报告</h1>
      </div>

      {report === null ? (
        <div className="rounded-3xl bg-white/60 p-8 text-center text-gray-400">
          <div className="text-4xl mb-2">📊</div>
          还没有足够的记录，先去记录一些成长数据吧
        </div>
      ) : (
        <>
          <div className="rounded-3xl bg-gradient-to-br from-brand-400 to-brand-600 p-6 text-white shadow-sm mb-3">
            <div className="text-sm opacity-90">{name}的</div>
            <div className="text-3xl font-bold">{report.year} 年</div>
            <div className="mt-1 text-xs opacity-80">这一年，TA又长大了一点</div>
          </div>

          {report.availableYears.length > 1 && (
            <div className="flex gap-2 mb-4 overflow-x-auto">
              {report.availableYears.map((yy) => (
                <button
                  key={yy}
                  onClick={() => setYear(yy)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition ${
                    yy === report.year ? 'bg-brand-500 text-white' : 'bg-white/60 text-gray-500'
                  }`}
                >
                  {yy}
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 mb-3">
            <StatTile
              emoji="📏"
              value={
                report.height?.delta != null
                  ? `+${report.height.delta}cm`
                  : report.height?.to != null
                    ? `${report.height.to}cm`
                    : '—'
              }
              label={report.height?.delta != null ? '今年长高' : '最新身高'}
            />
            <StatTile
              emoji="⚖️"
              value={
                report.weight?.delta != null
                  ? `${report.weight.delta > 0 ? '+' : ''}${report.weight.delta}kg`
                  : report.weight?.to != null
                    ? `${report.weight.to}kg`
                    : '—'
              }
              label={report.weight?.delta != null ? '体重变化' : '最新体重'}
            />
            <StatTile emoji="📚" value={String(report.booksRead)} label="读完的书" />
            <StatTile emoji="✅" value={String(report.checkinsDone)} label="完成打卡" />
            <StatTile emoji="⭐" value={String(report.xpEarned)} label="获得成长值" />
            <StatTile emoji="🎖️" value={String(report.badgesUnlocked)} label="解锁徽章" />
            <StatTile emoji="📝" value={String(report.examCount)} label="记录考试" />
            <StatTile emoji="✨" value={String(report.shineCount)} label="闪光时刻" />
            <StatTile emoji="🎨" value={String(report.portfolioCount)} label="作品入档" />
          </div>

          {report.subjectAvgRates.length > 0 && (
            <div className="rounded-3xl bg-white/70 p-4 shadow-sm mb-3">
              <h2 className="font-bold text-gray-700 mb-2">各科平均得分率</h2>
              <div className="space-y-2">
                {report.subjectAvgRates.map((s) => (
                  <div key={s.subject} className="flex items-center gap-2">
                    <span className="w-12 text-xs text-gray-600">{s.subject}</span>
                    <div className="flex-1 h-2.5 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-mint-400 to-mint-500"
                        style={{ width: `${Math.min(100, s.rate)}%` }}
                      />
                    </div>
                    <span className="w-12 text-right text-xs text-gray-400">{s.rate}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {report.milestones.length > 0 && (
            <div className="rounded-3xl bg-white/70 p-4 shadow-sm mb-3">
              <h2 className="font-bold text-gray-700 mb-2">🏆 今年的里程碑</h2>
              <div className="flex flex-wrap gap-1.5">
                {report.milestones.map((m, i) => (
                  <span key={i} className="rounded-full bg-sun-400/20 px-3 py-1 text-xs text-gray-600">
                    {m}
                  </span>
                ))}
              </div>
            </div>
          )}

          {report.shineHighlights.length > 0 && (
            <div className="rounded-3xl bg-white/70 p-4 shadow-sm mb-3">
              <h2 className="font-bold text-gray-700 mb-2">✨ 闪光时刻精选</h2>
              <div className="space-y-2">
                {report.shineHighlights.map((s, i) => (
                  <p key={i} className="rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-600">
                    {s}
                  </p>
                ))}
              </div>
            </div>
          )}

          {report.topBooks.length > 0 && (
            <div className="rounded-3xl bg-white/70 p-4 shadow-sm mb-3">
              <h2 className="font-bold text-gray-700 mb-2">📖 今年最喜欢的书</h2>
              <div className="flex flex-wrap gap-1.5">
                {report.topBooks.map((b, i) => (
                  <span key={i} className="rounded-full bg-brand-100 px-3 py-1 text-xs text-brand-600">
                    《{b}》
                  </span>
                ))}
              </div>
            </div>
          )}

          <p className="text-center text-[11px] text-gray-400 mt-4">
            —— 每一点努力都算数，{report.year} 年辛苦啦 ——
          </p>
        </>
      )}
    </div>
  )
}
