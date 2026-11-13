import { useState } from 'react'
import type { FormEvent } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { DateInput, Field, Select, TextField } from '@/components/fields'
import { MoneyInput } from '@/components/MoneyInput'
import { ErrorState, Panel } from '@/components/page'
import { formatVnd } from '@/lib/money'
import { newId } from '@/lib/id'
import { inventoryError, postDocument, saveProduct, STOCK_LABELS } from '@/lib/inventory'
import type { Product, StockDocumentInput, StockKind } from '@/lib/inventory'

export function ProductForm({ product, onClose, onSaved }: { product?: Product; onClose: () => void; onSaved: () => void }) {
  const [id] = useState(() => product?.id ?? newId())
  const [sku, setSku] = useState(product?.sku ?? '')
  const [name, setName] = useState(product?.name ?? '')
  const [unit, setUnit] = useState(product?.unit ?? '')
  const [minimum, setMinimum] = useState(String(product?.minimumStock ?? 0))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,47}$/.test(sku.trim()) || !name.trim() || !unit.trim()) {
      setError('Nhập tên, đơn vị và mã hàng hợp lệ. Mã chỉ dùng chữ, số, dấu chấm, gạch ngang hoặc gạch dưới.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await saveProduct(id, { sku: sku.trim(), name: name.trim(), unit: unit.trim(), minimumStock: Number(minimum) })
      onSaved()
    } catch (e) {
      setError(inventoryError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel title={product ? 'Sửa sản phẩm' : 'Thêm sản phẩm'}>
      <form onSubmit={submit}>
        <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
          <TextField id="product-sku" label="Mã hàng (SKU)" maxLength={48} value={sku} onChange={setSku} />
          <TextField id="product-name" label="Tên sản phẩm" maxLength={150} value={name} onChange={setName} />
          <TextField id="product-unit" label="Đơn vị tính" maxLength={30} value={unit} onChange={setUnit} placeholder="Ví dụ: cái, hộp, bao" />
          <Field id="product-minimum" label="Ngưỡng tồn thấp">
            <input id="product-minimum" className="fp-input w-full" type="number" min={0} max={1000000} step={1} required value={minimum} onChange={(e) => setMinimum(e.target.value)} />
          </Field>
          {error && <section className="sm:col-span-2"><ErrorState title={error} /></section>}
          <footer className="flex flex-wrap gap-2 sm:col-span-2">
            <Button type="submit" variant="primary" label="Lưu sản phẩm" isLoading={busy} />
            <Button type="button" variant="ghost" label="Đóng" onClick={onClose} />
          </footer>
        </fieldset>
      </form>
    </Panel>
  )
}

type DraftLine = { key: string; productId: string; quantity: string; unitPrice: string }
const blankLine = (): DraftLine => ({ key: newId(), productId: '', quantity: '1', unitPrice: '' })

export function StockDocumentForm({ kind, products, today, onClose, onSaved }: {
  kind: StockKind
  products: Product[]
  today: string
  onClose: () => void
  onSaved: () => void
}) {
  const [id] = useState(() => newId())
  const [date, setDate] = useState(today)
  const [paymentDue, setPaymentDue] = useState('')
  const [counterparty, setCounterparty] = useState('')
  const [note, setNote] = useState('')
  const [lines, setLines] = useState<DraftLine[]>(() => [blankLine()])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const priced = kind === 'receipt' || kind === 'sale'
  const total = priced ? lines.reduce((sum, line) => sum + BigInt(line.unitPrice || '0') * BigInt(/^\d+$/.test(line.quantity) ? line.quantity : '0'), 0n) : 0n

  function changeLine(key: string, changes: Partial<DraftLine>) {
    setLines((current) => current.map((line) => line.key === key ? { ...line, ...changes } : line))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    if (new Set(lines.map((line) => line.productId)).size !== lines.length) {
      setError('Mỗi mã hàng chỉ xuất hiện một lần trên phiếu.')
      return
    }
    if ((!priced && !note.trim()) || (paymentDue && total === 0n) || total > 999999999999999999n) {
      setError(!priced ? 'Nhập lý do điều chỉnh kho.' : 'Kiểm tra tổng tiền của phiếu và ngày thanh toán.')
      return
    }
    const input: StockDocumentInput = {
      kind, date, paymentDue: paymentDue || null, counterparty, note,
      lines: lines.map((line) => ({ productId: line.productId, quantity: Number(line.quantity), unitPrice: priced ? line.unitPrice : '0' })),
    }
    setBusy(true)
    setError('')
    try {
      await postDocument(id, input)
      onSaved()
    } catch (e) {
      setError(inventoryError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel title={STOCK_LABELS[kind]}>
      <form onSubmit={submit}>
        <fieldset disabled={busy} className="grid gap-4">
          <section className="grid gap-4 sm:grid-cols-2">
            <Field id="stock-date" label="Ngày chứng từ"><DateInput id="stock-date" required max={today} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            {priced && <TextField id="stock-counterparty" label={kind === 'receipt' ? 'Nhà cung cấp' : 'Khách hàng'} maxLength={150} isOptional value={counterparty} onChange={setCounterparty} />}
            {priced && (
              <Field id="stock-due" label="Ngày dự kiến thanh toán (tùy chọn)" hint="Điền ngày để tạo khoản thu hoặc chi trong Lịch thu–chi.">
                <DateInput id="stock-due" min={date} value={paymentDue} onChange={(e) => setPaymentDue(e.target.value)} />
              </Field>
            )}
            <TextField id="stock-note" label={priced ? 'Ghi chú' : 'Lý do điều chỉnh'} isOptional={priced} maxLength={500} value={note} onChange={setNote} />
          </section>
          <ol className="grid gap-3">
            {lines.map((line, index) => (
              <li key={line.key} className="grid items-end gap-3 border-t pt-3 sm:grid-cols-4">
                <Field id={'stock-item-' + line.key} label={'Mặt hàng ' + (index + 1)}>
                  <Select id={'stock-item-' + line.key} required value={line.productId} onChange={(e) => changeLine(line.key, { productId: e.target.value })}>
                    <option value="">Chọn sản phẩm</option>
                    {products.map((p) => <option key={p.id} value={p.id} disabled={p.id !== line.productId && lines.some((other) => other.productId === p.id)}>{p.sku} · {p.name} · tồn {p.stock} {p.unit}</option>)}
                  </Select>
                </Field>
                <Field id={'stock-quantity-' + line.key} label="Số lượng">
                  <input id={'stock-quantity-' + line.key} className="fp-input w-full" type="number" min={1} max={1000000} step={1} required value={line.quantity} onChange={(e) => changeLine(line.key, { quantity: e.target.value })} />
                </Field>
                {priced && (
                  <Field id={'stock-price-' + line.key} label="Đơn giá">
                    <MoneyInput id={'stock-price-' + line.key} required value={line.unitPrice} onValueChange={(unitPrice) => changeLine(line.key, { unitPrice })} />
                  </Field>
                )}
                {lines.length > 1 && <Button type="button" variant="ghost" label={'Bỏ dòng ' + (index + 1)} onClick={() => setLines((current) => current.filter((row) => row.key !== line.key))} />}
              </li>
            ))}
          </ol>
          <section className="flex flex-wrap items-center justify-between gap-3">
            <Button type="button" variant="secondary" label="Thêm dòng hàng" isDisabled={lines.length >= Math.min(50, products.length)} onClick={() => setLines((current) => [...current, blankLine()])} />
            {priced && <p className="font-bold">Tổng tiền {formatVnd(total.toString())}</p>}
          </section>
          {error && <ErrorState title={error} />}
          <footer className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" label="Ghi sổ kho" isLoading={busy} />
            <Button type="button" variant="ghost" label="Đóng" onClick={onClose} />
          </footer>
        </fieldset>
      </form>
    </Panel>
  )
}
