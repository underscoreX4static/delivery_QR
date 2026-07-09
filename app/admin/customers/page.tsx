import { CustomersBoard } from '@/components/admin/CustomersBoard'
import { PageHeader } from '@/components/admin/ui'

export default function AdminPage() {
  return (
    <>
      <PageHeader eyebrow="Growth" title="Customers" subtitle="Who orders, what they spend, and where they came from." />
      <CustomersBoard />
    </>
  )
}
