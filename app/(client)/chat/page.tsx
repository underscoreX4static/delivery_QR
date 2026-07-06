import { ChatThread } from '@/components/client/ChatThread'

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>
}) {
  const { order } = await searchParams

  if (!order) {
    return <div className="flex min-h-dvh items-center justify-center p-6 text-center text-neutral-600">No order specified.</div>
  }

  return <ChatThread orderId={order} />
}
