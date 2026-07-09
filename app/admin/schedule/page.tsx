import { ScheduleBoard } from '@/components/admin/ScheduleBoard'
import { PageHeader } from '@/components/admin/ui'

export default function AdminPage() {
  return (
    <>
      <PageHeader eyebrow="Config" title="Schedule" subtitle="When orders really land — by hour and by weekday." />
      <ScheduleBoard />
    </>
  )
}
