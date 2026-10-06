import { ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDate } from '@/lib/date'
import { formatVnd } from '@/lib/money'
import type { CashEvent } from '@/lib/types'

export function DirectionBadge({ direction }: { direction: CashEvent['direction'] }) {
  return direction === 'In' ? (
    <span className="inline-flex items-center gap-1 text-emerald-700">
      <ArrowDownLeft aria-hidden="true" className="size-3.5" />
      Thu
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-rose-700">
      <ArrowUpRight aria-hidden="true" className="size-3.5" />
      Chi
    </span>
  )
}

/** Compact table of cash events (used for the "not counted" lists). */
export function EventList({ events }: { events: CashEvent[] }) {
  return (
    <Table className="text-foreground">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="h-8 px-0 text-xs">Nội dung</TableHead>
          <TableHead className="h-8 text-xs">Loại</TableHead>
          <TableHead className="h-8 text-right text-xs">Số tiền</TableHead>
          <TableHead className="h-8 pr-0 text-right text-xs">Ngày</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {events.map((event) => (
          <TableRow key={event.id} className="hover:bg-transparent">
            <TableCell className="max-w-[16rem] truncate px-0 py-1.5" title={event.label}>
              {event.label}
            </TableCell>
            <TableCell className="py-1.5">
              <DirectionBadge direction={event.direction} />
            </TableCell>
            <TableCell className="py-1.5 text-right whitespace-nowrap tabular-nums">
              {formatVnd(event.amount)}
            </TableCell>
            <TableCell className="py-1.5 pr-0 text-right whitespace-nowrap tabular-nums">
              {formatDate(event.date)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
