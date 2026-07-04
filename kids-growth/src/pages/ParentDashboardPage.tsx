import { useNavigate } from 'react-router-dom'
import {
  Users,
  Settings as SettingsIcon,
  ClipboardList,
  Gift,
  Ruler,
  BookHeart,
  Flame,
  Coins,
  CalendarCheck,
  Download,
  ChevronRight,
  Sparkles,
  HeartPulse,
  GraduationCap,
  Star,
  Music,
  CloudSun,
  BookOpen,
  BarChart3,
} from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Line, LineChart, ResponsiveContainer } from 'recharts'
import { db } from '../db/db'
import { useAppStore } from '../store/useAppStore'
import { buildDashboardStats } from '../lib/dashboard'
import { buildTimeline } from '../lib/timeline'
import { formatGrade, getGradeNumber, getStageMeta, getAgeStage } from '../lib/ageStage'
import { getWellbeingHint } from '../lib/wellbeing'

const BACKUP_REMINDER_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

export function ParentDashboardPage() {
  const navigate = useNavigate()
  const currentChildId = useAppStore((s) => s.currentChildId)
  const currentChild = useLiveQuery(
    () => (currentChildId ? db.children.get(currentChildId) : undefined),
    [currentChildId],
  )
  const settings = useLiveQuery(() => db.settings.get('singleton'), [])
  const stats = useLiveQuery(
    () => (currentChildId ? buildDashboardStats(currentChildId) : Promise.resolve(null)),
    [currentChildId],
  )
  const recentTimeline = useLiveQuery(
    async () => (currentChildId ? (await buildTimeline(currentChildId)).slice(0, 3) : []),
    [currentChildId],
  )
  const wellbeingHint = useLiveQuery(async () => {
    if (!currentChildId) return null
    const c = await db.children.get(currentChildId)
    return c ? getWellbeingHint(c) : null
  }, [currentChildId])

  if (!currentChild || !stats || !settings || !recentTimeline) return null

  const { levelInfo } = stats
  const needsBackupReminder =
    settings.lastBackupAt === undefined
      ? stats.xp > 0 // there is data worth backing up
      : Date.now() - settings.lastBackupAt > BACKUP_REMINDER_MS

  const onboardingSteps = [
    { done: stats.taskCount > 0, label: '导入或创建任务', to: '/parent/tasks' },
    { done: stats.rewardCount > 0, label: '设置奖励商城', to: '/parent/rewards' },
    { done: stats.latestGrowth !== null, label: '记录第一次身高体重', to: '/parent/growth' },
  ]
  const showOnboarding = onboardingSteps.some((s) => !s.done)

  const sparkData = stats.heightHistory.length >= 2 ? stats.heightHistory : stats.weightHistory
  const sparkLabel = stats.heightHistory.length >= 2 ? '身高' : '体重'

  const stageMeta = getStageMeta(getAgeStage(currentChild.birthdate))
  const grade = formatGrade(getGradeNumber(currentChild.birthdate, currentChild.enrollmentYear))
  const stageLabel =
    stageMeta.stage === 'toddler'
      ? `${stageMeta.emoji} ${stageMeta.label}`
      : `${stageMeta.emoji} ${grade || stageMeta.label}`

  return (
    <div className="pt-4 pb-10">
      <h1 className="text-xl font-bold text-gray-800 mb-1">家长中心</h1>
      <p className="text-sm text-gray-400 mb-4 flex items-center gap-2">
        <span>正在查看：{currentChild.nickname || currentChild.name}</span>
        <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-medium text-brand-600">
          {stageLabel}
        </span>
      </p>

      {wellbeingHint && (
        <div className="mb-4 rounded-2xl bg-mint-400/15 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-bold text-gray-700">
            💚 多陪陪TA
          </div>
          <p className="mt-1 text-xs text-gray-500 leading-relaxed">
            最近 {wellbeingHint.windowDays} 天记录到 {wellbeingHint.negativeCount} 次情绪偏低。
            青春期有情绪波动很正常，不妨找个轻松的时机聊聊天、一起做点TA喜欢的事。
            此提示仅基于记录条数，非心理评估；如持续低落请寻求专业帮助。
          </p>
        </div>
      )}

      {needsBackupReminder && (
        <button
          onClick={() => navigate('/parent/settings')}
          className="mb-4 w-full flex items-center gap-2 rounded-2xl bg-sun-400/20 px-4 py-3 text-left active:scale-95 transition"
        >
          <Download size={16} className="text-sun-500 shrink-0" />
          <span className="flex-1 text-xs text-gray-600">
            {settings.lastBackupAt ? '距离上次备份已超过 30 天' : '还没有备份过数据'}
            ，建议导出一份 JSON 备份以防丢失
          </span>
          <ChevronRight size={16} className="text-gray-400" />
        </button>
      )}

      {showOnboarding && (
        <div className="mb-4 rounded-3xl bg-white/70 p-4 shadow-sm">
          <div className="flex items-center gap-1.5 mb-2 font-bold text-gray-700">
            <Sparkles size={16} className="text-brand-500" />
            快速上手
          </div>
          <div className="space-y-1.5">
            {onboardingSteps.map((step) => (
              <button
                key={step.label}
                onClick={() => !step.done && navigate(step.to)}
                disabled={step.done}
                className="w-full flex items-center gap-2 text-left"
              >
                <span
                  className={`h-5 w-5 rounded-full flex items-center justify-center text-[11px] ${
                    step.done ? 'bg-mint-400 text-white' : 'border-2 border-gray-300'
                  }`}
                >
                  {step.done ? '✓' : ''}
                </span>
                <span className={`text-sm ${step.done ? 'text-gray-400 line-through' : 'text-gray-600'}`}>
                  {step.label}
                </span>
                {!step.done && <ChevronRight size={14} className="text-gray-300 ml-auto" />}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mb-4 rounded-3xl bg-white/70 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-xs text-gray-400">当前等级</div>
            <div className="font-bold text-gray-800">
              Lv.{levelInfo.level.level} {levelInfo.level.title}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-400">累计 XP</div>
            <div className="font-bold text-gray-800">{stats.xp}</div>
          </div>
        </div>
        <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden mb-3">
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-500"
            style={{ width: `${levelInfo.progress * 100}%` }}
          />
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-sun-400/15 py-2.5">
            <Coins size={16} className="mx-auto text-sun-500" />
            <div className="mt-0.5 font-bold text-gray-800">{stats.balance}</div>
            <div className="text-[10px] text-gray-400">积分余额</div>
          </div>
          <div className="rounded-2xl bg-orange-100/70 py-2.5">
            <Flame size={16} className="mx-auto text-orange-500" />
            <div className="mt-0.5 font-bold text-gray-800">{stats.streak} 天</div>
            <div className="text-[10px] text-gray-400">连续打卡</div>
          </div>
          <div className="rounded-2xl bg-mint-400/15 py-2.5">
            <CalendarCheck size={16} className="mx-auto text-mint-500" />
            <div className="mt-0.5 font-bold text-gray-800">
              {stats.weekCompletionRate === null
                ? '—'
                : `${Math.round(stats.weekCompletionRate * 100)}%`}
            </div>
            <div className="text-[10px] text-gray-400">本周完成率</div>
          </div>
        </div>
      </div>

      {stats.latestGrowth && (
        <button
          onClick={() => navigate('/parent/growth')}
          className="mb-4 w-full rounded-3xl bg-white/70 p-4 shadow-sm text-left active:scale-95 transition"
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-gray-400">最新发育记录（{stats.latestGrowth.date}）</div>
              <div className="mt-0.5 font-bold text-gray-800">
                {stats.latestGrowth.heightCm ? `${stats.latestGrowth.heightCm}cm` : ''}
                {stats.latestGrowth.heightCm && stats.latestGrowth.weightKg ? ' · ' : ''}
                {stats.latestGrowth.weightKg ? `${stats.latestGrowth.weightKg}kg` : ''}
              </div>
            </div>
            {sparkData.length >= 2 && (
              <div className="w-24 h-10">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={sparkData}>
                    <Line
                      dataKey="value"
                      stroke="#f9497a"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
          {sparkData.length >= 2 && (
            <div className="mt-1 text-[10px] text-gray-400">{sparkLabel}变化趋势</div>
          )}
        </button>
      )}

      {recentTimeline.length > 0 && (
        <button
          onClick={() => navigate('/timeline')}
          className="mb-4 w-full rounded-3xl bg-white/70 p-4 shadow-sm text-left active:scale-95 transition"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-400">最近动态</span>
            <ChevronRight size={14} className="text-gray-300" />
          </div>
          <div className="space-y-1.5">
            {recentTimeline.map((item) => (
              <div key={item.id} className="flex items-center gap-2 text-sm">
                <span>{item.icon}</span>
                <span className="flex-1 truncate text-gray-600">{item.title}</span>
                <span className="text-[10px] text-gray-400">{item.date.slice(5)}</span>
              </div>
            ))}
          </div>
        </button>
      )}

      <div className="space-y-3">
        <button
          onClick={() => navigate('/parent/tasks')}
          className="w-full flex items-center gap-3 rounded-2xl bg-white/70 p-4 shadow-sm active:scale-95 transition text-left"
        >
          <div className="rounded-xl bg-mint-400/30 p-2.5 text-mint-500">
            <ClipboardList size={20} />
          </div>
          <div>
            <div className="font-bold text-gray-800">任务与积分管理</div>
            <div className="text-xs text-gray-400">任务、打卡补登与撤销</div>
          </div>
        </button>

        <button
          onClick={() => navigate('/parent/rewards')}
          className="w-full flex items-center gap-3 rounded-2xl bg-white/70 p-4 shadow-sm active:scale-95 transition text-left"
        >
          <div className="rounded-xl bg-brand-100 p-2.5 text-brand-500">
            <Gift size={20} />
          </div>
          <div className="flex-1">
            <div className="font-bold text-gray-800">奖励与兑换管理</div>
            <div className="text-xs text-gray-400">奖励商城、兑换审批</div>
          </div>
          {stats.pendingRedemptions > 0 && (
            <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
              {stats.pendingRedemptions}
            </span>
          )}
        </button>

        <button
          onClick={() => navigate('/parent/growth')}
          className="w-full flex items-center gap-3 rounded-2xl bg-white/70 p-4 shadow-sm active:scale-95 transition text-left"
        >
          <div className="rounded-xl bg-mint-400/30 p-2.5 text-mint-500">
            <Ruler size={20} />
          </div>
          <div>
            <div className="font-bold text-gray-800">身体发育记录</div>
            <div className="text-xs text-gray-400">身高体重曲线、BMI、成长里程碑</div>
          </div>
        </button>

        <button
          onClick={() => navigate('/parent/health')}
          className="w-full flex items-center gap-3 rounded-2xl bg-white/70 p-4 shadow-sm active:scale-95 transition text-left"
        >
          <div className="rounded-xl bg-brand-100 p-2.5 text-brand-500">
            <HeartPulse size={20} />
          </div>
          <div>
            <div className="font-bold text-gray-800">健康档案</div>
            <div className="text-xs text-gray-400">视力等健康记录与趋势</div>
          </div>
        </button>

        {stageMeta.stage !== 'toddler' && (
          <button
            onClick={() => navigate('/parent/exams')}
            className="w-full flex items-center gap-3 rounded-2xl bg-white/70 p-4 shadow-sm active:scale-95 transition text-left"
          >
            <div className="rounded-xl bg-mint-400/30 p-2.5 text-mint-500">
              <GraduationCap size={20} />
            </div>
            <div>
              <div className="font-bold text-gray-800">学业成绩</div>
              <div className="text-xs text-gray-400">各科成绩、得分率与排名趋势</div>
            </div>
          </button>
        )}

        <button
          onClick={() => navigate('/parent/anecdotes')}
          className="w-full flex items-center gap-3 rounded-2xl bg-white/70 p-4 shadow-sm active:scale-95 transition text-left"
        >
          <div className="rounded-xl bg-sun-400/30 p-2.5 text-sun-500">
            <Star size={20} />
          </div>
          <div>
            <div className="font-bold text-gray-800">成长事例</div>
            <div className="text-xs text-gray-400">闪光时刻、成长时刻与品格画像</div>
          </div>
        </button>

        <button
          onClick={() => navigate('/parent/talents')}
          className="w-full flex items-center gap-3 rounded-2xl bg-white/70 p-4 shadow-sm active:scale-95 transition text-left"
        >
          <div className="rounded-xl bg-brand-100 p-2.5 text-brand-500">
            <Music size={20} />
          </div>
          <div>
            <div className="font-bold text-gray-800">兴趣特长</div>
            <div className="text-xs text-gray-400">兴趣项目、考级与比赛获奖</div>
          </div>
        </button>

        <button
          onClick={() => navigate('/parent/records/emotion')}
          className="w-full flex items-center gap-3 rounded-2xl bg-white/70 p-4 shadow-sm active:scale-95 transition text-left"
        >
          <div className="rounded-xl bg-mint-400/30 p-2.5 text-mint-500">
            <CloudSun size={20} />
          </div>
          <div>
            <div className="font-bold text-gray-800">情绪记录</div>
            <div className="text-xs text-gray-400">观察情绪规律，更好地陪伴</div>
          </div>
        </button>

        <button
          onClick={() => navigate('/parent/records/reading')}
          className="w-full flex items-center gap-3 rounded-2xl bg-white/70 p-4 shadow-sm active:scale-95 transition text-left"
        >
          <div className="rounded-xl bg-sun-400/30 p-2.5 text-sun-500">
            <BookOpen size={20} />
          </div>
          <div>
            <div className="font-bold text-gray-800">阅读记录</div>
            <div className="text-xs text-gray-400">读完的书、评分与感想</div>
          </div>
        </button>

        <button
          onClick={() => navigate('/parent/report')}
          className="w-full flex items-center gap-3 rounded-2xl bg-white/70 p-4 shadow-sm active:scale-95 transition text-left"
        >
          <div className="rounded-xl bg-brand-100 p-2.5 text-brand-500">
            <BarChart3 size={20} />
          </div>
          <div>
            <div className="font-bold text-gray-800">年度成长报告</div>
            <div className="text-xs text-gray-400">「孩子的这一年」一键回顾</div>
          </div>
        </button>

        <button
          onClick={() => navigate('/parent/archive')}
          className="w-full flex items-center gap-3 rounded-2xl bg-white/70 p-4 shadow-sm active:scale-95 transition text-left"
        >
          <div className="rounded-xl bg-sun-400/30 p-2.5 text-sun-500">
            <BookHeart size={20} />
          </div>
          <div>
            <div className="font-bold text-gray-800">学习成长档案</div>
            <div className="text-xs text-gray-400">作品集、家长寄语、成长时间线</div>
          </div>
        </button>

        <button
          onClick={() => navigate('/parent/children')}
          className="w-full flex items-center gap-3 rounded-2xl bg-white/70 p-4 shadow-sm active:scale-95 transition text-left"
        >
          <div className="rounded-xl bg-brand-100 p-2.5 text-brand-500">
            <Users size={20} />
          </div>
          <div>
            <div className="font-bold text-gray-800">管理孩子</div>
            <div className="text-xs text-gray-400">添加、编辑或删除孩子档案</div>
          </div>
        </button>

        <button
          onClick={() => navigate('/parent/settings')}
          className="w-full flex items-center gap-3 rounded-2xl bg-white/70 p-4 shadow-sm active:scale-95 transition text-left"
        >
          <div className="rounded-xl bg-sun-400/30 p-2.5 text-sun-500">
            <SettingsIcon size={20} />
          </div>
          <div>
            <div className="font-bold text-gray-800">家长设置</div>
            <div className="text-xs text-gray-400">PIN 码、数据备份与恢复</div>
          </div>
        </button>
      </div>
    </div>
  )
}
