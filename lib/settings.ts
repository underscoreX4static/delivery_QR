import { supabaseAdmin } from '@/lib/supabase'
import type { PricingSettings } from '@/lib/calculations'

export interface StoreSettings extends PricingSettings {
  openTime: string // "HH:mm" in UTC+10
  closeTime: string // "HH:mm" in UTC+10, "24:00" means midnight
  isManuallyClosed: boolean
  reorderDaysDefault: number
}

const DEFAULTS: StoreSettings = {
  openTime: '10:00',
  closeTime: '24:00',
  isManuallyClosed: false,
  deliveryFee: 10,
  freeDeliveryThreshold: 150,
  discountThreshold: 250,
  discountRate: 0.1,
  reorderDaysDefault: 7,
}

export async function getSettings(): Promise<StoreSettings> {
  const { data, error } = await supabaseAdmin.from('settings').select('key, value')
  if (error || !data) return DEFAULTS

  const map = Object.fromEntries(data.map((row) => [row.key, row.value]))

  return {
    openTime: map.open_time ?? DEFAULTS.openTime,
    closeTime: map.close_time ?? DEFAULTS.closeTime,
    isManuallyClosed: map.is_manually_closed === 'true',
    deliveryFee: Number(map.delivery_fee ?? DEFAULTS.deliveryFee),
    freeDeliveryThreshold: Number(map.free_delivery_threshold ?? DEFAULTS.freeDeliveryThreshold),
    discountThreshold: Number(map.discount_threshold ?? DEFAULTS.discountThreshold),
    discountRate: Number(map.discount_rate ?? DEFAULTS.discountRate),
    reorderDaysDefault: Number(map.reorder_days_default ?? DEFAULTS.reorderDaysDefault),
  }
}

export async function updateSetting(key: string, value: string, updatedBy: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('settings')
    .update({ value, updated_by: updatedBy, updated_at: new Date().toISOString() })
    .eq('key', key)

  if (error) throw new Error(`Failed to update setting ${key}: ${error.message}`)
}
