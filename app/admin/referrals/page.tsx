import { ReferralsBoard } from '@/components/admin/ReferralsBoard'
import { PageHeader } from '@/components/admin/ui'

export default function AdminPage() {
  return (
    <>
      <PageHeader eyebrow="Growth" title="Referrals" subtitle="Review and approve customer referrals before crediting both sides." />
      <ReferralsBoard />
    </>
  )
}
