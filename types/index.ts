// Database enum types (must match Postgres enums exactly)
export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'on_the_way'
  | 'delivered'
  | 'cancelled'

export type SettlementType = 'driver' | 'partner'

export type SettlementStatus = 'proposed' | 'confirmed' | 'paid' | 'payment_received'

export type VelocityTier = 'bestseller' | 'normal' | 'slow_mover'

export type SenderRole = 'customer' | 'driver' | 'owner'

export interface Partner {
  id: string
  name: string
  address: string | null
  contact_name: string | null
  contact_phone: string | null
  commission_rate: number
  is_active: boolean
  created_at: string
  /** Requires migration: alter table partners add column if not exists telegram_id text; */
  telegram_id?: string | null
  /**
   * Flat one-time bonus paid on this commercial's first-ever delivered
   * referral — modulable per commercial (some get $5, some $10+) rather
   * than a fixed platform-wide amount.
   * Requires migration: alter table partners add column if not exists first_sale_bonus_amount decimal(10,2) not null default 10;
   */
  first_sale_bonus_amount?: number
  /** Requires migration: alter table partners add column if not exists first_sale_bonus_paid boolean not null default false; */
  first_sale_bonus_paid?: boolean
}

export interface QrCode {
  id: string
  partner_id: string
  slug: string
  label: string | null
  is_active: boolean
  created_at: string
}

export interface QrScan {
  id: string
  qr_code_id: string
  user_id: string | null
  telegram_user_id: string | null
  scanned_at: string
}

export interface User {
  id: string
  telegram_id: string
  first_name: string | null
  last_name: string | null
  phone: string | null
  default_address: string | null
  first_qr_source: string | null
  created_at: string
  /** Requires migration: alter table users add column if not exists notes text; */
  notes?: string | null
}

export interface Category {
  id: string
  name: string
  image_url: string | null
  sort_order: number
  is_active: boolean
}

export interface Product {
  id: string
  category_id: string
  name: string
  brand: string | null
  subcategory: string | null
  description: string | null
  image_url: string | null
  stock_qty: number
  target_margin: number
  velocity_tier: VelocityTier
  avg_daily_units: number
  is_active: boolean
  created_at: string
  /** Requires migration: alter table products add column if not exists last_restock_alert_at timestamptz; */
  last_restock_alert_at?: string | null
}

export interface ProductBatch {
  id: string
  product_id: string
  quantity_total: number
  quantity_remaining: number
  cost_price: number
  sell_price: number
  supplier: string | null
  received_at: string
  is_active: boolean
  created_at: string
}

export interface Driver {
  id: string
  telegram_id: string
  first_name: string
  last_name: string | null
  is_owner: boolean
  is_active: boolean
  created_at: string
  /** Requires migration: alter table drivers add column if not exists bonus_pool_balance decimal(10,2) not null default 0; */
  bonus_pool_balance?: number
}

export interface DriverBonus {
  id: string
  driver_id: string
  milestone_orders: number
  bonus_amount: number
  paid_out: boolean
  paid_out_at: string | null
  created_at: string
}

export interface Order {
  id: string
  user_id: string
  qr_code_id: string | null
  driver_id: string | null
  status: OrderStatus
  delivery_address: string
  delivery_fee: number
  subtotal: number
  discount: number
  total: number
  notes: string | null
  scheduled_at: string | null
  created_at: string
  updated_at: string
}

export interface OrderItem {
  id: string
  order_id: string
  product_id: string
  batch_id: string
  quantity: number
  unit_sell_price: number
  unit_cost_price: number
  line_total: number
}

export interface OrderStatusHistory {
  id: string
  order_id: string
  status: OrderStatus
  changed_at: string
  changed_by: string | null
}

export interface OrderMessage {
  id: string
  order_id: string
  sender_role: SenderRole
  sender_id: string
  content: string
  created_at: string
}

export interface Settlement {
  id: string
  type: SettlementType
  status: SettlementStatus
  driver_id: string | null
  period_start: string
  period_end: string
  total_cash: number
  payout_amount: number
  proposed_by: string
  proposed_at: string
  confirmed_at: string | null
  payment_confirmed_at: string | null
  notes: string | null
}

export interface SettlementOrder {
  settlement_id: string
  order_id: string
}

export interface AffiliateCommission {
  id: string
  partner_id: string
  order_id: string
  order_total: number
  commission_rate: number
  commission_amount: number
  paid_out: boolean
  paid_out_at: string | null
  created_at: string
}

export interface Setting {
  key: string
  value: string
  updated_at: string
  updated_by: string | null
}

// Composed / derived shapes used across the app

export interface ProductWithBatches extends Product {
  batches: ProductBatch[]
  active_batch: ProductBatch | null
  current_price: number | null
}

export interface CartLineItem {
  product_id: string
  quantity: number
}

export interface BatchConsumption {
  batch_id: string
  product_id: string
  quantity: number
  unit_sell_price: number
  unit_cost_price: number
  line_total: number
}

export interface ConsumptionPlan {
  items: BatchConsumption[]
  subtotal: number
  split_batch_products: string[] // product_ids split across >1 batch
  insufficient_stock: { product_id: string; requested: number; available: number }[]
}

export interface CartPreview {
  plan: ConsumptionPlan
  subtotal: number
  delivery_fee: number
  discount: number
  discount_rate: number
  total: number
}

export interface PayoutBreakdown {
  revenue: number
  cost: number
  grossProfit: number
  driverPayout: number
  affiliateCommission: number
  ownerNet: number
}
