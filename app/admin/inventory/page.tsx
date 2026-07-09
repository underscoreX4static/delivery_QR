import { InventoryBoard } from '@/components/admin/InventoryBoard'
import { PageHeader } from '@/components/admin/ui'

export default function AdminPage() {
  return (
    <>
      <PageHeader eyebrow="Operations" title="Inventory" subtitle="Stock health, restock urgency, and what to double down on or cut." />
      <InventoryBoard />
    </>
  )
}
