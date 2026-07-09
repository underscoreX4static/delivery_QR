import { FinanceBoard } from '@/components/admin/FinanceBoard'
import { PageHeader } from '@/components/admin/ui'

export default function AdminFinancePage() {
  return (
    <>
      <PageHeader
        eyebrow="Money"
        title="How much you can burn"
        subtitle="The margin you can spend on growth right now — and how many weeks of runway it leaves you."
      />
      <FinanceBoard />
    </>
  )
}
