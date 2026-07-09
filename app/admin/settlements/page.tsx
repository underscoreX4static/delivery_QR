import { SettlementsBoard } from '@/components/admin/SettlementsBoard'
import { PageHeader } from '@/components/admin/ui'

export default function AdminPage() {
  return (
    <>
      <PageHeader eyebrow="Money" title="Settlements" subtitle="Pay drivers and commercials, confirmed over Telegram." />
      <SettlementsBoard />
    </>
  )
}
