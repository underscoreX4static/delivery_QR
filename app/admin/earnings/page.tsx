import { EarningsBoard } from '@/components/admin/EarningsBoard'
import { PageHeader } from '@/components/admin/ui'

export default function AdminPage() {
  return (
    <>
      <PageHeader eyebrow="Money" title="Earnings" subtitle="Revenue, profit, and what actually lands in your pocket." />
      <EarningsBoard />
    </>
  )
}
