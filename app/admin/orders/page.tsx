import { OrdersBoard } from '@/components/admin/OrdersBoard'
import { PageHeader } from '@/components/admin/ui'

export default function AdminPage() {
  return (
    <>
      <PageHeader eyebrow="Operations" title="Orders" subtitle="The live pipeline — assign a driver, advance status, settle up." />
      <OrdersBoard />
    </>
  )
}
