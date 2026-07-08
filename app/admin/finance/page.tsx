import { FinanceBoard } from '@/components/admin/FinanceBoard'

export default function AdminFinancePage() {
  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold">Finance</h1>
      <p className="mb-4 text-sm text-muted">
        How much margin you can afford to burn on growth — and how many weeks of runway it leaves you.
      </p>
      <FinanceBoard />
    </div>
  )
}
