import { useMemo } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  usePlotArea,
  useYAxisScale,
} from 'recharts'
import { ArrowDownLeft, ArrowUpRight, TriangleAlert } from 'lucide-react'
import { useElementWidth } from '@/hooks/use-element-width'
import { formatDate, formatDayMonth, formatWeekday } from '@/lib/date'
import { formatCompactVnd, formatVnd, isNegative, isZero, toPlotNumber } from '@/lib/money'
import type { CashEvent, ForecastDay, ForecastResponse } from '@/lib/types'
import { INTRADAY_RISK_NOTE } from './copy'

interface Datum {
  date: string
  closing: number
  day: ForecastDay
  index: number
}

const LINE_GRADIENT = 'fp-balance-line'
const FILL_GRADIENT = 'fp-balance-fill'
const WIDE_CHART = 520 // px: below this, label every 14 days instead of every 7

/** Round a rough tick step up to 1, 2 or 5 × 10^k so the axis lands on clean numbers (and on 0). */
function niceStep(rough: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const fraction = rough / magnitude
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10
  return Math.max(1, nice * magnitude)
}

/** Gradients that flip from blue to red exactly where the axis crosses 0 (measured from the real y-scale). */
function ZeroSplitGradients() {
  const plot = usePlotArea()
  const yScale = useYAxisScale()
  const zeroY = yScale?.(0)
  if (!plot || zeroY === undefined || Number.isNaN(zeroY) || plot.height <= 0) return null
  const offset = Math.min(1, Math.max(0, (zeroY - plot.y) / plot.height))
  const vertical = { gradientUnits: 'userSpaceOnUse' as const, x1: 0, x2: 0, y1: plot.y, y2: plot.y + plot.height }

  return (
    <defs>
      <linearGradient id={LINE_GRADIENT} {...vertical}>
        <stop offset={offset} stopColor="var(--balance)" />
        <stop offset={offset} stopColor="var(--shortage)" />
      </linearGradient>
      <linearGradient id={FILL_GRADIENT} {...vertical}>
        <stop offset={offset} stopColor="var(--balance)" stopOpacity={0.12} />
        <stop offset={offset} stopColor="var(--shortage)" stopOpacity={0.2} />
      </linearGradient>
    </defs>
  )
}

interface DotShapeProps {
  cx?: number
  cy?: number
}

/** Amber diamond (≥ 8px) with a 2px surface ring: a day where money comes in and goes out together. */
function RiskDiamond({ cx = 0, cy = 0 }: DotShapeProps) {
  const r = 7
  return (
    <path
      d={`M${cx} ${cy - r} L${cx + r} ${cy} L${cx} ${cy + r} L${cx - r} ${cy} Z`}
      fill="var(--caution)"
      stroke="var(--card)"
      strokeWidth={2}
      strokeLinejoin="round"
    />
  )
}

function ActiveDot({ cx, cy, payload }: DotShapeProps & { payload?: Datum }) {
  if (cx === undefined || cy === undefined) return <g />
  const negative = payload ? payload.closing < 0 : false
  return (
    <circle
      cx={cx}
      cy={cy}
      r={5}
      fill={negative ? 'var(--shortage)' : 'var(--balance)'}
      stroke="var(--card)"
      strokeWidth={2}
    />
  )
}

interface ChartTooltipProps {
  active?: boolean
  payload?: ReadonlyArray<{ payload?: Datum }>
  eventsById: Map<string, CashEvent>
}

function ChartTooltip({ active, payload, eventsById }: ChartTooltipProps) {
  const datum = payload?.[0]?.payload
  if (!active || !datum) return null
  const { day, index } = datum
  const negative = isNegative(day.closing)
  const events = day.eventIds.map((id) => eventsById.get(id)).filter((e): e is CashEvent => Boolean(e))

  return (
    <div className="w-64 max-w-[calc(100vw-2rem)] rounded-lg border bg-popover p-3 text-xs text-popover-foreground shadow-md">
      <p className="text-muted-foreground">
        {formatWeekday(day.date)}, {formatDate(day.date)} · Ngày {index}
      </p>
      <p className="mt-1.5 text-muted-foreground">Số dư cuối ngày</p>
      <p className={`text-base font-semibold whitespace-nowrap tabular-nums ${negative ? 'text-shortage' : ''}`}>
        {formatVnd(day.closing)}
        {negative && <span className="ml-2 text-xs font-medium">Thiếu tiền</span>}
      </p>
      <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 tabular-nums">
        <dt className="text-muted-foreground">Đầu ngày</dt>
        <dd className="text-right whitespace-nowrap">{formatVnd(day.opening)}</dd>
        {!isZero(day.inflow) && (
          <>
            <dt className="text-muted-foreground">Thu</dt>
            <dd className="text-right whitespace-nowrap">+{formatVnd(day.inflow)}</dd>
          </>
        )}
        {!isZero(day.outflow) && (
          <>
            <dt className="text-muted-foreground">Chi</dt>
            <dd className="text-right whitespace-nowrap">−{formatVnd(day.outflow)}</dd>
          </>
        )}
      </dl>
      {events.length > 0 && (
        <ul className="mt-2 space-y-0.5 border-t pt-2">
          {events.map((e) => (
            <li key={e.id} className="flex items-center gap-1.5">
              {e.direction === 'In' ? (
                <ArrowDownLeft aria-label="Thu" className="size-3 shrink-0 text-emerald-600" />
              ) : (
                <ArrowUpRight aria-label="Chi" className="size-3 shrink-0 text-rose-600" />
              )}
              <span className="min-w-0 flex-1 truncate">{e.label}</span>
            </li>
          ))}
        </ul>
      )}
      {day.hasIntradayTimingRisk && (
        <p className="mt-2 flex gap-1.5 border-t pt-2 text-amber-800">
          <TriangleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" />
          {INTRADAY_RISK_NOTE}
        </p>
      )}
    </div>
  )
}

function LegendItem({ children, mark }: { children: string; mark: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" className="shrink-0">
        {mark}
      </svg>
      {children}
    </li>
  )
}

interface BalanceChartProps {
  result: ForecastResponse
  /** Events that were sent in the request, to name the items behind each day in the tooltip. */
  events: CashEvent[]
}

export function BalanceChart({ result, events }: BalanceChartProps) {
  const [containerRef, width] = useElementWidth<HTMLDivElement>()
  const { days } = result

  const data = useMemo<Datum[]>(
    () => days.map((day, index) => ({ date: day.date, closing: toPlotNumber(day.closing), day, index })),
    [days],
  )
  const eventsById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events])
  const riskDays = useMemo(() => data.filter((d) => d.day.hasIntradayTimingRisk), [data])
  const lowest = data.find((d) => d.date === result.lowestBalanceDate)

  const ticks = useMemo(() => {
    const step = width >= WIDE_CHART ? 7 : 14
    return data.filter((_, i) => i % step === 0).map((d) => d.date)
  }, [data, width])

  const { domain, yTicks, hasShortage } = useMemo(() => {
    const values = data.map((d) => d.closing)
    const min = Math.min(0, ...values)
    const highest = Math.max(0, ...values)
    const max = highest === min ? 1_000_000 : highest // all-zero series still needs a visible axis
    const step = niceStep((max - min) / 4)
    const lo = Math.floor(min / step) * step
    const hi = Math.ceil(max / step) * step
    const ticks: number[] = []
    for (let v = lo; v <= hi; v += step) ticks.push(v)
    return { domain: [lo, hi] as [number, number], yTicks: ticks, hasShortage: min < 0 }
  }, [data])

  return (
    <div>
      <p className="sr-only">
        Biểu đồ số dư cuối ngày trong {days.length} ngày, từ {formatDate(days[0].date)} đến{' '}
        {formatDate(days[days.length - 1].date)}. Số dư thấp nhất {formatVnd(result.lowestBalance)} vào ngày{' '}
        {formatDate(result.lowestBalanceDate)}. Xem bảng chi tiết từng ngày bên dưới để đọc đủ số liệu.
      </p>

      <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
        <LegendItem mark={<path d="M1 8h14" stroke="var(--balance)" strokeWidth="2" strokeLinecap="round" />}>
          Số dư cuối ngày
        </LegendItem>
        {hasShortage && (
          <LegendItem mark={<path d="M1 8h14" stroke="var(--shortage)" strokeWidth="2" strokeLinecap="round" />}>
            Số dư âm (thiếu tiền)
          </LegendItem>
        )}
        <LegendItem
          mark={<circle cx="8" cy="8" r="5.5" fill="none" stroke="var(--foreground)" strokeWidth="2" />}
        >
          Ngày thấp nhất
        </LegendItem>
        {riskDays.length > 0 && (
          <LegendItem
            mark={<path d="M8 1 L15 8 L8 15 L1 8 Z" fill="var(--caution)" stroke="var(--card)" strokeWidth="1" />}
          >
            Thu và chi cùng ngày
          </LegendItem>
        )}
      </ul>

      <div ref={containerRef} className="h-72 w-full sm:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
            <ZeroSplitGradients />
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="date"
              ticks={ticks}
              interval={0}
              tickFormatter={formatDayMonth}
              tickLine={false}
              axisLine={{ stroke: 'var(--border)' }}
              tickMargin={8}
              padding={{ left: 8, right: 8 }}
              tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
            />
            <YAxis
              domain={domain}
              width={64}
              ticks={yTicks}
              tickFormatter={formatCompactVnd}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
            />
            <ReferenceLine y={0} stroke="var(--foreground)" strokeOpacity={0.6} strokeWidth={1.5} />
            <Tooltip
              content={<ChartTooltip eventsById={eventsById} />}
              cursor={{ stroke: 'var(--foreground)', strokeOpacity: 0.25 }}
              isAnimationActive={false}
            />
            <Area
              dataKey="closing"
              type="stepAfter"
              baseValue={0}
              stroke={`url(#${LINE_GRADIENT})`}
              strokeWidth={2}
              strokeLinejoin="round"
              fill={`url(#${FILL_GRADIENT})`}
              dot={false}
              activeDot={ActiveDot}
              isAnimationActive={false}
            />
            {riskDays.map((d) => (
              <ReferenceDot key={d.date} x={d.date} y={d.closing} r={7} shape={RiskDiamond} ifOverflow="visible" />
            ))}
            {lowest && (
              <ReferenceDot
                x={lowest.date}
                y={lowest.closing}
                r={8}
                fill="none"
                stroke="var(--foreground)"
                strokeWidth={2}
                ifOverflow="visible"
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>

    </div>
  )
}
