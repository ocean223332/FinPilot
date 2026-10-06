import type { Money } from './types'

export const CURRENCY_SYMBOL = '₫'

/** Longest amount the UI accepts (digits). Keeps values well inside Number's safe range for plotting. */
export const MAX_MONEY_DIGITS = 15

const WHOLE_NUMBER = /^-?\d+$/
const vndNumber = new Intl.NumberFormat('vi-VN')
const compactNumber = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 })

/** `"50000000"` → `"50.000.000 ₫"`. Goes through BigInt, so there is no float rounding. */
export function formatVnd(value: Money): string {
  if (!WHOLE_NUMBER.test(value)) return `${value} ${CURRENCY_SYMBOL}`
  return `${vndNumber.format(BigInt(value))} ${CURRENCY_SYMBOL}`
}

/** `"50000000"` → `"50.000.000"` (digits only, no currency symbol). Used while typing. */
export function groupDigits(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/** True for a strictly negative amount (string check, no arithmetic). */
export function isNegative(value: Money): boolean {
  return WHOLE_NUMBER.test(value) && value.startsWith('-') && /[1-9]/.test(value)
}

/** True when the amount is exactly zero. */
export function isZero(value: Money): boolean {
  return WHOLE_NUMBER.test(value) && !/[1-9]/.test(value)
}

/** Plotting only. Do not use for money arithmetic. */
export function toPlotNumber(value: Money): number {
  return Number(value)
}

/** Short axis label for a plotted value: 1,5 tỷ · 20 tr · 500 k. Plotting only. */
export function formatCompactVnd(value: number): string {
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  if (abs >= 1e9) return `${sign}${compactNumber.format(abs / 1e9)} tỷ`
  if (abs >= 1e6) return `${sign}${compactNumber.format(abs / 1e6)} tr`
  if (abs >= 1e3) return `${sign}${compactNumber.format(abs / 1e3)} k`
  return `${sign}${abs}`
}
