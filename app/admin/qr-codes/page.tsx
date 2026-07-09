import { QrCodesBoard } from '@/components/admin/QrCodesBoard'
import { PageHeader } from '@/components/admin/ui'

export default function AdminPage() {
  return (
    <>
      <PageHeader eyebrow="Growth" title="QR Codes" subtitle="Generate partner attribution codes and track their conversion." />
      <QrCodesBoard />
    </>
  )
}
