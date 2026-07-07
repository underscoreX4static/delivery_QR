import { DriverDetail } from '@/components/admin/DriverDetail'

export default async function AdminDriverDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <DriverDetail driverId={id} />
}
