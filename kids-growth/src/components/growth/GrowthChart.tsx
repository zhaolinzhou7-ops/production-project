import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { TooltipContentProps } from 'recharts'
import { PERCENTILE_KEYS, type StandardEntry } from '../../lib/growthPercentile'

interface GrowthChartProps {
  standardSeries: StandardEntry[]
  childPoints: { month: number; value: number; date: string }[]
  domain: [number, number]
  unit: string
  valueFormatter?: (v: number) => string
}

const PERCENTILE_COLORS: Record<string, string> = {
  p3: '#e7e2df',
  p10: '#d8d1cb',
  p25: '#c7bcb2',
  p50: '#a68a6f',
  p75: '#c7bcb2',
  p90: '#d8d1cb',
  p97: '#e7e2df',
}

function monthLabel(month: number): string {
  const years = Math.floor(month / 12)
  const rem = Math.round(month % 12)
  if (years === 0) return `${rem}月`
  if (rem === 0) return `${years}岁`
  return `${years}岁${rem}月`
}

function CustomTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload || payload.length === 0) return null
  const childEntry = payload.find((p) => p.dataKey === 'value')
  return (
    <div className="rounded-xl bg-white shadow-lg border border-gray-100 px-3 py-2 text-xs">
      <div className="font-bold text-gray-700 mb-1">{monthLabel(Number(label))}</div>
      {childEntry && childEntry.value != null && (
        <div className="font-bold text-brand-600">孩子：{Number(childEntry.value).toFixed(1)}</div>
      )}
      {PERCENTILE_KEYS.map((k) => {
        const entry = payload.find((p) => p.dataKey === k)
        if (!entry || entry.value == null) return null
        return (
          <div key={k} className="text-gray-500">
            {k.toUpperCase()}：{Number(entry.value).toFixed(1)}
          </div>
        )
      })}
    </div>
  )
}

export function GrowthChart({ standardSeries, childPoints, domain, unit, valueFormatter }: GrowthChartProps) {
  return (
    <div>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0efec" vertical={false} />
          <XAxis
            dataKey="month"
            type="number"
            domain={domain}
            allowDataOverflow
            tickFormatter={monthLabel}
            tick={{ fontSize: 10, fill: '#898781' }}
            axisLine={{ stroke: '#e1e0d9' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: '#898781' }}
            axisLine={false}
            tickLine={false}
            width={36}
            tickFormatter={(v) => (valueFormatter ? valueFormatter(v) : String(v))}
          />
          <Tooltip content={CustomTooltip} />
          {PERCENTILE_KEYS.map((k) => (
            <Line
              key={k}
              data={standardSeries}
              dataKey={k}
              stroke={PERCENTILE_COLORS[k]}
              strokeWidth={k === 'p50' ? 2 : 1}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
          ))}
          <Line
            data={childPoints}
            dataKey="value"
            stroke="#f9497a"
            strokeWidth={2}
            dot={{ r: 4, fill: '#f9497a', strokeWidth: 0 }}
            isAnimationActive={false}
            connectNulls
          />
          <Scatter data={childPoints} dataKey="value" fill="#f9497a" shape="circle" legendType="none" />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 px-1 text-[10px] text-gray-400">
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-3 rounded-full bg-brand-600" />
          孩子的记录
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-3 rounded-full bg-[#a68a6f]" />
          P50 中位数
        </span>
        <span>灰色区间：P3–P97（{unit}）</span>
      </div>
    </div>
  )
}
