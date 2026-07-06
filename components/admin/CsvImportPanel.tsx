'use client'

import { useState } from 'react'
import Papa from 'papaparse'

interface ImportRow {
  category_name: string
  subcategory?: string
  brand?: string
  product_name: string
  variant_size?: string
  description?: string
  price_sell: string
  price_cost: string
  stock_qty: string
  image_url?: string
  is_active?: string
}

interface ImportSummary {
  imported: number
  created_products: number
  updated_products: number
  created_categories: number
  errors: { row: number; error: string }[]
}

const EXPECTED_HEADERS = [
  'category_name',
  'subcategory',
  'brand',
  'product_name',
  'variant_size',
  'description',
  'price_sell',
  'price_cost',
  'stock_qty',
  'image_url',
  'is_active',
]

export function CsvImportPanel({ onImported }: { onImported: () => void }) {
  const [rows, setRows] = useState<ImportRow[]>([])
  const [importing, setImporting] = useState(false)
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)

  const handleFile = (file: File) => {
    setSummary(null)
    setParseError(null)
    Papa.parse<ImportRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0) {
          setParseError(results.errors[0].message)
          return
        }
        setRows(results.data)
      },
    })
  }

  const confirmImport = async () => {
    setImporting(true)
    try {
      const res = await fetch('/api/admin/catalogue/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      })
      const data = await res.json()
      setSummary(data)
      if (res.ok) {
        setRows([])
        onImported()
      }
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <h2 className="text-sm font-semibold">CSV bulk import</h2>
      <p className="mt-1 text-xs text-neutral-500">
        Headers: {EXPECTED_HEADERS.join(', ')}
      </p>
      <input
        type="file"
        accept=".csv"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        className="mt-2 text-xs"
      />

      {parseError && <p className="mt-2 text-xs text-red-600">{parseError}</p>}

      {rows.length > 0 && (
        <div className="mt-3">
          <div className="max-h-64 overflow-auto rounded-lg border border-neutral-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50">
                <tr>
                  {EXPECTED_HEADERS.map((h) => (
                    <th key={h} className="px-2 py-1 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className="border-t border-neutral-100">
                    {EXPECTED_HEADERS.map((h) => (
                      <td key={h} className="px-2 py-1">
                        {String(row[h as keyof ImportRow] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            onClick={confirmImport}
            disabled={importing}
            className="mt-2 rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            {importing ? 'Importing…' : `Import ${rows.length} rows`}
          </button>
        </div>
      )}

      {summary && (
        <div className="mt-3 rounded-lg bg-neutral-50 p-3 text-xs">
          <p>
            Imported {summary.imported} · {summary.created_products} new products ·{' '}
            {summary.updated_products} updated · {summary.created_categories} new categories
          </p>
          {summary.errors.length > 0 && (
            <ul className="mt-1 list-disc pl-4 text-red-600">
              {summary.errors.map((e, i) => (
                <li key={i}>
                  Row {e.row}: {e.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
