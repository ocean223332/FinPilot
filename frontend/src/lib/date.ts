import type { IsoDate } from './types'

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const WEEKDAYS = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy']
const DAY_MS = 86_400_000

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function toUtc(iso: IsoDate): number {
  const m = ISO_DATE.exec(iso)
  if (!m) return NaN
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

/** Real calendar date in `YYYY-MM-DD` form (rejects 2026-02-31 etc.). */
export function isValidIsoDate(iso: string): boolean {
  const t = toUtc(iso)
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === iso
}

/** Today in the user's local time zone (not UTC: `toISOString` would give yesterday in Vietnam before 07:00). */
export function todayIso(): IsoDate {
  const now = new Date()
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function addDays(iso: IsoDate, days: number): IsoDate {
  return new Date(toUtc(iso) + days * DAY_MS).toISOString().slice(0, 10)
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function diffDays(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS)
}

/** `2026-10-06` → `06/10/2026` */
export function formatDate(iso: IsoDate): string {
  const m = ISO_DATE.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

/** `2026-10-06` → `06/10` */
export function formatDayMonth(iso: IsoDate): string {
  const m = ISO_DATE.exec(iso)
  return m ? `${m[3]}/${m[2]}` : iso
}

/** `2026-10-06` → `Thứ Ba` */
export function formatWeekday(iso: IsoDate): string {
  const t = toUtc(iso)
  return Number.isNaN(t) ? '' : WEEKDAYS[new Date(t).getUTCDay()]
}
