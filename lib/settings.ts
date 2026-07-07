import { supabaseAdmin } from '@/lib/supabase'
import type { PricingSettings } from '@/lib/calculations'

// Store hours / manual open-closed override live in lib/slots.ts's
// getSlotSettings() (per-weekday hours + force-open/closed) — this file
// only owns pricing and inventory-intelligence settings.
export interface StoreSettings extends PricingSettings {
  reorderDaysDefault: number
  /** Share of the owner's net profit per partner-attributed order that funds that partner's bonus pool. */
  bonusPoolRate: number
}

const DEFAULTS: StoreSettings = {
  deliveryFee: 10,
  freeDeliveryThreshold: 100,
  discountThreshold: 175,
  discountRate: 0.1,
  discountThreshold2: 250,
  discountRate2: 0.15,
  reorderDaysDefault: 7,
  bonusPoolRate: 0.1,
}

export async function getSettings(): Promise<StoreSettings> {
  const { data, error } = await supabaseAdmin.from('settings').select('key, value')
  if (error || !data) return DEFAULTS

  const map = Object.fromEntries(data.map((row) => [row.key, row.value]))

  return {
    deliveryFee: Number(map.delivery_fee ?? DEFAULTS.deliveryFee),
    freeDeliveryThreshold: Number(map.free_delivery_threshold ?? DEFAULTS.freeDeliveryThreshold),
    discountThreshold: Number(map.discount_threshold ?? DEFAULTS.discountThreshold),
    discountRate: Number(map.discount_rate ?? DEFAULTS.discountRate),
    discountThreshold2: Number(map.discount_threshold_2 ?? DEFAULTS.discountThreshold2),
    discountRate2: Number(map.discount_rate_2 ?? DEFAULTS.discountRate2),
    reorderDaysDefault: Number(map.reorder_days_default ?? DEFAULTS.reorderDaysDefault),
    bonusPoolRate: Number(map.bonus_pool_rate ?? DEFAULTS.bonusPoolRate),
  }
}

export async function updateSetting(key: string, value: string, updatedBy: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('settings')
    .upsert({ key, value, updated_by: updatedBy, updated_at: new Date().toISOString() }, { onConflict: 'key' })

  if (error) throw new Error(`Failed to update setting ${key}: ${error.message}`)
}
