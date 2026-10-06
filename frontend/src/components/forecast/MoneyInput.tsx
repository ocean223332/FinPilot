import { useId, useLayoutEffect, useReducer, useRef, useState } from 'react'
import type { ClipboardEvent, ComponentProps, SyntheticEvent } from 'react'
import { Input } from '@/components/ui/input'
import { CURRENCY_SYMBOL, MAX_MONEY_DIGITS, groupDigits } from '@/lib/money'
import { cn } from '@/lib/utils'

interface MoneyInputProps
  extends Omit<ComponentProps<typeof Input>, 'value' | 'onChange' | 'type' | 'inputMode'> {
  /** Whole VND as a digit string ("" when empty). */
  value: string
  onValueChange: (value: string) => void
  /** Validation message from the form; the transient "rejected input" hint takes precedence. */
  error?: string
}

const NOT_WHOLE = 'Chỉ nhập số nguyên (đồng)'
const TOO_LONG = `Tối đa ${MAX_MONEY_DIGITS} chữ số`

/** Number of digits in `text` before index `index`. */
function digitsBefore(text: string, index: number): number {
  return text.slice(0, index).replace(/\D/g, '').length
}

/** Caret index in `formatted` that sits right after its `count`-th digit. */
function caretAfterDigits(formatted: string, count: number): number {
  if (count <= 0) return 0
  let seen = 0
  for (let i = 0; i < formatted.length; i += 1) {
    if (/\d/.test(formatted[i])) seen += 1
    if (seen === count) return i + 1
  }
  return formatted.length
}

/**
 * Whole-VND input. Shows `50.000.000` while the form state keeps the plain digit string `"50000000"`.
 * Anything that is not an integer (decimal comma, minus, letters, "1.5"-style paste) is rejected, not coerced.
 */
export function MoneyInput({ value, onValueChange, error, className, id, onBlur, ...props }: MoneyInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const pendingCaret = useRef<number | null>(null)
  const [rejection, setRejection] = useState<string | null>(null)
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  const messageId = useId()

  // Re-apply the caret after React re-renders the reformatted value (grouping dots shift the digits).
  useLayoutEffect(() => {
    const input = inputRef.current
    const digits = pendingCaret.current
    pendingCaret.current = null
    if (digits === null || !input || document.activeElement !== input) return
    const caret = caretAfterDigits(input.value, digits)
    input.setSelectionRange(caret, caret)
  })

  function commit(next: string, caretDigits: number) {
    pendingCaret.current = caretDigits
    setRejection(null)
    onValueChange(next)
    rerender()
  }

  function reject(message: string, caretDigits: number) {
    pendingCaret.current = caretDigits
    setRejection(message)
    rerender()
  }

  function normalise(digits: string): string {
    return digits.replace(/^0+(?=\d)/, '')
  }

  function handleChange(event: SyntheticEvent<HTMLInputElement>) {
    const raw = event.currentTarget.value
    const caret = event.currentTarget.selectionStart ?? raw.length
    // Grouping dots and spaces are formatting, not input.
    const stripped = raw.replace(/[.\s ]/g, '')
    const caretDigits = digitsBefore(raw, caret)
    if (/\D/.test(stripped)) return reject(NOT_WHOLE, caretDigits)
    if (stripped.length > MAX_MONEY_DIGITS) return reject(TOO_LONG, caretDigits)
    commit(normalise(stripped), caretDigits)
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault()
    const text = event.clipboardData.getData('text').trim()
    const input = event.currentTarget
    const start = input.selectionStart ?? input.value.length
    const end = input.selectionEnd ?? start
    const from = digitsBefore(input.value, start)
    const to = digitsBefore(input.value, end)
    // Only plain digits or vi-VN grouping (50.000.000 / 50 000 000). "1.5" or "1,500,000" is ambiguous → reject.
    if (!/^\d+$/.test(text) && !/^\d{1,3}([.\s ]\d{3})+$/.test(text)) return reject(NOT_WHOLE, from)
    const pasted = text.replace(/\D/g, '')
    const next = value.slice(0, from) + pasted + value.slice(to)
    if (next.length > MAX_MONEY_DIGITS) return reject(TOO_LONG, from)
    commit(normalise(next), from + pasted.length)
  }

  const message = rejection ?? error
  const invalid = Boolean(message)

  return (
    <div className="min-w-0">
      <div className="relative">
        <Input
          {...props}
          ref={inputRef}
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={groupDigits(value)}
          onChange={handleChange}
          onPaste={handlePaste}
          onBlur={(event) => {
            setRejection(null)
            onBlur?.(event)
          }}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? messageId : undefined}
          className={cn('pr-7 text-right tabular-nums', className)}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-muted-foreground"
        >
          {CURRENCY_SYMBOL}
        </span>
      </div>
      {invalid && (
        <p id={messageId} className="mt-1 text-xs text-destructive">
          {message}
        </p>
      )}
    </div>
  )
}
