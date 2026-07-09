import { ProductsBoard } from '@/components/admin/ProductsBoard'
import { PageHeader } from '@/components/admin/ui'

export default function AdminPage() {
  return (
    <>
      <PageHeader eyebrow="Operations" title="Products" subtitle="Catalogue, per-product batches, and CSV bulk import." />
      <ProductsBoard />
    </>
  )
}
