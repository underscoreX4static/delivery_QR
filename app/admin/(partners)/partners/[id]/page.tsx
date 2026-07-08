import { PartnerDetail } from '@/components/admin/PartnerDetail'

export default async function AdminPartnerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <PartnerDetail partnerId={id} />
}
