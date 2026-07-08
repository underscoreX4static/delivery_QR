import { PartnersSubNav } from '@/components/admin/PartnersSubNav'

// Drivers and Commercials share this layout so they read as one "Partners"
// section with sub-tabs. The route group keeps their URLs (/admin/drivers,
// /admin/partners) unchanged — only the chrome is unified.
export default function PartnersLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <h1 className="mb-3 text-xl font-semibold">Partners</h1>
      <PartnersSubNav />
      {children}
    </div>
  )
}
