import { OrdersBoard } from '@/components/admin/OrdersBoard'

export default function AdminOrdersPage() {
  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Orders</h1>
      <OrdersBoard />
    </div>
  )
}
