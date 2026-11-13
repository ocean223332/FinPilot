import { ApiError, request } from './api'
import type { Money } from './types'

export type StockKind = 'receipt' | 'sale' | 'adjustment' | 'stock-out'
export type ProductInput = { sku: string; name: string; unit: string; minimumStock: number }
export type Product = ProductInput & { id: string; stock: number }
export type StockLineInput = { productId: string; quantity: number; unitPrice: Money }
export type StockDocumentInput = {
  kind: StockKind
  date: string
  paymentDue: string | null
  counterparty: string
  note: string
  lines: StockLineInput[]
}

export type StockDocument = Omit<StockDocumentInput, 'lines'> & {
  id: string
  cancelledAt: string | null
  obligationId: string | null
  total: Money
  lines: (StockLineInput & { sku: string; productName: string; unit: string })[]
}

export type Period = { from: string; to: string }
export type Inventory = { products: Product[]; documents: StockDocument[] }
export type SalesReport = {
  revenue: Money
  documents: number
  purchases: Money
  days: { date: string; revenue: Money; documents: number }[]
  products: { productId: string; sku: string; name: string; unit: string; quantity: number; revenue: Money }[]
}

export const STOCK_LABELS: Record<StockKind, string> = {
  receipt: 'Nhập hàng',
  sale: 'Xuất bán',
  adjustment: 'Nhập tồn đầu / tăng tồn',
  'stock-out': 'Xuất khác / giảm tồn',
}

function query(period: Period) {
  return new URLSearchParams(period).toString()
}

export function loadInventory(period: Period, signal: AbortSignal) {
  return request('GET', '/api/shop/inventory?' + query(period), {
    signal,
    expect: (body): body is Inventory => {
      const data = body as Inventory | null
      return Array.isArray(data?.products) && Array.isArray(data?.documents)
    },
  })
}

export function loadSales(period: Period, signal: AbortSignal) {
  return request('GET', '/api/shop/reports/sales?' + query(period), {
    signal,
    expect: (body): body is SalesReport => {
      const data = body as SalesReport | null
      return typeof data?.revenue === 'string' && Array.isArray(data.days) && Array.isArray(data.products)
    },
  })
}

export function saveProduct(id: string, input: ProductInput) {
  return request('PUT', '/api/shop/inventory/products/' + id, { json: input })
}

export function postDocument(id: string, input: StockDocumentInput) {
  return request('PUT', '/api/shop/inventory/documents/' + id, { json: input })
}

export function cancelDocument(id: string) {
  return request('POST', '/api/shop/inventory/documents/' + id + '/cancel')
}

export function inventoryError(error: unknown) {
  if (error instanceof ApiError && error.status === 0)
    return 'Chưa kết nối được với máy chủ. Kiểm tra kết nối rồi thử lại.'
  if (error instanceof ApiError && error.status === 400 && error.problem?.errors)
    return 'Thông tin chưa hợp lệ. Kiểm tra các trường và thử lại.'
  if (error instanceof ApiError && error.status < 500 && error.message) return error.message
  return 'Chưa thực hiện được thao tác. Vui lòng thử lại.'
}
