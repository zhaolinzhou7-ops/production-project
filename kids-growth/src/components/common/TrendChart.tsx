import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

export interface TrendSeries {
  key: string
  label: string
  color: string
}

export interface TrendPoint {
  /** x 轴标签(日期或学期) */
  x: string
  [key: string]: string | number | null | undefined
}

interface TrendChartProps {
  data: TrendPoint[]
  series: TrendSeries[]
  height?: number
  unit?: string
  /** y 轴反转(如排名:数值越小越好,画在越上面) */
  invertY?: boolean
}

/** 通用多序列趋势折线图,用于视力度数/考试成绩/排名等时间序列。 */
export function TrendChart({ data, series, height = 200, unit, invertY = false }: TrendChartProps) {
  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0efec" vertical={false} />
          <XAxis
            dataKey="x"
            tick={{ fontSize: 10, fill: '#898781' }}
            axisLine={{ stroke: '#e1e0d9' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: '#898781' }}
            axisLine={false}
            tickLine={false}
            width={36}
            reversed={invertY}
            domain={['auto', 'auto']}
          />
          <Tooltip
            contentStyle={{ borderRadius: 12, border: '1px solid #f0efec', fontSize: 12 }}
            formatter={(value, name) => [`${value}${unit ?? ''}`, name]}
          />
          {series.map((s) => (
            <Line
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              dot={{ r: 3.5, fill: s.color, strokeWidth: 0 }}
              isAnimationActive={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      {series.length > 1 && (
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 px-1 text-[10px] text-gray-400">
          {series.map((s) => (
            <span key={s.key} className="flex items-center gap-1">
              <span className="inline-block h-1.5 w-3 rounded-full" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
