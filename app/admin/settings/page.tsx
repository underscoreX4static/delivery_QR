import { SettingsBoard } from '@/components/admin/SettingsBoard'
import { PageHeader } from '@/components/admin/ui'

export default function AdminPage() {
  return (
    <>
      <PageHeader eyebrow="Config" title="Settings" subtitle="Store hours, pricing, the driver pool, referrals, and treasury." />
      <SettingsBoard />
    </>
  )
}
