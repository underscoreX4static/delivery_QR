import { OrderApp } from '@/components/client/OrderApp'

export default async function OrderPage({
  searchParams,
}: {
  searchParams: Promise<{ qr?: string }>
}) {
  const { qr } = await searchParams
  return <OrderApp qrSlugFromUrl={qr ?? null} />
}
