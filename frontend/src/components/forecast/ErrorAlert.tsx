import { CircleAlert } from 'lucide-react'
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import type { ApiError } from '@/lib/api'

const FIELD_NAMES: Record<string, string> = {
  openingcash: 'Tiền mặt hiện có',
  start: 'Ngày bắt đầu',
  horizondays: 'Số ngày dự báo',
  events: 'Danh sách thu/chi',
  direction: 'Loại',
  amount: 'Số tiền',
  date: 'Ngày',
  label: 'Nội dung',
}

/** `Events[1].Amount` → `Khoản 2 · Số tiền`. Unknown field names are shown as sent. */
function describeField(path: string): string {
  if (!path) return 'Dữ liệu'
  const parts = path.split('.').map((part) => {
    const indexed = /^(\w+)\[(\d+)\]$/.exec(part)
    if (indexed) {
      const [, name, position] = indexed
      const ordinal = Number(position) + 1
      return name.toLowerCase() === 'events' ? `Khoản ${ordinal}` : `${FIELD_NAMES[name.toLowerCase()] ?? name} ${ordinal}`
    }
    return FIELD_NAMES[part.toLowerCase()] ?? part
  })
  return parts.join(' · ')
}

function headline(error: ApiError): { title: string; hint?: string } {
  if (error.status === 0) {
    return { title: 'Không kết nối được máy chủ', hint: 'Kiểm tra kết nối mạng rồi thử lại.' }
  }
  // Gateway errors: the proxy / load balancer answered but the API behind it did not.
  if (error.status === 502 || error.status === 503 || error.status === 504) {
    return { title: 'Máy chủ chưa sẵn sàng', hint: 'Máy chủ có thể đang khởi động hoặc bảo trì. Vui lòng thử lại sau ít phút.' }
  }
  if (error.status === 401 || error.status === 403) {
    return { title: 'Bạn chưa đăng nhập hoặc không có quyền dùng chức năng này' }
  }
  if (error.status >= 500) {
    return {
      title: 'Máy chủ gặp sự cố khi tính dự báo',
      hint: 'Đây không phải lỗi do dữ liệu bạn nhập. Vui lòng thử lại sau ít phút.',
    }
  }
  if (error.status >= 400) {
    return { title: 'Dữ liệu chưa hợp lệ', hint: 'Sửa các mục dưới đây rồi bấm “Dự báo” lại.' }
  }
  return { title: 'Không thể hiển thị kết quả dự báo' }
}

interface ErrorAlertProps {
  error: ApiError
  onRetry: () => void
}

export function ErrorAlert({ error, onRetry }: ErrorAlertProps) {
  const { title, hint } = headline(error)
  const problem = error.problem
  const fieldErrors = Object.entries(problem?.errors ?? {}).flatMap(([field, messages]) =>
    messages.map((message) => ({ field, message })),
  )
  // The backend's own words, shown verbatim as technical detail (they are not necessarily Vietnamese).
  const technical = [
    error.status > 0 ? `HTTP ${error.status}` : null,
    problem?.detail ?? problem?.title ?? null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <Alert variant="destructive" className="pr-24">
      <CircleAlert aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        {hint && <p>{hint}</p>}
        {fieldErrors.length > 0 && (
          <ul className="mt-2 list-disc space-y-0.5 pl-4">
            {fieldErrors.map(({ field, message }, i) => (
              <li key={`${field}-${i}`}>
                <span className="font-medium">{describeField(field)}:</span> {message}
              </li>
            ))}
          </ul>
        )}
        {technical && <p className="mt-2 text-xs break-words opacity-80">{technical}</p>}
      </AlertDescription>
      <AlertAction>
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          Thử lại
        </Button>
      </AlertAction>
    </Alert>
  )
}
