import { PartnersSubNav } from '@/components/admin/PartnersSubNav'
import { PageHeader } from '@/components/admin/ui'

// Drivers and Commercials share this layout so they read as one "Partners"
// section with sub-tabs. The route group keeps their URLs (/admin/drivers,
// /admin/partners) unchanged — only the chrome is unified.
export default function PartnersLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <PageHeader
        eyebrow="Growth"
        title="Partners"
        subtitle="Your drivers and your commercials — deliveries, bonuses, and commission in one place."
      />
      <PartnersSubNav />
      {children}
    </div>
  )
}
