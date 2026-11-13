import { useEffect, useState } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { DateInput, Field, Select, TextField } from '@/components/fields'
import { EmptyState, ErrorState, Loading, PageHeader, Panel } from '@/components/page'
import { useShop } from '@/app/use-shop'
import { formatDate } from '@/lib/date'
import { cancelDocument, inventoryError, loadInventory, loadSales, STOCK_LABELS } from '@/lib/inventory'
import type { Inventory, Period, Product, SalesReport, StockDocument, StockKind } from '@/lib/inventory'
import { formatVnd } from '@/lib/money'
import { ProductForm, StockDocumentForm } from './InventoryForms'

const cell = 'px-4 py-3 align-top'
const head = 'px-4 py-3 text-left font-semibold'
const quantity = new Intl.NumberFormat('vi-VN')

function monthToDate(today: string): Period {
  return { from: today.slice(0, 7) + '-01', to: today }
}

function DateFilter({ period, onChange, today }: { period: Period; onChange: (period: Period) => void; today: string }) {
  return (
    <section className="flex flex-wrap items-end gap-3" aria-label="Lọc theo ngày">
      <Field id="inventory-from" label="Từ ngày">
        <DateInput id="inventory-from" max={period.to || today} value={period.from} onChange={(e) => onChange({ ...period, from: e.target.value })} />
      </Field>
      <Field id="inventory-to" label="Đến ngày">
        <DateInput id="inventory-to" min={period.from} max={today} value={period.to} onChange={(e) => onChange({ ...period, to: e.target.value })} />
      </Field>
      <Button label="Tháng này" variant="secondary" onClick={() => onChange(monthToDate(today))} />
    </section>
  )
}

function usePeriodData<T>(load: (period: Period, signal: AbortSignal) => Promise<T>, period: Period, revision: number) {
  const { from, to } = period
  const key = [from, to, revision].join(':')
  const valid = Boolean(from && to && from <= to)
  const [result, setResult] = useState<{ key: string; data?: T; error?: string }>()
  useEffect(() => {
    if (!valid) return
    const abort = new AbortController()
    load({ from, to }, abort.signal).then(
      (data) => { if (!abort.signal.aborted) setResult({ key, data }) },
      (error: unknown) => { if (!abort.signal.aborted) setResult({ key, error: inventoryError(error) }) },
    )
    return () => abort.abort()
  }, [load, from, to, key, valid])
  if (!valid) return { error: 'Chọn ngày bắt đầu và ngày kết thúc hợp lệ.' }
  return result?.key === key ? result : {}
}

export function InventoryScreen() {
  const { today, reload, data: shop } = useShop()
  const [period, setPeriod] = useState(() => monthToDate(today))
  const [revision, setRevision] = useState(0)
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<StockKind | ''>('')
  const [product, setProduct] = useState<Product | 'new' | null>(null)
  const [documentKind, setDocumentKind] = useState<StockKind | null>(null)
  const [cancelling, setCancelling] = useState<StockDocument | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [actionError, setActionError] = useState('')
  const result = usePeriodData<Inventory>(loadInventory, period, revision)
  const activeObligations = new Set(shop?.obligations.map((obligation) => obligation.id))
  const products = result.data?.products ?? []
  const search = query.trim().toLocaleLowerCase('vi')
  const matches = products.filter((item) => [item.sku, item.name].some((value) => value.toLocaleLowerCase('vi').includes(search)))
  const documents = result.data?.documents.filter((item) => !kind || item.kind === kind) ?? []

  function retry() {
    setRevision((value) => value + 1)
  }

  function saved(message: string, refreshCash = false) {
    setProduct(null)
    setDocumentKind(null)
    setNotice(message)
    setActionError('')
    retry()
    if (refreshCash) reload()
  }

  async function cancel() {
    if (!cancelling || busy) return
    const id = cancelling.id
    setBusy(true)
    setActionError('')
    setNotice('')
    try {
      await cancelDocument(id)
      saved('Đã hủy phiếu và cập nhật tồn kho.', true)
    } catch (error) {
      setActionError(inventoryError(error))
    } finally {
      setBusy(false)
    }
  }

  function openProduct(item: Product | 'new') {
    setDocumentKind(null)
    setProduct(item)
    setNotice('')
  }

  return (
    <section className="grid gap-5">
      <PageHeader title="Kho hàng" actions={<Button label="Thêm sản phẩm" variant="primary" onClick={() => openProduct('new')} />} />
      <nav aria-label="Ghi phiếu kho" className="flex flex-wrap gap-2">
        {(Object.keys(STOCK_LABELS) as StockKind[]).map((key) => (
          <Button key={key} label={STOCK_LABELS[key]} variant="secondary" isDisabled={!products.length} onClick={() => {
            setProduct(null)
            setDocumentKind(key)
            setNotice('')
          }} />
        ))}
      </nav>
      {notice && <p role="status" className="font-medium text-ok">{notice}</p>}
      {actionError && <ErrorState title={actionError} />}
      {product && <ProductForm key={product === 'new' ? 'new' : product.id} product={product === 'new' ? undefined : product} onClose={() => setProduct(null)} onSaved={() => saved('Đã lưu sản phẩm.')} />}
      {documentKind && <StockDocumentForm key={documentKind} kind={documentKind} products={products} today={today} onClose={() => setDocumentKind(null)} onSaved={() => saved('Đã ghi phiếu và cập nhật tồn kho.', true)} />}
      <Panel title="Tồn kho hiện tại" titleId="inventory-stock" bodyClassName="grid gap-4">
        <TextField id="inventory-search" label="Tìm theo mã hoặc tên hàng" value={query} onChange={setQuery} />
        {result.data && (matches.length ? (
          <section className="overflow-x-auto">
            <table className="w-full text-sm" aria-labelledby="inventory-stock">
              <thead className="bg-muted"><tr>{['Mã hàng', 'Sản phẩm', 'Tồn hiện tại', 'Ngưỡng tồn thấp', 'Trạng thái', 'Thao tác'].map((label) => <th key={label} scope="col" className={head}>{label}</th>)}</tr></thead>
              <tbody>
                {matches.map((item) => (
                  <tr key={item.id} className="border-b">
                    <th scope="row" className={head}>{item.sku}</th>
                    <td className={cell}>{item.name}</td>
                    <td className={cell}>{quantity.format(item.stock)} {item.unit}</td>
                    <td className={cell}>{quantity.format(item.minimumStock)}</td>
                    <td className={cell}>{item.stock === 0 ? <strong className="text-shortage">Hết hàng</strong> : item.stock <= item.minimumStock ? <strong className="text-shortage">Tồn thấp</strong> : 'Còn hàng'}</td>
                    <td className={cell}><Button size="sm" variant="ghost" label={'Sửa ' + item.sku} onClick={() => openProduct(item)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : <EmptyState bare title={products.length ? 'Không tìm thấy sản phẩm phù hợp' : 'Thêm sản phẩm để bắt đầu ghi phiếu kho'} />)}
      </Panel>

      <Panel title="Lịch sử phiếu kho" titleId="inventory-history" bodyClassName="grid gap-4">
        <section className="flex flex-wrap items-end gap-3">
          <DateFilter period={period} onChange={setPeriod} today={today} />
          <Field id="inventory-kind" label="Loại phiếu">
            <Select id="inventory-kind" value={kind} onChange={(e) => setKind(e.target.value as StockKind | '')}>
              <option value="">Tất cả</option>
              {Object.entries(STOCK_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
          </Field>
        </section>
        {result.error ? <ErrorState title={result.error} onRetry={retry} /> : !result.data ? <Loading /> : !documents.length ? (
          <EmptyState bare title="Chưa có phiếu trong khoảng ngày này" />
        ) : (
          <ul className="divide-y border-y">
            {documents.map((item) => (
              <li key={item.id} className="grid gap-2 py-3">
                <details>
                  <summary className="cursor-pointer font-semibold">
                    {formatDate(item.date)} · {STOCK_LABELS[item.kind]}{item.counterparty ? ' · ' + item.counterparty : ''}
                    {item.kind === 'receipt' || item.kind === 'sale' ? ' · ' + formatVnd(item.total) : ''}
                    {item.cancelledAt ? ' · Đã hủy' : ''}
                  </summary>
                  <p className="mt-2 break-all text-xs text-secondary">Mã phiếu {item.id}</p>
                  {item.note && <p className="mt-2 break-words text-sm">{item.note}</p>}
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                    {item.lines.map((line) => (
                      <li key={line.productId}>{line.sku} · {line.productName} · {quantity.format(line.quantity)} {line.unit}{item.kind === 'receipt' || item.kind === 'sale' ? ' × ' + formatVnd(line.unitPrice) : ''}</li>
                    ))}
                  </ul>
                  {!item.cancelledAt && item.obligationId && activeObligations.has(item.obligationId) && <a className="mt-3 block underline" href="#lich">Xem khoản thanh toán trong Lịch thu–chi</a>}
                  {!item.cancelledAt && <section className="mt-3"><Button size="sm" variant="ghost" label="Hủy phiếu" isDisabled={busy} onClick={() => setCancelling(item)} /></section>}
                </details>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <ConfirmDialog open={Boolean(cancelling)} onOpenChange={(open) => { if (!open) setCancelling(null) }} title="Hủy phiếu kho?"
        description="Tồn kho sẽ được hoàn lại theo phiếu. Khoản dự kiến thu hoặc chi liên kết cũng sẽ được gỡ."
        confirmLabel="Hủy phiếu" onConfirm={() => void cancel()} />
    </section>
  )
}

export function SalesScreen() {
  const { today } = useShop()
  const [period, setPeriod] = useState(() => monthToDate(today))
  const [revision, setRevision] = useState(0)
  const result = usePeriodData<SalesReport>(loadSales, period, revision)
  const report = result.data
  return (
    <section className="grid gap-5">
      <PageHeader title="Báo cáo doanh thu" />
      <DateFilter period={period} onChange={setPeriod} today={today} />
      <p className="text-sm text-secondary">Doanh thu tính theo ngày ghi phiếu xuất bán còn hiệu lực, kể cả các phiếu chưa thu tiền.</p>
      {result.error ? <ErrorState title={result.error} onRetry={() => setRevision((value) => value + 1)} /> : !report ? <Loading /> : (
        <>
          <section className="grid gap-3 sm:grid-cols-3">
            <Panel><dl><dt className="text-sm text-secondary">Doanh thu bán hàng</dt><dd className="mt-2 text-xl font-bold">{formatVnd(report.revenue)}</dd></dl></Panel>
            <Panel><dl><dt className="text-sm text-secondary">Phiếu bán</dt><dd className="mt-2 text-xl font-bold">{quantity.format(report.documents)}</dd></dl></Panel>
            <Panel><dl><dt className="text-sm text-secondary">Giá trị nhập hàng</dt><dd className="mt-2 text-xl font-bold">{formatVnd(report.purchases)}</dd></dl></Panel>
          </section>
          {report.days.length ? (
            <>
              <Panel title="Theo ngày" titleId="sales-days">
                <section className="overflow-x-auto">
                  <table className="w-full text-sm" aria-labelledby="sales-days">
                    <thead className="bg-muted"><tr>{['Ngày', 'Phiếu bán', 'Doanh thu'].map((label) => <th key={label} scope="col" className={head}>{label}</th>)}</tr></thead>
                    <tbody>{report.days.map((day) => <tr key={day.date} className="border-b"><th scope="row" className={head}>{formatDate(day.date)}</th><td className={cell}>{quantity.format(day.documents)}</td><td className={cell}>{formatVnd(day.revenue)}</td></tr>)}</tbody>
                  </table>
                </section>
              </Panel>
              <Panel title="Theo sản phẩm" titleId="sales-products">
                <section className="overflow-x-auto">
                  <table className="w-full text-sm" aria-labelledby="sales-products">
                    <thead className="bg-muted"><tr>{['Mã hàng', 'Sản phẩm', 'Đã bán', 'Doanh thu'].map((label) => <th key={label} scope="col" className={head}>{label}</th>)}</tr></thead>
                    <tbody>{report.products.map((item) => <tr key={item.productId} className="border-b"><th scope="row" className={head}>{item.sku}</th><td className={cell}>{item.name}</td><td className={cell}>{quantity.format(item.quantity)} {item.unit}</td><td className={cell}>{formatVnd(item.revenue)}</td></tr>)}</tbody>
                  </table>
                </section>
              </Panel>
            </>
          ) : <EmptyState title="Chưa có doanh thu bán hàng trong khoảng ngày này" />}
        </>
      )}
    </section>
  )
}
